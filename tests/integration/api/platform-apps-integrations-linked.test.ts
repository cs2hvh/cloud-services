import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/services/platform-apps/integrations/linked/route';
import { mockUser } from '../../utils/mock-data';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/services/database-integration');

describe('GET /api/services/platform-apps/integrations/linked', () => {
  const baseUrl = 'http://localhost:3000/api/services/platform-apps/integrations/linked';
  const validAppId = '550e8400-e29b-41d4-a716-446655440000';
  const validDbId = 'db-cluster-123';

  function createRequest(params: Record<string, string> = {}) {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return new Request(url.toString(), { method: 'GET' });
  }

  async function mockAuthenticated() {
    const { createSSRClient } = await import('@/lib/supabase/server');
    vi.mocked(createSSRClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: mockUser.id, email: mockUser.email } },
          error: null,
        }),
      },
    } as any);
  }

  async function mockUnauthenticated() {
    const { createSSRClient } = await import('@/lib/supabase/server');
    vi.mocked(createSSRClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Not authenticated' },
        }),
      },
    } as any);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('should return 401 for unauthenticated user', async () => {
      await mockUnauthenticated();

      const response = await GET(createRequest({ app_id: validAppId }) as any);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('should return 400 when no params provided', async () => {
      await mockAuthenticated();

      const response = await GET(createRequest() as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('MISSING_PARAMETER');
    });

    it('should return 400 when both app_id and database_id provided', async () => {
      await mockAuthenticated();

      const response = await GET(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_PARAMETERS');
    });

    it('should return 400 when app_id is invalid UUID', async () => {
      await mockAuthenticated();

      const response = await GET(createRequest({ app_id: 'not-uuid' }) as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_APP_ID');
    });
  });

  // ============================================
  // Fetch by app_id
  // ============================================
  describe('Fetch by app_id', () => {
    it('should return linked databases for an app', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.getLinkedDatabases).mockResolvedValue({
        success: true,
        data: [
          { integration_id: 'int-1', database_cluster_id: 'db-1', status: 'active', injected_env_keys: ['DATABASE_URL'], linked_at: '2024-01-01' },
        ],
      } as any);

      const response = await GET(createRequest({ app_id: validAppId }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.type).toBe('databases');
      expect(data.integrations).toHaveLength(1);
      expect(data.count).toBe(1);
    });

    it('should return 500 when fetch fails for app_id', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.getLinkedDatabases).mockResolvedValue({
        success: false,
        error: 'DB error',
      } as any);

      const response = await GET(createRequest({ app_id: validAppId }) as any);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.code).toBe('FETCH_ERROR');
    });
  });

  // ============================================
  // Fetch by database_id
  // ============================================
  describe('Fetch by database_id', () => {
    it('should return linked apps for a database', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.getLinkedApps).mockResolvedValue({
        success: true,
        data: [
          { integration_id: 'int-2', platform_app_id: validAppId, status: 'active', injected_env_keys: ['DATABASE_URL'], linked_at: '2024-01-01' },
        ],
      } as any);

      const response = await GET(createRequest({ database_id: validDbId }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.type).toBe('apps');
      expect(data.integrations).toHaveLength(1);
    });

    it('should return 500 when fetch fails for database_id', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.getLinkedApps).mockResolvedValue({
        success: false,
        error: 'DB error',
      } as any);

      const response = await GET(createRequest({ database_id: validDbId }) as any);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.code).toBe('FETCH_ERROR');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('should return 500 on unexpected error', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.getLinkedDatabases).mockRejectedValue(new Error('Crash'));

      const response = await GET(createRequest({ app_id: validAppId }) as any);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.code).toBe('INTERNAL_ERROR');
    });
  });
});
