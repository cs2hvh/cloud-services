import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from '@/app/api/services/database/upsize-storage/route';
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
vi.mock('@/lib/audit');
vi.mock('@/lib/audit/context');
vi.mock('axios');

describe('PUT /api/services/database/upsize-storage', () => {
  const testUrl = 'http://localhost:3000/api/services/database/upsize-storage';
  const validClusterId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const { getAuditContext } = await import('@/lib/audit/context');
    vi.mocked(getAuditContext).mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      requestId: 'req-123',
    } as any);

    const { AuditLogService } = await import('@/lib/audit');
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);

    const { NotificationService } = await import('@/lib/notifications');
    vi.mocked(NotificationService.create).mockResolvedValue(undefined as any);

    const axios = (await import('axios')).default;
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
  });

  function mockClusterRead(data: any, success = true) {
    return import('@/lib/supabase/queries/database_clusters').then(({ Database_Clusters }) => {
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success,
        data: success ? data : undefined,
      } as any);
    });
  }

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('TC-DB-120: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 401);
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-DB-121: should return 400 when database_id is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, { storage_size_mib: 20480 });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-122: should return 400 when database_id is invalid UUID', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: 'not-a-uuid',
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-123: should return 400 when storage_size_mib is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, { database_id: validClusterId });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-124: should return 400 when storage_size_mib is below minimum (10240)', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 5000,
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-125: should return 400 when storage_size_mib exceeds maximum', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 99999999,
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-126: should return 400 when storage_size_mib is not an integer', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480.5,
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Cluster Not Found
  // ============================================
  describe('Cluster Not Found', () => {
    it('TC-DB-127: should return 404 when cluster does not exist', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead(null, false);

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toContain('not found');
    });
  });

  // ============================================
  // Storage Size Validation
  // ============================================
  describe('Storage Size Checks', () => {
    it('TC-DB-128: should return 400 when new storage <= current storage', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-4vcpu-8gb',
        storage_size_mib: 30720,
        engine: 'pg',
        owner_id: 'user-1',
      });

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480, // less than current 30720
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('greater than current');
    });

    it('TC-DB-129: should return 400 when new storage equals current storage', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-4vcpu-8gb',
        storage_size_mib: 20480,
        engine: 'pg',
        owner_id: 'user-1',
      });

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('greater than current');
    });

    it('TC-DB-130: should return 400 when storage exceeds engine/RAM limits', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-1vcpu-1gb',
        storage_size_mib: 10240,
        engine: 'pg',
        owner_id: 'user-1',
      });

      // pg with 1gb RAM has max 30 GiB = 30720 MiB
      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 40960, // 40 GiB > 30 GiB max
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('cannot exceed');
      expect(data.error).toContain('30');
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-DB-131: should upsize storage successfully with 202 response', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-4vcpu-8gb',
        storage_size_mib: 10240,
        engine: 'pg',
        owner_id: 'user-1',
        project_id: 'project-1',
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_storage_size).mockResolvedValue({
        success: true,
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 202, statusText: 'Accepted' });

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('Storage upsize initiated');
    });

    it('TC-DB-132: should call DO API with correct payload', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-4vcpu-8gb',
        storage_size_mib: 10240,
        engine: 'pg',
        owner_id: 'user-1',
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_storage_size).mockResolvedValue({
        success: true,
      } as any);

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 202, statusText: 'Accepted' });

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      await PUT(request as any);

      expect(axios.put).toHaveBeenCalledWith(
        `https://api.digitalocean.com/v2/databases/${validClusterId}/resize`,
        expect.objectContaining({
          size: 'db-s-4vcpu-8gb',
          storage_size_mib: 20480,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('TC-DB-133: should update Supabase storage size after DO success', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-4vcpu-8gb',
        storage_size_mib: 10240,
        engine: 'pg',
        owner_id: 'user-1',
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_storage_size).mockResolvedValue({
        success: true,
      } as any);

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 204, statusText: 'No Content' });

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      await PUT(request as any);

      expect(Database_Clusters.update_storage_size).toHaveBeenCalledWith(
        validClusterId,
        20480
      );
    });
  });

  // ============================================
  // DO API Failures
  // ============================================
  describe('DigitalOcean API Failures', () => {
    it('TC-DB-134: should return DO status when response is not 202/204', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-4vcpu-8gb',
        storage_size_mib: 10240,
        engine: 'pg',
        owner_id: 'user-1',
      });

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 422, statusText: 'Unprocessable Entity' });

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 422);

      expect(data.error).toContain('Failed to upsize');
    });

    it('TC-DB-135: should handle Axios error with DO error message', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-4vcpu-8gb',
        storage_size_mib: 10240,
        engine: 'pg',
        owner_id: 'user-1',
      });

      const axios = (await import('axios')).default;
      const axiosError = new Error('Request failed') as any;
      axiosError.isAxiosError = true;
      axiosError.response = {
        status: 503,
        data: { message: 'Service unavailable' },
      };

      const axiosModule = await import('axios');
      vi.mocked(axiosModule.default.put).mockRejectedValue(axiosError);
      vi.mocked(axiosModule.default.isAxiosError).mockReturnValue(true);

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
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
    it('TC-DB-136: should return 500 on generic Error', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockRejectedValue(new Error('DB connection lost'));

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('DB connection lost');
    });

    it('TC-DB-137: should return 500 on unknown error type', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockRejectedValue('unknown');

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('unexpected');
    });

    it('TC-DB-138: should still succeed even if Supabase update fails', async () => {
      await mockAuthenticatedUser();
      await mockClusterRead({
        name: 'my-cluster',
        size: 'db-s-4vcpu-8gb',
        storage_size_mib: 10240,
        engine: 'pg',
        owner_id: 'user-1',
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_storage_size).mockResolvedValue({
        success: false,
        error: 'Supabase write failed',
      } as any);

      const axios = (await import('axios')).default;
      vi.mocked(axios.put).mockResolvedValue({ status: 202, statusText: 'Accepted' });

      const request = createMockPutRequest(testUrl, {
        database_id: validClusterId,
        storage_size_mib: 20480,
      });
      const response = await PUT(request as any);
      // Still returns 200 because DO succeeded
      await expectResponseStatus(response, 200);
    });
  });
});
