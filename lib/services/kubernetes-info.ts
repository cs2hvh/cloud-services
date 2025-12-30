/**
 * Kubernetes Info Service - Fetches detailed pod/deployment information
 * 
 * Uses the Kubernetes API directly to get resource details, events, and status.
 */

import {
  CoreV1Api,
  AppsV1Api,
  NetworkingV1Api,
  V1ContainerState,
} from '@kubernetes/client-node';
import kubeConfig from '@/lib/kubernetes';

// Interfaces for structured data
export interface PodInfo {
  name: string;
  namespace: string;
  nodeName: string;
  nodeIP: string;
  podIP: string;
  phase: string;
  startTime: string;
  uptime: string;
  containers: ContainerInfo[];
  conditions: PodCondition[];
}

export interface ContainerInfo {
  name: string;
  image: string;
  imageTag: string;
  imageID?: string;
  ready: boolean;
  restartCount: number;
  startedAt: string;
  state: string;
  resources: ResourceSpec;
}

export interface ContainerImageInfo {
  name: string;
  image: string;
  imageTag: string;
  imageID?: string;
}

export interface AppImageSnapshot {
  appName: string;
  namespace: string;
  deploymentImages: ContainerImageInfo[];
  podImages: ContainerImageInfo[];
  timestamp: string;
}

export interface ResourceSpec {
  requests: {
    cpu: string;
    memory: string;
  };
  limits: {
    cpu: string;
    memory: string;
  };
}

export interface PodCondition {
  type: string;
  status: string;
  lastTransitionTime: string;
}

export interface DeploymentInfo {
  name: string;
  namespace: string;
  replicas: number;
  availableReplicas: number;
  readyReplicas: number;
  strategy: string;
  createdAt: string;
  generation: number;
  conditions: DeploymentCondition[];
}

export interface DeploymentCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface NetworkInfo {
  ingressHost: string;
  tlsEnabled: boolean;
  tlsSecretName: string | null;
  serviceName: string;
  servicePort: number;
}

export interface EventInfo {
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  lastTimestamp: string;
  count: number;
}

export interface AppDetails {
  pod: PodInfo | null;
  deployment: DeploymentInfo | null;
  network: NetworkInfo | null;
  events: EventInfo[];
  timestamp: string;
}

export class KubernetesInfoService {
  private static coreApi: CoreV1Api | null = null;
  private static appsApi: AppsV1Api | null = null;
  private static networkingApi: NetworkingV1Api | null = null;

  private static getApis() {
    if (!this.coreApi) {
      this.coreApi = kubeConfig.makeApiClient(CoreV1Api);
    }
    if (!this.appsApi) {
      this.appsApi = kubeConfig.makeApiClient(AppsV1Api);
    }
    if (!this.networkingApi) {
      this.networkingApi = kubeConfig.makeApiClient(NetworkingV1Api);
    }
    return {
      core: this.coreApi,
      apps: this.appsApi,
      networking: this.networkingApi,
    };
  }

  /**
   * Calculate uptime from start time
   */
  private static calculateUptime(startTime: string): string {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  /**
   * Parse image string to get tag
   */
  private static parseImageTag(image: string): string {
    const parts = image.split(':');
    return parts.length > 1 ? parts[parts.length - 1] : 'latest';
  }

  /**
   * Patch the Deployment container image for an app.
   * Used for rollback (no build). Best-effort and returns structured status.
   */
  static async patchAppDeploymentImage(
    appName: string,
    image: string,
    namespace = 'default'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { apps } = this.getApis();
      const deploymentName = `${appName}-app`;

      // Use JSON Patch format (RFC 6902) for precise updates
      const jsonPatch = [
        {
          op: 'replace',
          path: '/spec/template/spec/containers/0/image',
          value: image,
        },
      ];

      await apps.patchNamespacedDeployment(
        {
          name: deploymentName,
          namespace,
          body: jsonPatch,
          fieldManager: 'cloud-services',
          // @ts-expect-error - headers option is valid but not in type definition
          headers: {
            'Content-Type': 'application/json-patch+json',
          },
        }
      );

      console.log(`[KubernetesInfoService] ✅ Patched deployment ${deploymentName} to image: ${image}`);
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[KubernetesInfoService] patchAppDeploymentImage error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get container images from the Deployment spec (what Kubernetes is configured to run)
   */
  static async getDeploymentImages(appName: string, namespace = 'default'): Promise<ContainerImageInfo[]> {
    try {
      const { apps } = this.getApis();
      const deploymentName = `${appName}-app`;

      const response = await apps.readNamespacedDeployment({
        name: deploymentName,
        namespace,
      });

      const containers = response.spec?.template?.spec?.containers || [];
      return containers.map((c) => ({
        name: c.name || '',
        image: c.image || '',
        imageTag: this.parseImageTag(c.image || ''),
        imageID: undefined,
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[KubernetesInfoService] getDeploymentImages error:', errorMessage);
      return [];
    }
  }

  /**
   * Snapshot both Deployment and Pod images (best-effort)
   */
  static async getAppImageSnapshot(appName: string, namespace = 'default'): Promise<AppImageSnapshot> {
    const [deploymentImages, podInfo] = await Promise.all([
      this.getDeploymentImages(appName, namespace),
      this.getPodInfo(appName, namespace),
    ]);

    const podImages: ContainerImageInfo[] = (podInfo?.containers || []).map((c) => ({
      name: c.name,
      image: c.image,
      imageTag: c.imageTag,
      imageID: c.imageID,
    }));

    return {
      appName,
      namespace,
      deploymentImages,
      podImages,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log current images to verify cluster connectivity and current rollout state.
   * This is intentionally best-effort and should never throw.
   */
  static async logAppImages(appName: string, context: string, namespace = 'default'): Promise<void> {
    try {
      const snap = await this.getAppImageSnapshot(appName, namespace);
      const dep = snap.deploymentImages.length
        ? snap.deploymentImages
        : [{ name: '(none)', image: '(not found)', imageTag: '(n/a)', imageID: '(n/a)' }];
      const pod = snap.podImages.length
        ? snap.podImages
        : [{ name: '(none)', image: '(not running)', imageTag: '(n/a)', imageID: '(n/a)' }];

      console.log(`[K8S Images] ${context} app=${appName} ns=${namespace} @ ${snap.timestamp}`);
      console.log(`[K8S Images] Deployment containers:`, dep);
      console.log(`[K8S Images] Pod containers:`, pod);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[K8S Images] ${context} app=${appName} failed:`, errorMessage);
    }
  }

  /**
   * Get container state as string
   */
  private static getContainerState(state: V1ContainerState | undefined): string {
    if (state?.running) return 'Running';
    if (state?.waiting) return `Waiting: ${state.waiting.reason || 'Unknown'}`;
    if (state?.terminated) return `Terminated: ${state.terminated.reason || 'Unknown'}`;
    return 'Unknown';
  }

  /**
   * Get pod information
   */
  static async getPodInfo(appName: string, namespace = 'default'): Promise<PodInfo | null> {
    try {
      const { core } = this.getApis();
      const deploymentName = `${appName}-app`;
      
      // List pods with label selector
      const response = await core.listNamespacedPod({
        namespace,
        labelSelector: `app=${deploymentName}`,
      });
      
      const pods = response.items;
      if (!pods || pods.length === 0) return null;
      
      // Get the first running pod
      const pod = pods.find(p => p.status?.phase === 'Running') || pods[0];
      
      const containerStatus = pod.status?.containerStatuses?.[0];
      const containerSpec = pod.spec?.containers?.[0];
      
      return {
        name: pod.metadata?.name || '',
        namespace: pod.metadata?.namespace || namespace,
        nodeName: pod.spec?.nodeName || '',
        nodeIP: pod.status?.hostIP || '',
        podIP: pod.status?.podIP || '',
        phase: pod.status?.phase || 'Unknown',
        startTime: pod.status?.startTime?.toISOString() || '',
        uptime: pod.status?.startTime 
          ? this.calculateUptime(pod.status.startTime.toISOString())
          : '',
        containers: [{
          name: containerStatus?.name || containerSpec?.name || '',
          image: containerStatus?.image || containerSpec?.image || '',
          imageTag: this.parseImageTag(containerStatus?.image || ''),
          imageID: containerStatus?.imageID,
          ready: containerStatus?.ready || false,
          restartCount: containerStatus?.restartCount || 0,
          startedAt: containerStatus?.state?.running?.startedAt?.toISOString() || '',
          state: this.getContainerState(containerStatus?.state),
          resources: {
            requests: {
              cpu: containerSpec?.resources?.requests?.cpu || '100m',
              memory: containerSpec?.resources?.requests?.memory || '128Mi',
            },
            limits: {
              cpu: containerSpec?.resources?.limits?.cpu || '500m',
              memory: containerSpec?.resources?.limits?.memory || '512Mi',
            },
          },
        }],
        conditions: (pod.status?.conditions || []).map(c => ({
          type: c.type || '',
          status: c.status || '',
          lastTransitionTime: c.lastTransitionTime?.toISOString() || '',
        })),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[KubernetesInfoService] getPodInfo error:', errorMessage);
      return null;
    }
  }

  /**
   * Get deployment information
   */
  static async getDeploymentInfo(appName: string, namespace = 'default'): Promise<DeploymentInfo | null> {
    try {
      const { apps } = this.getApis();
      const deploymentName = `${appName}-app`;
      
      const response = await apps.readNamespacedDeployment({
        name: deploymentName,
        namespace,
      });
      
      const deployment = response;
      
      return {
        name: deployment.metadata?.name || '',
        namespace: deployment.metadata?.namespace || namespace,
        replicas: deployment.spec?.replicas || 1,
        availableReplicas: deployment.status?.availableReplicas || 0,
        readyReplicas: deployment.status?.readyReplicas || 0,
        strategy: deployment.spec?.strategy?.type || 'RollingUpdate',
        createdAt: deployment.metadata?.creationTimestamp?.toISOString() || '',
        generation: deployment.metadata?.generation || 1,
        conditions: (deployment.status?.conditions || []).map(c => ({
          type: c.type || '',
          status: c.status || '',
          reason: c.reason || '',
          message: c.message || '',
        })),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[KubernetesInfoService] getDeploymentInfo error:', errorMessage);
      return null;
    }
  }

  /**
   * Get network/ingress information
   */
  static async getNetworkInfo(appName: string, namespace = 'default'): Promise<NetworkInfo | null> {
    try {
      const { networking } = this.getApis();
      const ingressName = `${appName}-ingress`;
      
      const response = await networking.readNamespacedIngress({
        name: ingressName,
        namespace,
      });
      
      const ingress = response;
      const rule = ingress.spec?.rules?.[0];
      const tls = ingress.spec?.tls?.[0];
      
      return {
        ingressHost: rule?.host || '',
        tlsEnabled: !!tls,
        tlsSecretName: tls?.secretName || null,
        serviceName: rule?.http?.paths?.[0]?.backend?.service?.name || '',
        servicePort: rule?.http?.paths?.[0]?.backend?.service?.port?.number || 80,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[KubernetesInfoService] getNetworkInfo error:', errorMessage);
      return null;
    }
  }

  /**
   * Get recent events for the app
   */
  static async getEvents(appName: string, namespace = 'default', limit = 5): Promise<EventInfo[]> {
    try {
      const { core } = this.getApis();
      const deploymentName = `${appName}-app`;
      
      // Get events for the deployment and its pods
      const response = await core.listNamespacedEvent({
        namespace,
        fieldSelector: `involvedObject.name=${deploymentName}`,
      });
      
      const events = response.items || [];
      
      // Sort by last timestamp and take the most recent
      const sortedEvents = events
        .filter(e => e.lastTimestamp)
        .sort((a, b) => {
          const timeA = new Date(a.lastTimestamp || 0).getTime();
          const timeB = new Date(b.lastTimestamp || 0).getTime();
          return timeB - timeA;
        })
        .slice(0, limit);
      
      return sortedEvents.map(e => ({
        type: (e.type as 'Normal' | 'Warning') || 'Normal',
        reason: e.reason || '',
        message: e.message || '',
        lastTimestamp: e.lastTimestamp?.toISOString() || '',
        count: e.count || 1,
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[KubernetesInfoService] getEvents error:', errorMessage);
      return [];
    }
  }

  /**
   * Get all app details in one call
   */
  static async getAppDetails(appName: string, namespace = 'default'): Promise<AppDetails> {
    const [pod, deployment, network, events] = await Promise.all([
      this.getPodInfo(appName, namespace),
      this.getDeploymentInfo(appName, namespace),
      this.getNetworkInfo(appName, namespace),
      this.getEvents(appName, namespace),
    ]);

    return {
      pod,
      deployment,
      network,
      events,
      timestamp: new Date().toISOString(),
    };
  }
}
