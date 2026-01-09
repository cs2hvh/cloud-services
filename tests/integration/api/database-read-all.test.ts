import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/read_all_owner/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster, mockUser } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/auth');
vi.mock('@/config/functions', () => ({
  Encryption: {
    decrypt: vi.fn((value: any) => {
      if (value && typeof value === 'object' && 'encrypted' in value) {
        return 'decrypted-value';
      }
      return value;
    }),
  },
}));

describe('POST /api/services/database/read_all_owner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();

    const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
    vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
      success: true,
      data: [mockDatabaseCluster],
    });

    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as any);
  });

  describe('Success Cases', () => {
    it('returns decrypted clusters for the authenticated owner', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const payload = await expectResponseStatus(response!, 200);

      expect(Array.isArray(payload.data)).toBe(true);
      expect(payload.data[0].name).toBe(mockDatabaseCluster.name);
      expect(payload.message).toBe('database fetched successfully');
    });

    it('allows admins to fetch another owner\'s clusters', async () => {
      const otherOwnerId = '11111111-1111-1111-1111-111111111111';
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { id: otherOwnerId }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 200);

      expect(requireAdmin).toHaveBeenCalled();
    });
  });

  describe('Authorization', () => {
    it('rejects non-admins attempting to read another owner\'s clusters', async () => {
      const otherOwnerId = '22222222-2222-2222-2222-222222222222';
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { id: otherOwnerId }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 403);
    });

    it('rejects unauthenticated requests', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      const { NextResponse } = await import('next/server');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ) as any,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Data Handling', () => {
    it('decrypts sensitive fields before returning them', async () => {
      const encryptedCluster = {
        ...mockDatabaseCluster,
        public_connection: {
          ...mockDatabaseCluster.public_connection,
          host: {
            encrypted: 'encrypted-host',
            iv: 'iv',
            tag: 'tag',
            salt: 'salt',
          } as any,
        },
        users: [
          {
            ...mockDatabaseCluster.users?.[0],
            password: {
              encrypted: 'encrypted-pass',
              iv: 'iv',
              tag: 'tag',
              salt: 'salt',
            } as any,
          },
        ],
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValueOnce({
        success: true,
        data: [encryptedCluster as any],
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const payload = await expectResponseStatus(response!, 200);

      expect(payload.data[0].public_connection?.host).toBe('decrypted-value');
      expect(payload.data[0].users?.[0].password).toBe('decrypted-value');
    });
  });

  describe('Failures', () => {
    it('bubbles up query exceptions', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read_all_owner).mockRejectedValue(new Error('Supabase connection failed'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });
});
