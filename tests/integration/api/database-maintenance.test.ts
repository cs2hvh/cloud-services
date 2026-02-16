import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from '@/app/api/services/database/maintenance/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPutRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/notifications');
vi.mock('axios');

describe('PUT /api/services/database/maintenance', () => {
  const testUrl = 'http://localhost:3000/api/services/database/maintenance';
  const validClusterId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const { NotificationService } = await import('@/lib/notifications');
    vi.mocked(NotificationService.create).mockResolvedValue(undefined as any);

    const axios = (await import('axios')).default;
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
  });

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('TC-DB-140: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'monday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 401);
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-DB-141: should return 400 when database_id is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, { day: 'monday', hour: '04:00' });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-142: should return 400 when day is invalid', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'funday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-143: should return 400 when hour format is invalid', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'monday',
        hour: '4pm',
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-144: should return 400 when database_id is invalid UUID', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: 'not-uuid',
        day: 'monday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-DB-145: should update maintenance window successfully', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 204, statusText: 'No Content' });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_maintenance_window).mockResolvedValue({
        success: true,
      } as any);
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: { name: 'my-cluster', owner_id: 'user-1', project_id: 'project-1' },
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'monday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('configured successfully');
    });

    it('TC-DB-146: should call DO API with correct payload', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 204, statusText: 'No Content' });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_maintenance_window).mockResolvedValue({
        success: true,
      } as any);
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: { name: 'my-cluster', owner_id: 'user-1' },
      } as any);

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'tuesday',
        hour: '08:00',
      });
      await PUT(request as any);

      expect(axios.put).toHaveBeenCalledWith(
        `https://api.digitalocean.com/v2/databases/${validClusterId}/maintenance`,
        { day: 'tuesday', hour: '08:00' },
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('TC-DB-147: should add activity log when project_id exists', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 204, statusText: 'No Content' });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_maintenance_window).mockResolvedValue({
        success: true,
      } as any);
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: { name: 'my-cluster', owner_id: 'user-1', project_id: 'project-1' },
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'wednesday',
        hour: '10:00',
      });
      await PUT(request as any);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'project-1',
          event: 'Settings',
        })
      );
    });

    it('TC-DB-148: should still succeed when Supabase update fails', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 204, statusText: 'No Content' });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_maintenance_window).mockResolvedValue({
        success: false,
        error: 'Supabase write failed',
      } as any);
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: { name: 'my-cluster', owner_id: 'user-1' },
      } as any);

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'monday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 200);
    });
  });

  // ============================================
  // DO API Failure
  // ============================================
  describe('DigitalOcean API Failures', () => {
    it('TC-DB-149: should return DO status when response is not 204', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 422, statusText: 'Unprocessable' });

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'monday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 422);

      expect(data.error).toContain('Failed to update');
    });

    it('TC-DB-150: should handle Axios error', async () => {
      await mockAuthenticatedUser();

      const axiosModule = await import('axios');
      const axiosError = new Error('Request failed') as any;
      axiosError.isAxiosError = true;
      axiosError.response = { status: 503, data: { message: 'Service unavailable' } };

      vi.mocked(axiosModule.default.put).mockRejectedValue(axiosError);
      vi.mocked(axiosModule.default.isAxiosError).mockReturnValue(true);

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'monday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 503);

      expect(data.error).toContain('Service unavailable');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-DB-151: should return 400 on generic Error', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockRejectedValue(new Error('Connection failed'));

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'monday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Connection failed');
    });

    it('TC-DB-152: should return 500 on unknown error type', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockRejectedValue('string error');

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        day: 'monday',
        hour: '04:00',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('Unknown error');
    });
  });
});
