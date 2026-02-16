//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/update_status/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Use vi.hoisted to define the mock before vi.mock is hoisted
const { mockEncrypt } = vi.hoisted(() => ({
  mockEncrypt: vi.fn((value: unknown) => ({ encrypted: value })),
}));

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/cache/cached-dns-resolver');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/config/functions', () => ({
  Encryption: {
    encrypt: mockEncrypt,
  },
}));
vi.mock('axios');

describe('POST /api/services/database/update_status', () => {
  const basePayload = {
    id: mockDatabaseCluster.cluster_id,
    public_connection: {
      host: 'public.db.example.com',
      password: 'public-pass',
      uri: 'postgres://user:public-pass@public.db.example.com:5432/app',
      port: 5432,
      user: 'doadmin',
      database: 'app',
    },
    private_connection: {
      host: 'private.db.example.com',
      password: 'private-pass',
      uri: 'postgres://user:private-pass@private.db.example.com:5432/app',
      port: 5432,
      user: 'doadmin',
      database: 'app',
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();

    const { resolveCached } = await import('@/lib/cache/cached-dns-resolver');
    vi.mocked(resolveCached).mockResolvedValue(null);

    const axios = await import('axios');
    vi.mocked(axios.default.get).mockResolvedValue({
      status: 200,
      data: { ca: { certificate: '-----BEGIN CERT-----' } },
    });

    const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
    vi.mocked(Database_Clusters.update_status).mockResolvedValue({
      success: true,
      data: { id: mockDatabaseCluster.cluster_id },
    } as any);
  });

  describe('Success Cases', () => {
    it('resolves hosts and encrypts connection details before updating status', async () => {
      const { resolveCached } = await import('@/lib/cache/cached-dns-resolver');
      vi.mocked(resolveCached)
        .mockResolvedValueOnce('203.0.113.10')
        .mockResolvedValueOnce('10.10.0.5');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/update_status',
        basePayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBe('database updated successfully');

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      expect(Database_Clusters.update_status).toHaveBeenCalledWith(
        basePayload.id,
        'online',
        expect.objectContaining({ encrypted: expect.any(String) }),
        expect.objectContaining({
          host: expect.objectContaining({ encrypted: '203.0.113.10' }),
          uri: expect.objectContaining({ encrypted: expect.stringContaining('203.0.113.10') }),
        }),
        expect.objectContaining({
          host: expect.objectContaining({ encrypted: '10.10.0.5' }),
          uri: expect.objectContaining({ encrypted: expect.stringContaining('10.10.0.5') }),
        })
      );
    });

    it('falls back to original hosts when DNS resolution fails', async () => {
      const { resolveCached } = await import('@/lib/cache/cached-dns-resolver');
      vi.mocked(resolveCached).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/update_status',
        basePayload
      );

      await POST(request as NextRequest);

      // Use the mockEncrypt spy directly instead of importing
      expect(mockEncrypt).toHaveBeenCalledWith('public.db.example.com', expect.any(String));
      expect(mockEncrypt).toHaveBeenCalledWith('private.db.example.com', expect.any(String));
    });
  });

  describe('Error Handling', () => {
    it('returns 400 when CA certificate fetch fails', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue(new Error('CA fetch failed'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/update_status',
        basePayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });

  describe('Authorization', () => {
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
        'http://localhost:3000/api/services/database/update_status',
        basePayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });
});
