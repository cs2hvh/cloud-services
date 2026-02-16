import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GET_REPOS } from '@/app/api/bitbucket/repositories/route';
import { GET as GET_BRANCHES } from '@/app/api/bitbucket/branches/route';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/providers/bitbucket');
vi.mock('@/lib/bitbucket/token-refresh');

describe('Bitbucket Git Provider API', () => {
  const mockUser = { id: 'user-1', email: 'user@test.com' };

  function createSupabaseMock(options: {
    user?: any;
    session?: any;
  } = {}) {
    const { user = mockUser, session = null } = options;
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : { message: 'Not auth' } }),
        getSession: vi.fn().mockResolvedValue({ data: { session } }),
      },
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ GET /api/bitbucket/repositories ============
  describe('GET /api/bitbucket/repositories', () => {
    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock({ user: null }) as any);

      const res = await GET_REPOS();
      expect(res.status).toBe(401);
    });

    it('should return 500 on error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockRejectedValue(new Error('Server error'));

      const res = await GET_REPOS();
      expect(res.status).toBe(500);
    });
  });

  // ============ GET /api/bitbucket/branches ============
  describe('GET /api/bitbucket/branches', () => {
    const mockSession = {
      user: {
        ...mockUser,
        identities: [{ provider: 'bitbucket', identity_data: {} }],
        app_metadata: { provider: 'bitbucket' },
      },
      provider_token: null,
    };

    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new Request('http://localhost:3000/api/bitbucket/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(401);
    });

    it('should return 401 when no session', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ session: null }) as any
      );

      const req = new Request('http://localhost:3000/api/bitbucket/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(401);
    });

    it('should return 400 when no bitbucket identity', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      const sessionNoIdentity = {
        user: { ...mockUser, identities: [{ provider: 'github' }] },
      };
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ session: sessionNoIdentity }) as any
      );

      const req = new Request('http://localhost:3000/api/bitbucket/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Bitbucket account not connected');
    });

    it('should return 400 when no token available', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ session: mockSession }) as any
      );

      const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
      vi.mocked(getValidBitbucketToken).mockResolvedValue(null);

      const req = new Request('http://localhost:3000/api/bitbucket/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.needsAppAuth).toBe(true);
    });

    it('should return 400 when repo param missing', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ session: mockSession }) as any
      );

      const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
      vi.mocked(getValidBitbucketToken).mockResolvedValue('valid-token');

      const req = new Request('http://localhost:3000/api/bitbucket/branches');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Repository name is required');
    });

    it('should return branches on success', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ session: mockSession }) as any
      );

      const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
      vi.mocked(getValidBitbucketToken).mockResolvedValue('valid-token');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          values: [{ name: 'main', target: { hash: 'abc123' } }],
        }),
      }));

      const req = new Request('http://localhost:3000/api/bitbucket/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.branches).toHaveLength(1);
      expect(body.branches[0].name).toBe('main');

      vi.unstubAllGlobals();
    });

    it('should return 500 on error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ session: mockSession }) as any
      );

      const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
      vi.mocked(getValidBitbucketToken).mockResolvedValue('valid-token');

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const req = new Request('http://localhost:3000/api/bitbucket/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(500);

      vi.unstubAllGlobals();
    });
  });
});
