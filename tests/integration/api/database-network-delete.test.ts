import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/network/delete/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/notifications');
vi.mock('axios');

describe('POST /api/services/database/network/delete', () => {
  const testUrl = 'http://localhost:3000/api/services/database/network/delete';
  const validClusterId = '550e8400-e29b-41d4-a716-446655440000';
  const validRuleUuid = '660e8400-e29b-41d4-a716-446655440001';

  const existingRules = [
    { uuid: validRuleUuid, type: 'ip_addr', value: '192.168.1.1', cluster_uuid: validClusterId },
    { uuid: '770e8400-e29b-41d4-a716-446655440002', type: 'ip_addr', value: '10.0.0.1', cluster_uuid: validClusterId },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    const { NotificationService } = await import('@/lib/notifications');
    vi.mocked(NotificationService.create).mockResolvedValue(undefined as any);

    const axios = (await import('axios')).default;
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
  });

  function setupSuccessfulDOFlow() {
    return import('axios').then(async (axiosModule) => {
      const axios = axiosModule.default;
      // GET firewall rules
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: { rules: [...existingRules] },
      });
      // PUT updated rules
      vi.mocked(axios.put).mockResolvedValue({ status: 204, statusText: 'No Content' });
      // GET updated rules (confirmation)
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: { rules: [existingRules[1]] },
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_network_rules).mockResolvedValue({
        success: true,
      } as any);
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: { name: 'my-cluster', owner_id: 'user-1', project_id: 'project-1' },
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);
    });
  }

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('TC-DB-160: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 401);
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-DB-161: should return 400 when id is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, { rule_uuid: validRuleUuid });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-162: should return 400 when rule_uuid is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, { id: validClusterId });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-163: should return 400 when id is invalid UUID', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        id: 'not-uuid',
        rule_uuid: validRuleUuid,
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-DB-164: should return 400 when rule_uuid is invalid UUID', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: 'not-uuid',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-DB-165: should delete firewall rule successfully', async () => {
      await mockAuthenticatedUser();
      await setupSuccessfulDOFlow();

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('deleted successfully');
    });

    it('TC-DB-166: should filter out the deleted rule from PUT payload', async () => {
      await mockAuthenticatedUser();
      await setupSuccessfulDOFlow();

      const axios = (await import('axios')).default;

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      await POST(request as any);

      // The PUT call should contain only the remaining rule
      expect(axios.put).toHaveBeenCalledWith(
        expect.stringContaining(`/databases/${validClusterId}/firewall`),
        { rules: [existingRules[1]] },
        expect.any(Object)
      );
    });

    it('TC-DB-167: should add activity log', async () => {
      await mockAuthenticatedUser();
      await setupSuccessfulDOFlow();

      const { Projects } = await import('@/lib/supabase/queries/projects');

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      await POST(request as any);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'project-1',
          event: 'Shield',
        })
      );
    });

    it('TC-DB-168: should still succeed when Supabase update fails', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: { rules: [...existingRules] },
      });
      vi.mocked(axios.put).mockResolvedValue({ status: 204, statusText: 'No Content' });
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        data: { rules: [existingRules[1]] },
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_network_rules).mockResolvedValue({
        success: false,
        error: 'Supabase write failed',
      } as any);

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('deleted from firewall');
    });
  });

  // ============================================
  // DO API Failures
  // ============================================
  describe('DigitalOcean API Failures', () => {
    it('TC-DB-169: should handle GET firewall failure', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.get).mockRejectedValue(new Error('DO API error'));

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('DO API error');
    });

    it('TC-DB-170: should handle PUT firewall non-204 response', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.get).mockResolvedValue({
        status: 200,
        data: { rules: [...existingRules] },
      });
      vi.mocked(axios.put).mockResolvedValue({ status: 422, statusText: 'Unprocessable' });

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 422);

      expect(data.error).toContain('Failed to delete');
    });

    it('TC-DB-171: should handle Axios error with DO message', async () => {
      await mockAuthenticatedUser();

      const axiosModule = await import('axios');
      const axiosError = new Error('Request failed') as any;
      axiosError.isAxiosError = true;
      axiosError.response = { status: 503, data: { message: 'Service unavailable' } };

      vi.mocked(axiosModule.default.get).mockRejectedValue(axiosError);
      vi.mocked(axiosModule.default.isAxiosError).mockReturnValue(true);

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 503);

      expect(data.error).toContain('Service unavailable');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-DB-172: should return 500 on unknown error', async () => {
      await mockAuthenticatedUser();

      const axios = (await import('axios')).default;
      vi.mocked(axios.get).mockRejectedValue('string error');

      const request = createMockPostRequest(testUrl, {
        id: validClusterId,
        rule_uuid: validRuleUuid,
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('Unknown error');
    });
  });
});
