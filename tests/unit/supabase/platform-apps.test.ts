import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Platform_Apps } from '@/lib/supabase/platform-apps';

vi.mock('@/lib/supabase/server');

/**
 * Platform_Apps Supabase Query Tests
 */
describe('Platform_Apps Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('count_by_owner', () => {
    it('TC-PA-U050: should return count of user apps', async () => {
      const count = await Platform_Apps.count_by_owner();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('check_name_exists', () => {
    it('TC-PA-U051: should check if app name exists', async () => {
      const exists = await Platform_Apps.check_name_exists();
      expect(typeof exists).toBe('boolean');
    });

    it('TC-PA-U052: should return false for new app name', async () => {
      const exists = await Platform_Apps.check_name_exists();
      expect(exists).toBe(false);
    });
  });

  describe('create', () => {
    it('TC-PA-U053: should create app successfully', async () => {
      const result = await Platform_Apps.create({
        name: 'test-app',
        user_id: 'user-123',
        framework: 'Next.js',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe('test-app');
    });
  });

  describe('update', () => {
    it('TC-PA-U055: should update app', async () => {
      const result = await Platform_Apps.update('app-123', { status: 'running' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('get', () => {
    it('TC-PA-U056: should get app by ID', async () => {
      const app = await Platform_Apps.get('app-123');

      expect(app).toBeDefined();
      expect(app?.id).toBe('app-123');
    });

    it('should return null for non-existent app', async () => {
      const app = await Platform_Apps.get('non-existent-id');
      expect(app).toBeNull();
    });
  });

  describe('list_by_owner', () => {
    it('TC-PA-U057: should list user apps', async () => {
      const apps = await Platform_Apps.list_by_owner();
      expect(Array.isArray(apps)).toBe(true);
    });
  });

  describe('delete', () => {
    it('TC-PA-U058: should delete app', async () => {
      const result = await Platform_Apps.delete();
      expect(result.success).toBe(true);
    });
  });

  describe('set_env_vars', () => {
    it('TC-PA-U059: should set environment variables', async () => {
      const result = await Platform_Apps.set_env_vars();
      expect(result.success).toBe(true);
    });
  });

  describe('get_env_vars', () => {
    it('TC-PA-U060: should get environment variables', async () => {
      const envVars = await Platform_Apps.get_env_vars();
      expect(Array.isArray(envVars)).toBe(true);
    });
  });
});
