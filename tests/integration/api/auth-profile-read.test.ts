import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/auth/profile/read/route';
import { expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');

describe('GET /api/auth/profile/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupSupabaseMock(options: {
    user?: any;
    userError?: any;
  }) {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: options.user ?? {
          id: 'user-123',
          email: 'test@example.com',
          phone: '+1234567890',
          user_metadata: {
            avatar_url: 'https://example.com/avatar.jpg',
            display_name: 'Test User',
            username: 'testuser',
          },
          identities: [{ provider: 'email' }],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-06-01T00:00:00Z',
        },
      },
      error: options.userError ?? null,
    });

    return { mockClient: { auth: { getUser } }, getUser };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-100: should return full user profile', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.id).toBe('user-123');
      expect(data.email).toBe('test@example.com');
      expect(data.phone).toBe('+1234567890');
      expect(data.profilePic).toBe('https://example.com/avatar.jpg');
      expect(data.displayName).toBe('Test User');
      expect(data.userName).toBe('testuser');
    });

    it('TC-AUTH-101: should handle missing user_metadata fields', async () => {
      const { mockClient } = setupSupabaseMock({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          user_metadata: {},
          identities: [],
          created_at: '2024-01-01',
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.profilePic).toBeUndefined();
      expect(data.displayName).toBeUndefined();
      expect(data.userName).toBeUndefined();
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-AUTH-102: should return 401 for unauthenticated user', async () => {
      const { mockClient } = setupSupabaseMock({
        user: null,
        userError: { message: 'Not authenticated' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-AUTH-103: should return 500 on unexpected error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockRejectedValue(new Error('Connection failed'));

      const response = await GET();
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBeDefined();
    });
  });
});
