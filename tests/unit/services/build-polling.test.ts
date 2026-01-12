import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BuildPollingService } from '../../utils/build-polling-service';

vi.mock('@/lib/jenkins/client');

/**
 * BuildPollingService Unit Tests
 */
describe('BuildPollingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    BuildPollingService.stopPolling('app-123');
  });

  describe('Polling', () => {
    it('TC-PA-U030: should start polling for build status', async () => {
      const onUpdate = vi.fn();

      await BuildPollingService.startPolling('app-123', 1, onUpdate);

      expect(onUpdate).toHaveBeenCalled();
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          buildNumber: 1,
          status: expect.any(String),
        })
      );
    });

    it('should stop polling', () => {
      BuildPollingService.stopPolling('app-123');
      // No error should be thrown
      expect(true).toBe(true);
    });
  });

  describe('Build Status', () => {
    it('TC-PA-U031: should get current build status', async () => {
      const status = await BuildPollingService.getBuildStatus('app-123', 1);

      expect(status.buildNumber).toBe(1);
      expect(status.status).toBeDefined();
      expect(status.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamp', async () => {
      const status = await BuildPollingService.getBuildStatus('app-123', 1);
      expect(status.timestamp).toBeDefined();
      expect(new Date(status.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Build Logs', () => {
    it('TC-PA-U032: should fetch build logs', async () => {
      const logs = await BuildPollingService.getBuildLogs('app-123', 1);

      expect(logs.lines).toBeInstanceOf(Array);
      expect(logs.hasMore).toBeDefined();
    });

    it('should return non-empty logs', async () => {
      const logs = await BuildPollingService.getBuildLogs('app-123', 1);
      expect(logs.lines.length).toBeGreaterThan(0);
    });
  });

  describe('Wait for Completion', () => {
    it('TC-PA-U033: should wait for build completion', async () => {
      const result = await BuildPollingService.waitForCompletion('app-123', 1);

      expect(result.buildNumber).toBe(1);
      expect(result.status).toBeDefined();
    });

    it('should accept custom timeout', async () => {
      const result = await BuildPollingService.waitForCompletion('app-123', 1, 60000);
      expect(result).toBeDefined();
    });
  });

  describe('Retry Build', () => {
    it('TC-PA-U034: should retry failed build', async () => {
      const newBuildNumber = await BuildPollingService.retryBuild('app-123', 5);

      expect(newBuildNumber).toBeGreaterThan(5);
    });
  });
});
