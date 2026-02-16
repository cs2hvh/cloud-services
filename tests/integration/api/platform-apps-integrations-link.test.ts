import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/integrations/link/route';
import { mockUser } from '../../utils/mock-data';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/services/database-integration');
vi.mock('@/lib/audit');
vi.mock('@/lib/audit/context');

describe('POST /api/services/platform-apps/integrations/link', () => {
  const testUrl = 'http://localhost:3000/api/services/platform-apps/integrations/link';
  const validAppId = '550e8400-e29b-41d4-a716-446655440000';
  const validDbId = 'db-cluster-123';

  function createRequest(body: any) {
    return new Request(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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

  beforeEach(async () => {
    vi.clearAllMocks();

    const { getAuditContext } = await import('@/lib/audit/context');
    vi.mocked(getAuditContext).mockReturnValue({ ip_address: '127.0.0.1', user_agent: 'test' } as any);
  });

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('should return 401 for unauthenticated user', async () => {
      await mockUnauthenticated();

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('should return 400 when app_id is missing', async () => {
      await mockAuthenticated();

      const response = await POST(createRequest({ database_id: validDbId }) as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('MISSING_APP_ID');
    });

    it('should return 400 when database_id is missing', async () => {
      await mockAuthenticated();

      const response = await POST(createRequest({ app_id: validAppId }) as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('MISSING_DATABASE_ID');
    });

    it('should return 400 when app_id is invalid UUID', async () => {
      await mockAuthenticated();

      const response = await POST(createRequest({ app_id: 'not-uuid', database_id: validDbId }) as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_APP_ID');
    });
  });

  // ============================================
  // Link Operation
  // ============================================
  describe('Link Operation', () => {
    it('should return 404 when app not found', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.link).mockResolvedValue({
        success: false,
        error: 'App not found',
        code: 'APP_NOT_FOUND',
      } as any);

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('APP_NOT_FOUND');
    });

    it('should return 404 when database not found', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.link).mockResolvedValue({
        success: false,
        error: 'Database not found',
        code: 'DATABASE_NOT_FOUND',
      } as any);

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(404);
    });

    it('should return 403 when user does not own the app', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.link).mockResolvedValue({
        success: false,
        error: 'Permission denied',
        code: 'APP_NOT_OWNED',
      } as any);

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(403);
    });

    it('should return 409 when already linked', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.link).mockResolvedValue({
        success: false,
        error: 'Already linked',
        code: 'ALREADY_LINKED',
      } as any);

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.code).toBe('ALREADY_LINKED');
    });

    it('should return 409 on env var conflict', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.link).mockResolvedValue({
        success: false,
        error: 'Environment variable conflict',
        code: 'ENV_VAR_CONFLICT',
        conflicts: ['DATABASE_URL'],
      } as any);

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.code).toBe('ENV_VAR_CONFLICT');
      expect(data.conflicts).toContain('DATABASE_URL');
    });

    it('should link successfully with redeploy', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.link).mockResolvedValue({
        success: true,
        integration_id: 'int-1',
        injected_vars: ['DATABASE_URL', 'DATABASE_HOST'],
        redeploy_triggered: true,
        app_name: 'my-app',
        database_name: 'my-db',
      } as any);

      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.integration_id).toBe('int-1');
      expect(data.redeploy_triggered).toBe(true);
      expect(data.message).toContain('Redeploy triggered');
    });

    it('should link successfully without redeploy', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.link).mockResolvedValue({
        success: true,
        integration_id: 'int-2',
        injected_vars: ['DATABASE_URL'],
        redeploy_triggered: false,
        app_name: 'my-app',
        database_name: 'my-db',
      } as any);

      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('next deploy');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('should return 500 on unexpected error', async () => {
      await mockAuthenticated();

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.link).mockRejectedValue(new Error('Service down'));

      const response = await POST(createRequest({ app_id: validAppId, database_id: validDbId }) as any);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.code).toBe('INTERNAL_ERROR');
    });
  });
});
