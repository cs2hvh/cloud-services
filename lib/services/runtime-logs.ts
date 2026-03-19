/**
 * Runtime Logs Service - Stream application logs from Kubernetes pods
 * 
 * This service provides access to runtime logs (stdout/stderr) from deployed applications.
 * It uses the Kubernetes API directly to stream logs, NOT Jenkins.
 * 
 * Architecture:
 * - Jenkins handles BUILD logs only (during CI/CD pipeline)
 * - This service handles RUNTIME logs (from running pods)
 * - These are completely separate concerns
 */

import { CoreV1Api, V1Pod, CoreV1Event, Log } from '@kubernetes/client-node';
import kubeConfig from '@/lib/kubernetes';
import { PassThrough } from 'stream';

// Default namespace for platform apps
const DEFAULT_NAMESPACE = 'default';

// Safe defaults to prevent resource exhaustion
const DEFAULT_TAIL_LINES = 500;
const MAX_TAIL_LINES = 5000;
const DEFAULT_SINCE_SECONDS = 3600; // 1 hour
const MAX_SINCE_SECONDS = 86400; // 24 hours

export interface PodSummary {
  name: string;
  status: 'Running' | 'Pending' | 'Succeeded' | 'Failed' | 'Unknown';
  ready: boolean;
  restartCount: number;
  startTime: string | null;
  containers: string[];
}

export interface LogOptions {
  tailLines?: number;
  sinceSeconds?: number;
  container?: string;
  previous?: boolean;
}

export interface StreamOptions extends LogOptions {
  follow?: boolean;
}

export interface LogEntry {
  timestamp: string;
  pod: string;
  container: string;
  message: string;
}

export interface K8sEvent {
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  count: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  source: string;
}

export class RuntimeLogsService {
  private static coreApi: CoreV1Api | null = null;

  /**
   * Get or create the Kubernetes CoreV1Api client
   */
  private static getApi(): CoreV1Api {
    if (!this.coreApi) {
      this.coreApi = kubeConfig.makeApiClient(CoreV1Api);
    }
    return this.coreApi;
  }

  /**
   * Get the deployment label for an app
   * Apps are deployed with label: app={appName}-app
   */
  private static getAppLabel(appName: string): string {
    return `app=${appName}-app`;
  }

  /**
   * List all pods for an application
   * Returns pods matching the app's label selector
   * 
   * NOTE: Shows ALL pods including Pending/Failed so users can see replica status.
   * Only filters out terminating pods (being deleted during rollouts).
   */
  static async listPods(appName: string, namespace = DEFAULT_NAMESPACE): Promise<PodSummary[]> {
    try {
      const api = this.getApi();
      const labelSelector = this.getAppLabel(appName);

      const response = await api.listNamespacedPod({
        namespace,
        labelSelector,
      });

      // Only filter out pods that are being deleted (terminating during rollouts)
      // Show ALL other pods (Running, Pending, Failed) so users can see full replica status
      const activePods = response.items.filter((pod: V1Pod) => {
        // Exclude pods that are being deleted (terminating)
        if (pod.metadata?.deletionTimestamp) return false;
        
        // Exclude completed/succeeded pods (jobs that finished)
        if (pod.status?.phase === 'Succeeded') return false;
        
        // Include Pending pods - users need to see stuck replicas
        // Include Failed pods - users need to see crashed replicas
        // Include Running pods - normal healthy replicas
        return true;
      });

      return activePods.map((pod: V1Pod) => this.podToSummary(pod));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RuntimeLogsService] listPods error for ${appName}:`, errorMessage);
      throw new Error(`Failed to list pods: ${errorMessage}`);
    }
  }

  /**
   * Convert a V1Pod to a simplified PodSummary
   */
  private static podToSummary(pod: V1Pod): PodSummary {
    const containerStatuses = pod.status?.containerStatuses || [];
    const totalRestarts = containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0);
    const allReady = containerStatuses.length > 0 && containerStatuses.every(c => c.ready);
    const containerNames = (pod.spec?.containers || []).map(c => c.name);

    return {
      name: pod.metadata?.name || '',
      status: (pod.status?.phase as PodSummary['status']) || 'Unknown',
      ready: allReady,
      restartCount: totalRestarts,
      startTime: pod.status?.startTime?.toISOString() || null,
      containers: containerNames,
    };
  }

  /**
   * Get logs for a specific pod (non-streaming, returns full text)
   * Useful for initial log load or downloading logs
   */
  static async getLogs(
    podName: string,
    options: LogOptions = {},
    namespace = DEFAULT_NAMESPACE
  ): Promise<string> {
    try {
      const api = this.getApi();

      // Apply safe limits
      const tailLines = Math.min(options.tailLines || DEFAULT_TAIL_LINES, MAX_TAIL_LINES);
      const sinceSeconds = Math.min(options.sinceSeconds || DEFAULT_SINCE_SECONDS, MAX_SINCE_SECONDS);

      const response = await api.readNamespacedPodLog({
        name: podName,
        namespace,
        container: options.container,
        follow: false,
        previous: options.previous || false,
        sinceSeconds,
        tailLines,
        timestamps: true, // Include timestamps in log output
      });

      // Response is the log content as a string
      return response || '';
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RuntimeLogsService] getLogs error for ${podName}:`, errorMessage);
      
      // If pod doesn't have logs yet (Pending/ContainerCreating/Failed without started container)
      // Return empty string instead of throwing - the frontend will show appropriate status
      if (errorMessage.includes('Cannot parse content') || 
          errorMessage.includes('ContainerCreating') ||
          errorMessage.includes('PodInitializing') ||
          errorMessage.includes('container') && errorMessage.includes('not found')) {
        console.log(`[RuntimeLogsService] Pod ${podName} has no logs yet (likely Pending/Creating)`);
        return '';
      }
      
      throw new Error(`Failed to get logs: ${errorMessage}`);
    }
  }

  /**
   * Get logs for all pods of an application
   * Returns aggregated logs with pod name prefix
   */
  static async getLogsForApp(
    appName: string,
    options: LogOptions = {},
    namespace = DEFAULT_NAMESPACE
  ): Promise<{ pod: string; logs: string }[]> {
    const pods = await this.listPods(appName, namespace);
    
    if (pods.length === 0) {
      return [];
    }

    // Fetch logs from all pods in parallel
    const results = await Promise.allSettled(
      pods.map(async (pod) => ({
        pod: pod.name,
        logs: await this.getLogs(pod.name, options, namespace),
      }))
    );

    // Return successful results, skip failed ones
    return results
      .filter((r): r is PromiseFulfilledResult<{ pod: string; logs: string }> => 
        r.status === 'fulfilled'
      )
      .map(r => r.value);
  }

  /**
   * Stream logs from a specific pod using Server-Sent Events format.
   * Returns a Web ReadableStream that emits SSE-formatted JSON events.
   *
   * Uses the @kubernetes/client-node `Log` class for true HTTP streaming.
   * The OpenAPI-generated `readNamespacedPodLog({ follow: true })` awaits the
   * entire response body which never resolves for a live pod — the Log class
   * pipes the response directly into a Writable stream as lines arrive.
   *
   * IMPORTANT: Pass an AbortSignal to stop the K8s stream on client disconnect.
   */
  static async streamLogs(
    podName: string,
    options: StreamOptions = {},
    namespace = DEFAULT_NAMESPACE,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder();

    // Apply safe limits
    const tailLines = Math.min(options.tailLines ?? DEFAULT_TAIL_LINES, MAX_TAIL_LINES);
    const sinceSeconds = Math.min(options.sinceSeconds ?? DEFAULT_SINCE_SECONDS, MAX_SINCE_SECONDS);

    // sseStream is what we expose to the browser — SSE-formatted JSON lines.
    // rawStream receives raw K8s log lines which we transform into SSE events.
    const sseStream = new PassThrough();
    const rawStream = new PassThrough();

    let rawBuffer = '';

    const safeWrite = (payload: string) => {
      if (!sseStream.destroyed) sseStream.write(payload);
    };

    rawStream.on('data', (chunk: Buffer | string) => {
      rawBuffer += chunk.toString();
      const lines = rawBuffer.split('\n');
      rawBuffer = lines.pop() || ''; // Keep incomplete line in buffer
      for (const line of lines) {
        if (line.trim()) {
          const entry = RuntimeLogsService.parseLogLine(line, podName, options.container);
          safeWrite(`data: ${JSON.stringify(entry)}\n\n`);
        }
      }
    });

    rawStream.on('end', () => {
      if (rawBuffer.trim()) {
        const entry = RuntimeLogsService.parseLogLine(rawBuffer, podName, options.container);
        safeWrite(`data: ${JSON.stringify(entry)}\n\n`);
      }
      safeWrite(`data: ${JSON.stringify({ type: 'end', message: 'Log stream ended' })}\n\n`);
      if (!sseStream.destroyed) sseStream.end();
    });

    rawStream.on('error', (err: Error) => {
      console.error(`[RuntimeLogsService] Raw stream error for ${podName}:`, err.message);
      safeWrite(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      if (!sseStream.destroyed) sseStream.end();
    });

    let logAbortController: AbortController | null = null;

    const cleanup = () => {
      if (logAbortController) {
        logAbortController.abort();
        logAbortController = null;
      }
      if (!rawStream.destroyed) rawStream.destroy();
      if (!sseStream.destroyed) sseStream.destroy();
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        console.log(`[RuntimeLogsService] Client disconnected, stopping stream for ${podName}`);
        cleanup();
      });
    }

    // Start streaming via the Log helper — this properly handles follow=true
    // by piping the Kubernetes HTTP response body directly into rawStream.
    const logHelper = new Log(kubeConfig);
    logHelper
      .log(namespace, podName, options.container || '', rawStream, {
        follow: true,
        tailLines,
        sinceSeconds: options.previous ? undefined : sinceSeconds,
        timestamps: true,
        previous: options.previous,
      })
      .then((controller) => {
        // Guard: if the client already disconnected before the K8s stream
        // connected, abort immediately so we don't leak the HTTP connection.
        if (abortSignal?.aborted) {
          controller.abort();
        } else {
          logAbortController = controller;
        }
      })
      .catch((error: Error) => {
        console.error(`[RuntimeLogsService] streamLogs error for ${podName}:`, error.message);
        if (!sseStream.destroyed) {
          sseStream.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
          sseStream.end();
        }
      });

    // Convert Node.js PassThrough to a Web ReadableStream for Next.js Response
    return new ReadableStream({
      start(controller) {
        sseStream.on('data', (chunk: Buffer) => {
          controller.enqueue(encoder.encode(chunk.toString()));
        });
        sseStream.on('end', () => {
          controller.close();
        });
        sseStream.on('error', (err: Error) => {
          controller.error(err);
        });
      },
      cancel() {
        console.log(`[RuntimeLogsService] Stream cancelled for ${podName}`);
        cleanup();
      },
    });
  }

  /**
   * Parse a log line with timestamp prefix
   * Format: "2024-01-05T10:00:00.000Z Log message here"
   */
  private static parseLogLine(line: string, podName: string, container?: string): LogEntry {
    // Kubernetes timestamps are in RFC3339Nano format at the start of the line
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(.*)$/);
    
    if (timestampMatch) {
      return {
        timestamp: timestampMatch[1],
        pod: podName,
        container: container || 'main',
        message: timestampMatch[2],
      };
    }

    // No timestamp found, use current time
    return {
      timestamp: new Date().toISOString(),
      pod: podName,
      container: container || 'main',
      message: line,
    };
  }

  /**
   * Get Kubernetes events for an application
   * Events include: CrashLoopBackOff, OOMKilled, ImagePullBackOff, FailedScheduling, etc.
   */
  static async getEvents(appName: string, namespace = DEFAULT_NAMESPACE): Promise<K8sEvent[]> {
    try {
      const api = this.getApi();
      const deploymentName = `${appName}-app`;

      // Get events for both deployment and pods
      const response = await api.listNamespacedEvent({
        namespace,
        // Field selector to filter events for our app's resources
        // This catches events for deployments, pods, and replicasets
      });

      // Filter events related to our app
      const relevantEvents = response.items.filter((event: CoreV1Event) => {
        const involvedName = event.involvedObject?.name || '';
        return (
          involvedName === deploymentName ||
          involvedName.startsWith(`${deploymentName}-`) ||
          involvedName.startsWith(`${appName}-app-`)
        );
      });

      // Sort by last timestamp (most recent first)
      relevantEvents.sort((a: CoreV1Event, b: CoreV1Event) => {
        const timeA = a.lastTimestamp?.getTime() || (a.eventTime ? new Date(a.eventTime as unknown as string).getTime() : 0);
        const timeB = b.lastTimestamp?.getTime() || (b.eventTime ? new Date(b.eventTime as unknown as string).getTime() : 0);
        return timeB - timeA;
      });

      // Take last 50 events
      return relevantEvents.slice(0, 50).map((event: CoreV1Event) => ({
        type: (event.type as 'Normal' | 'Warning') || 'Normal',
        reason: event.reason || 'Unknown',
        message: event.message || '',
        count: event.count || 1,
        firstTimestamp: event.firstTimestamp?.toISOString() || null,
        lastTimestamp: event.lastTimestamp?.toISOString() || (event.eventTime ? new Date(event.eventTime as unknown as string).toISOString() : null),
        source: event.source?.component || 'unknown',
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RuntimeLogsService] getEvents error for ${appName}:`, errorMessage);
      throw new Error(`Failed to get events: ${errorMessage}`);
    }
  }

  /**
   * Get previous container logs (from crashed/restarted container)
   * Useful for debugging crash loops
   */
  static async getPreviousLogs(
    podName: string,
    container?: string,
    namespace = DEFAULT_NAMESPACE
  ): Promise<string> {
    return this.getLogs(podName, { previous: true, container }, namespace);
  }

  /**
   * Health check: verify we can connect to the cluster
   */
  static async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const api = this.getApi();
      await api.listNamespacedPod({
        namespace: DEFAULT_NAMESPACE,
        limit: 1,
      });
      return { healthy: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { healthy: false, error: errorMessage };
    }
  }
}
