import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from '@/app/api/auth/profile/update/route';
import { NextRequest } from 'next/server';
import { expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');

describe('PUT /api/auth/profile/update', () => {
  const testUrl = 'http://localhost:3000/api/auth/profile/update';

  function createMockPutRequest(url: string, body: any) {
    return new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as NextRequest;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupSupabaseMock(options: {
    user?: any;
    userError?: any;
    updateResult?: { data?: any; error?: any };
  }) {
    const defaultUser = {
      id: 'user-123',
      email: 'test@example.com',
      phone: null,
      user_metadata: { username: 'testuser', display_name: 'Test', avatar_url: null },
    };

    const getUser = vi.fn().mockResolvedValue({
      data: { user: options.user ?? defaultUser },
      error: options.userError ?? null,
    });

    const updateUser = vi.fn().mockResolvedValue(
      options.updateResult ?? {
        data: {
          user: {
            ...(options.user ?? defaultUser),
            user_metadata: { ...(options.user ?? defaultUser).user_metadata },
          },
        },
        error: null,
      }
    );

    return { mockClient: { auth: { getUser, updateUser } }, getUser, updateUser };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-110: should update displayName', async () => {
      const { mockClient, updateUser } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPutRequest(testUrl, { displayName: 'New Name' });
      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ display_name: 'New Name' }),
        })
      );
    });

    it('TC-AUTH-111: should update userName', async () => {
      const { mockClient, updateUser } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPutRequest(testUrl, { userName: 'newuser' });
      const response = await PUT(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: 'newuser' }),
        })
      );
    });

    it('TC-AUTH-112: should update profilePic', async () => {
      const { mockClient, updateUser } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPutRequest(testUrl, {
        profilePic: 'https://example.com/new-avatar.jpg',
      });

      const response = await PUT(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avatar_url: 'https://example.com/new-avatar.jpg' }),
        })
      );
    });

    it('TC-AUTH-113: should include phone change note', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPutRequest(testUrl, { phone: '+1234567890' });
      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.notes).toHaveLength(1);
      expect(data.notes[0]).toContain('Phone update');
    });

    it('TC-AUTH-114: should update multiple fields at once', async () => {
      const { mockClient, updateUser } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPutRequest(testUrl, {
        displayName: 'Updated',
        userName: 'updateduser',
        profilePic: 'https://example.com/pic.jpg',
      });

      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            display_name: 'Updated',
            username: 'updateduser',
            avatar_url: 'https://example.com/pic.jpg',
          },
        })
      );
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-AUTH-115: should reject empty body (no valid fields)', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPutRequest(testUrl, {});
      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('No valid fields');
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-AUTH-116: should return 401 for unauthenticated user', async () => {
      const { mockClient } = setupSupabaseMock({
        user: null,
        userError: { message: 'Not authenticated' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPutRequest(testUrl, { displayName: 'Test' });
      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-AUTH-117: should return 400 when Supabase update fails', async () => {
      const { mockClient } = setupSupabaseMock({
        updateResult: { data: null, error: { message: 'Update failed' } },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPutRequest(testUrl, { displayName: 'Test' });
      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Update failed');
    });

    it('TC-AUTH-118: should return 500 on unexpected error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockRejectedValue(new Error('Connection failed'));

      const request = createMockPutRequest(testUrl, { displayName: 'Test' });
      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBeDefined();
    });
  });
});
