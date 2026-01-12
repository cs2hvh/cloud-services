import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeploymentService } from '../../utils/deployment-service';

vi.mock('@/lib/supabase/server');

/**
 * DeploymentService Unit Tests
 */
describe('DeploymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Port Mapping', () => {
    it('TC-PA-U020: should return correct port for Next.js', () => {
      expect(DeploymentService.getPortForFramework('Next.js')).toBe(3000);
    });

    it('should return correct port for Python', () => {
      expect(DeploymentService.getPortForFramework('Python')).toBe(8000);
    });

    it('should return default port for unknown framework', () => {
      expect(DeploymentService.getPortForFramework('Unknown')).toBe(3000);
    });
  });

  describe('Slug Generation', () => {
    it('TC-PA-U021: should generate valid slug', () => {
      const slug = DeploymentService.generateSlug('My App Name');
      expect(slug).toMatch(/^my-app-name-[a-z0-9]{6}$/);
    });

    it('should handle special characters', () => {
      const slug = DeploymentService.generateSlug('App@123!');
      expect(slug).toMatch(/^app-123-[a-z0-9]{6}$/);
    });

    it('should generate unique slugs', () => {
      const slug1 = DeploymentService.generateSlug('test');
      const slug2 = DeploymentService.generateSlug('test');
      expect(slug1).not.toBe(slug2);
    });
  });

  describe('Deployment', () => {
    it('TC-PA-U022: should deploy successfully', async () => {
      const result = await DeploymentService.deploy({
        appId: 'app-123',
        framework: 'Next.js',
        repository: 'user/repo',
        branch: 'main',
      });

      expect(result.success).toBe(true);
      expect(result.deploymentId).toBeDefined();
    });

    it('should include deployment ID on success', async () => {
      const result = await DeploymentService.deploy({
        appId: 'app-123',
        framework: 'React',
        repository: 'user/repo',
        branch: 'main',
      });

      expect(result.deploymentId).toMatch(/^deploy-/);
    });
  });

  describe('Rollback', () => {
    it('TC-PA-U023: should rollback to previous deployment', async () => {
      const result = await DeploymentService.rollback('app-123', 'deploy-456');

      expect(result.success).toBe(true);
      expect(result.deploymentId).toBe('deploy-456');
    });
  });

  describe('Ownership Verification', () => {
    it('TC-PA-U024: should verify ownership', async () => {
      const result = await DeploymentService.verifyOwnership('app-123', 'user-456');
      expect(result).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('TC-PA-U025: should cleanup failed deployment', async () => {
      await expect(
        DeploymentService.cleanupFailedDeployment('deploy-123')
      ).resolves.toBeUndefined();
    });
  });
});
