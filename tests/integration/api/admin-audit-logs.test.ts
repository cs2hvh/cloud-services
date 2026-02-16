//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/audit-logs/route';
import { GET as GET_BY_ID } from '@/app/api/admin/audit-logs/[logId]/route';
import { GET as GET_STATS } from '@/app/api/admin/audit-logs/stats/route';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/audit');

describe('Admin Audit Logs API', () => {
  const mockAuditEntry = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    user_id: 'user-1',
    action: 'create',
    service_type: 'database',
    details: {},
    created_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupAuth(authenticated: boolean, isAdmin: boolean) {
    const { authenticateUser } = await import('@/lib/auth/server-auth');
    const { requireAdmin } = await import('@/lib/supabase/auth');

    if (authenticated) {
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: true,
        user: { id: 'admin-1', email: 'admin@test.com' },
        response: null,
      } as any);
    } else {
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      } as any);
    }

    vi.mocked(requireAdmin).mockResolvedValue(
      isAdmin ? { ok: true, email: 'admin@test.com', userId: 'admin-1' } : { ok: false }
    );
  }

  // ============ GET /api/admin/audit-logs ============
  describe('GET /api/admin/audit-logs', () => {
    it('should return 401 when not authenticated', async () => {
      await setupAuth(false, false);

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('should return 403 when not admin', async () => {
      await setupAuth(true, false);

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs');
      const res = await GET(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized - Admin access required');
    });

    it('should return 400 for invalid query parameters', async () => {
      await setupAuth(true, true);

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs?user_id=not-a-uuid');
      const res = await GET(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid query parameters');
    });

    it('should query audit logs with default pagination', async () => {
      await setupAuth(true, true);
      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.query).mockResolvedValue({
        data: [mockAuditEntry],
        total: 1,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([mockAuditEntry]);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(20);
      expect(body.pagination.total).toBe(1);
    });

    it('should pass filters to AuditLogService.query', async () => {
      await setupAuth(true, true);
      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.query).mockResolvedValue({ data: [], total: 0 });

      const req = new NextRequest(
        'http://localhost:3000/api/admin/audit-logs?service_type=database&action=create&page=2&limit=50'
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(AuditLogService.query).toHaveBeenCalledWith(
        expect.objectContaining({ service_type: 'database', action: 'create' }),
        { page: 2, limit: 50 }
      );
    });

    it('should return 500 on query error', async () => {
      await setupAuth(true, true);
      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.query).mockRejectedValue(new Error('DB error'));

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs');
      const res = await GET(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to query audit logs');
    });
  });

  // ============ GET /api/admin/audit-logs/[logId] ============
  describe('GET /api/admin/audit-logs/[logId]', () => {
    const validLogId = '550e8400-e29b-41d4-a716-446655440000';
    const mockParams = (id: string) => Promise.resolve({ logId: id });

    it('should return 401 when not authenticated', async () => {
      await setupAuth(false, false);

      const req = new NextRequest(`http://localhost:3000/api/admin/audit-logs/${validLogId}`);
      const res = await GET_BY_ID(req, { params: mockParams(validLogId) });
      expect(res.status).toBe(401);
    });

    it('should return 403 when not admin', async () => {
      await setupAuth(true, false);

      const req = new NextRequest(`http://localhost:3000/api/admin/audit-logs/${validLogId}`);
      const res = await GET_BY_ID(req, { params: mockParams(validLogId) });
      expect(res.status).toBe(403);
    });

    it('should return 400 for invalid UUID format', async () => {
      await setupAuth(true, true);

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs/not-a-uuid');
      const res = await GET_BY_ID(req, { params: mockParams('not-a-uuid') });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid log ID format');
    });

    it('should return 404 when log not found', async () => {
      await setupAuth(true, true);
      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.getById).mockResolvedValue(null);

      const req = new NextRequest(`http://localhost:3000/api/admin/audit-logs/${validLogId}`);
      const res = await GET_BY_ID(req, { params: mockParams(validLogId) });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Audit log not found');
    });

    it('should return audit log entry', async () => {
      await setupAuth(true, true);
      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.getById).mockResolvedValue(mockAuditEntry as any);

      const req = new NextRequest(`http://localhost:3000/api/admin/audit-logs/${validLogId}`);
      const res = await GET_BY_ID(req, { params: mockParams(validLogId) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockAuditEntry);
    });

    it('should return 500 on error', async () => {
      await setupAuth(true, true);
      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.getById).mockRejectedValue(new Error('DB error'));

      const req = new NextRequest(`http://localhost:3000/api/admin/audit-logs/${validLogId}`);
      const res = await GET_BY_ID(req, { params: mockParams(validLogId) });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to fetch audit log');
    });
  });

  // ============ GET /api/admin/audit-logs/stats ============
  describe('GET /api/admin/audit-logs/stats', () => {
    const mockStats = {
      total: 100,
      by_action: { create: 40, update: 30, delete: 30 },
      by_service: { database: 50, kubernetes: 50 },
    };

    it('should return 401 when not authenticated', async () => {
      await setupAuth(false, false);

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs/stats');
      const res = await GET_STATS(req);
      expect(res.status).toBe(401);
    });

    it('should return 403 when not admin', async () => {
      await setupAuth(true, false);

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs/stats');
      const res = await GET_STATS(req);
      expect(res.status).toBe(403);
    });

    it('should return stats successfully', async () => {
      await setupAuth(true, true);
      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.getStats).mockResolvedValue(mockStats as any);

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs/stats');
      const res = await GET_STATS(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockStats);
    });

    it('should return 500 on error', async () => {
      await setupAuth(true, true);
      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.getStats).mockRejectedValue(new Error('Stats error'));

      const req = new NextRequest('http://localhost:3000/api/admin/audit-logs/stats');
      const res = await GET_STATS(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to fetch audit stats');
    });
  });
});
