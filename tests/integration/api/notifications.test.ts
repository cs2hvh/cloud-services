import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as GET_NOTIFICATIONS } from '@/app/api/notifications/route';
import { GET as GET_COUNT } from '@/app/api/notifications/count/route';
import { POST as MARK_READ } from '@/app/api/notifications/mark-read/route';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/notifications/service');

describe('Notifications API', () => {
  const mockUser = { id: 'user-1', email: 'user@test.com' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupAuth(authenticated: boolean) {
    const { authenticateUser } = await import('@/lib/auth/server-auth');

    if (authenticated) {
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: true,
        user: mockUser,
        response: null,
      } as any);
    } else {
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      } as any);
    }
  }

  // ============ GET /api/notifications ============
  describe('GET /api/notifications', () => {
    it('should return 401 when not authenticated', async () => {
      await setupAuth(false);

      const req = new Request('http://localhost:3000/api/notifications');
      const res = await GET_NOTIFICATIONS(req);
      expect(res.status).toBe(401);
    });

    it('should return notifications with default params', async () => {
      await setupAuth(true);
      const { NotificationService } = await import('@/lib/notifications/service');
      vi.mocked(NotificationService.getByUserId).mockResolvedValue([
        { id: 'n1', title: 'Test', message: 'Test notification', read: false },
      ] as any);

      const req = new Request('http://localhost:3000/api/notifications');
      const res = await GET_NOTIFICATIONS(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.notifications).toHaveLength(1);
    });

    it('should pass query params to service', async () => {
      await setupAuth(true);
      const { NotificationService } = await import('@/lib/notifications/service');
      vi.mocked(NotificationService.getByUserId).mockResolvedValue([]);

      const req = new Request('http://localhost:3000/api/notifications?limit=10&offset=5&unread=true');
      const res = await GET_NOTIFICATIONS(req);
      expect(res.status).toBe(200);
      expect(NotificationService.getByUserId).toHaveBeenCalledWith('user-1', {
        limit: 10,
        offset: 5,
        unreadOnly: true,
      });
    });

    it('should cap limit at 100', async () => {
      await setupAuth(true);
      const { NotificationService } = await import('@/lib/notifications/service');
      vi.mocked(NotificationService.getByUserId).mockResolvedValue([]);

      const req = new Request('http://localhost:3000/api/notifications?limit=200');
      const res = await GET_NOTIFICATIONS(req);
      expect(res.status).toBe(200);
      expect(NotificationService.getByUserId).toHaveBeenCalledWith('user-1', {
        limit: 100,
        offset: 0,
        unreadOnly: false,
      });
    });
  });

  // ============ GET /api/notifications/count ============
  describe('GET /api/notifications/count', () => {
    it('should return 401 when not authenticated', async () => {
      await setupAuth(false);

      const res = await GET_COUNT();
      expect(res.status).toBe(401);
    });

    it('should return unread count', async () => {
      await setupAuth(true);
      const { NotificationService } = await import('@/lib/notifications/service');
      vi.mocked(NotificationService.getUnreadCount).mockResolvedValue(5);

      const res = await GET_COUNT();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBe(5);
    });
  });

  // ============ POST /api/notifications/mark-read ============
  describe('POST /api/notifications/mark-read', () => {
    it('should return 401 when not authenticated', async () => {
      await setupAuth(false);

      const req = new NextRequest('http://localhost:3000/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({ all: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await MARK_READ(req);
      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid body', async () => {
      await setupAuth(true);

      const req = new NextRequest('http://localhost:3000/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await MARK_READ(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid request');
    });

    it('should mark all as read', async () => {
      await setupAuth(true);
      const { NotificationService } = await import('@/lib/notifications/service');
      vi.mocked(NotificationService.markAllAsRead).mockResolvedValue(true);

      const req = new NextRequest('http://localhost:3000/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({ all: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await MARK_READ(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should mark single notification as read', async () => {
      await setupAuth(true);
      const { NotificationService } = await import('@/lib/notifications/service');
      vi.mocked(NotificationService.markAsRead).mockResolvedValue(true);

      const notifId = '550e8400-e29b-41d4-a716-446655440000';
      const req = new NextRequest('http://localhost:3000/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({ id: notifId }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await MARK_READ(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(NotificationService.markAsRead).toHaveBeenCalledWith(notifId, 'user-1');
    });

    it('should return 500 on error', async () => {
      await setupAuth(true);
      const { NotificationService } = await import('@/lib/notifications/service');
      vi.mocked(NotificationService.markAllAsRead).mockRejectedValue(new Error('DB error'));

      const req = new NextRequest('http://localhost:3000/api/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({ all: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await MARK_READ(req);
      expect(res.status).toBe(500);
    });
  });
});
