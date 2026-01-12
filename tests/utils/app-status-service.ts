/**
 * AppStatusService - Handles app status synchronization with Kubernetes
 * Stub implementation for testing
 */

export type AppStatus = 'pending' | 'building' | 'deploying' | 'running' | 'failed' | 'stopped';

export interface StatusUpdate {
  appId: string;
  status: AppStatus;
  message?: string;
}

export interface K8sStatus {
  ready: boolean;
  replicas: number;
  availableReplicas: number;
  phase: string;
}

export class AppStatusService {
  /**
   * Sync status from Kubernetes
   */
  static async syncFromK8s(appId: string): Promise<StatusUpdate> {
    // Stub: Return running status
    return {
      appId,
      status: 'running',
      message: 'App is running',
    };
  }

  /**
   * Update app status
   */
  static async updateStatus(appId: string, status: AppStatus, message?: string): Promise<boolean> {
    // Stub: Always succeed
    return true;
  }

  /**
   * Get K8s deployment status
   */
  static async getK8sStatus(appId: string): Promise<K8sStatus> {
    // Stub: Return healthy status
    return {
      ready: true,
      replicas: 1,
      availableReplicas: 1,
      phase: 'Running',
    };
  }

  /**
   * Batch sync multiple apps
   */
  static async batchSync(appIds: string[]): Promise<StatusUpdate[]> {
    // Stub: Return running status for all
    return appIds.map((appId) => ({
      appId,
      status: 'running' as AppStatus,
      message: 'App is running',
    }));
  }

  /**
   * Check if status transition is valid
   */
  static isValidTransition(from: AppStatus, to: AppStatus): boolean {
    const validTransitions: Record<AppStatus, AppStatus[]> = {
      pending: ['building', 'failed'],
      building: ['deploying', 'failed'],
      deploying: ['running', 'failed'],
      running: ['stopped', 'failed', 'deploying'],
      failed: ['building', 'stopped'],
      stopped: ['building'],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }
}
