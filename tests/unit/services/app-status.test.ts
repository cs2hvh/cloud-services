import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppStatusService } from '../../utils/app-status-service';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/kubernetes/client');

/**
 * AppStatusService Unit Tests
 */
describe('AppStatusService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('K8s Sync', () => {
    it('TC-PA-U040: should sync status from Kubernetes', async () => {
      const result = await AppStatusService.syncFromK8s('app-123');

      expect(result.appId).toBe('app-123');
      expect(result.status).toBeDefined();
    });

    it('should return running status for healthy pod', async () => {
      const result = await AppStatusService.syncFromK8s('app-123');
      expect(result.status).toBe('running');
    });
  });

  describe('Status Updates', () => {
    it('TC-PA-U041: should update app status', async () => {
      const result = await AppStatusService.updateStatus('app-123', 'running');
      expect(result).toBe(true);
    });

    it('should accept optional message', async () => {
      const result = await AppStatusService.updateStatus('app-123', 'failed', 'Build error');
      expect(result).toBe(true);
    });
  });

  describe('K8s Status', () => {
    it('TC-PA-U042: should get K8s deployment status', async () => {
      const status = await AppStatusService.getK8sStatus('app-123');

      expect(status.ready).toBeDefined();
      expect(status.replicas).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batch Sync', () => {
    it('TC-PA-U043: should sync multiple apps', async () => {
      const appIds = ['app-1', 'app-2', 'app-3'];
      const results = await AppStatusService.batchSync(appIds);

      expect(results).toHaveLength(3);
      expect(results[0].appId).toBe('app-1');
      expect(results[1].appId).toBe('app-2');
      expect(results[2].appId).toBe('app-3');
    });

    it('should handle empty array', async () => {
      const results = await AppStatusService.batchSync([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('Status Transitions', () => {
    it('should allow valid transitions', () => {
      expect(AppStatusService.isValidTransition('pending', 'building')).toBe(true);
      expect(AppStatusService.isValidTransition('building', 'deploying')).toBe(true);
      expect(AppStatusService.isValidTransition('deploying', 'running')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(AppStatusService.isValidTransition('pending', 'running')).toBe(false);
      expect(AppStatusService.isValidTransition('stopped', 'deploying')).toBe(false);
    });

    it('should allow failure from any state', () => {
      expect(AppStatusService.isValidTransition('pending', 'failed')).toBe(true);
      expect(AppStatusService.isValidTransition('building', 'failed')).toBe(true);
      expect(AppStatusService.isValidTransition('running', 'failed')).toBe(true);
    });
  });
});
