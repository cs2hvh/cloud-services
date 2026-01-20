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

import { CoreV1Api, V1Pod, CoreV1Event } from '@kubernetes/client-node';
import kubeConfig from '@/lib/kubernetes';
import { Readable, PassThrough } from 'stream';

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
   * NOTE: Filters out terminating pods (deletionTimestamp set) and completed pods
   * to show only active replicas. This prevents showing extra pods during rollouts.
   */
  static async listPods(appName: string, namespace = DEFAULT_NAMESPACE): Promise<PodSummary[]> {
    try {
      const api = this.getApi();
      const labelSelector = this.getAppLabel(appName);

      const response = await api.listNamespacedPod({
        namespace,
        labelSelector,
      });

      // Filter out terminating pods (being deleted) and completed/failed pods
      // This ensures we only show active replicas, not old pods during rollouts
      const activePods = response.items.filter((pod: V1Pod) => {
        // Exclude pods that are being deleted (terminating)
        if (pod.metadata?.deletionTimestamp) return false;
        
        // Exclude completed/succeeded pods (jobs that finished)
        if (pod.status?.phase === 'Succeeded') return false;
        
        // Exclude Pending pods - they haven't started yet and have no logs
        // This prevents showing stuck pods from failed rollouts
        if (pod.status?.phase === 'Pending') return false;
        
        // Exclude pods in Failed state that aren't restarting
        if (pod.status?.phase === 'Failed') {
          const containerStatuses = pod.status?.containerStatuses || [];
          const hasRestartPolicy = containerStatuses.some(c => c.restartCount > 0);
          if (!hasRestartPolicy) return false;
        }
        
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
   * Stream logs from a specific pod using Server-Sent Events format
   * Returns a readable stream that emits SSE-formatted data
   * 
   * IMPORTANT: Pass an AbortSignal to properly cleanup when client disconnects.
   * Without this, the K8s log stream keeps running and leaks resources.
   */
  static async streamLogs(
    podName: string,
    options: StreamOptions = {},
    namespace = DEFAULT_NAMESPACE,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const api = this.getApi();
    const encoder = new TextEncoder();
    
    // Track the K8s stream for cleanup
    let k8sStream: Readable | null = null;

    // Apply safe limits
    const tailLines = Math.min(options.tailLines || DEFAULT_TAIL_LINES, MAX_TAIL_LINES);
    const sinceSeconds = Math.min(options.sinceSeconds || DEFAULT_SINCE_SECONDS, MAX_SINCE_SECONDS);

    // Create a passthrough stream to convert K8s log stream to SSE format
    const passthrough = new PassThrough();
    
    // Cleanup function to stop K8s stream
    const cleanup = () => {
      if (k8sStream) {
        k8sStream.destroy();
        k8sStream = null;
      }
      if (!passthrough.destroyed) {
        passthrough.destroy();
      }
    };
    
    // Listen for abort signal (client disconnect)
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        console.log(`[RuntimeLogsService] Client disconnected, stopping stream for ${podName}`);
        cleanup();
      });
    }

    // Start the log stream in the background
    (async () => {
      try {
        // Get log stream with follow=true
        const logStream = await api.readNamespacedPodLog({
          name: podName,
          namespace,
          container: options.container,
          follow: options.follow !== false, // Default to true for streaming
          previous: options.previous || false,
          sinceSeconds,
          tailLines,
          timestamps: true,
        });

        // If it's a string (non-follow response), write it and end
        if (typeof logStream === 'string') {
          const lines = logStream.split('\n').filter(Boolean);
          for (const line of lines) {
            const entry = this.parseLogLine(line, podName, options.container);
            passthrough.write(`data: ${JSON.stringify(entry)}\n\n`);
          }
          passthrough.end();
          return;
        }

        // If it's a stream, pipe it through
        if (logStream && typeof (logStream as Readable).on === 'function') {
          const stream = logStream as Readable;
          k8sStream = stream; // Store reference for cleanup
          let buffer = '';

          stream.on('data', (chunk: Buffer | string) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.trim()) {
                const entry = this.parseLogLine(line, podName, options.container);
                passthrough.write(`data: ${JSON.stringify(entry)}\n\n`);
              }
            }
          });

          stream.on('end', () => {
            if (buffer.trim()) {
              const entry = this.parseLogLine(buffer, podName, options.container);
              passthrough.write(`data: ${JSON.stringify(entry)}\n\n`);
            }
            passthrough.write(`data: ${JSON.stringify({ type: 'end', message: 'Log stream ended' })}\n\n`);
            passthrough.end();
          });

          stream.on('error', (err: Error) => {
            console.error(`[RuntimeLogsService] Stream error for ${podName}:`, err.message);
            passthrough.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
            passthrough.end();
          });
        } else {
          passthrough.write(`data: ${JSON.stringify({ type: 'error', message: 'Unexpected log response format' })}\n\n`);
          passthrough.end();
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[RuntimeLogsService] streamLogs error for ${podName}:`, errorMessage);
        passthrough.write(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`);
        passthrough.end();
      }
    })();

    // Convert Node.js stream to Web ReadableStream
    return new ReadableStream({
      start(controller) {
        passthrough.on('data', (chunk: Buffer) => {
          controller.enqueue(encoder.encode(chunk.toString()));
        });
        passthrough.on('end', () => {
          controller.close();
        });
        passthrough.on('error', (err: Error) => {
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
        const timeA = a.lastTimestamp?.getTime() || (a.eventTime ? new Date(a.eventTime as string).getTime() : 0);
        const timeB = b.lastTimestamp?.getTime() || (b.eventTime ? new Date(b.eventTime as string).getTime() : 0);
        return timeB - timeA;
      });

      // Take last 50 events
      return relevantEvents.slice(0, 50).map((event: CoreV1Event) => ({
        type: (event.type as 'Normal' | 'Warning') || 'Normal',
        reason: event.reason || 'Unknown',
        message: event.message || '',
        count: event.count || 1,
        firstTimestamp: event.firstTimestamp?.toISOString() || null,
        lastTimestamp: event.lastTimestamp?.toISOString() || (event.eventTime ? new Date(event.eventTime as string).toISOString() : null),
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
