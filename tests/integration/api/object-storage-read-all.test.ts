import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/object-storage/buckets/read_all/route';
import { NextRequest } from 'next/server';
import {
  mockObjectSpaceBucket,
  mockPublicBucket,
  mockBucketWithCORS,
  mockUser,
} from '../../utils/mock-data';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockRateLimitAllow,
} from '../../utils/test-helpers';

// Mock dependencies with correct paths
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/object_spaces');
vi.mock('@/config/functions');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/services/object-storage/buckets/read_all', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
    process.env.ENCRYPTION_KEY = 'test-encryption-key';

    // Mock rate limiting to allow requests
    await mockRateLimitAllow();

    // Mock encryption for endpoint decryption
    const { Encryption } = await import('@/config/functions');
    vi.mocked(Encryption.decrypt).mockImplementation((encrypted: any) => {
      return 'https://test-bucket.nyc3.digitaloceanspaces.com';
    });
  });

  describe('Success Cases', () => {
    it('TC-OBJ-032: should list all user buckets', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_buckets).mockResolvedValue([
        mockObjectSpaceBucket,
        mockPublicBucket,
        mockBucketWithCORS,
      ]);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.count).toBe(3);
      expect(ObjectSpaces.get_buckets).toHaveBeenCalledWith(mockUser.id);
    });

    it('TC-OBJ-033: should return empty array for user with no buckets', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_buckets).mockResolvedValue([]);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
      expect(data.count).toBe(0);
    });

    it('TC-OBJ-034: should decrypt bucket endpoints', async () => {
      // Use a bucket with a non-encrypted endpoint (no '{' prefix) to verify pass-through
      const plainEndpointBucket = {
        ...mockObjectSpaceBucket,
        endpoint: 'https://test-bucket.nyc3.digitaloceanspaces.com',
      };

      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_buckets).mockResolvedValue([plainEndpointBucket]);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      // Plain endpoints (not starting with '{') pass through without decryption
      expect(data.data[0].endpoint).toBe('https://test-bucket.nyc3.digitaloceanspaces.com');
      expect(data.data[0].name).toBe(mockObjectSpaceBucket.name);
    });

    it('TC-OBJ-035: should handle decryption failures gracefully', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_buckets).mockResolvedValue([
        {
          ...mockObjectSpaceBucket,
          endpoint: 'plain-endpoint', // Not encrypted
        },
      ]);

      const { Encryption } = await import('@/config/functions');
      vi.mocked(Encryption.decrypt).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      // Should still return buckets with original endpoint
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
    });
  });

  describe('Authorization', () => {
    it('TC-OBJ-036: should reject request for different user\'s buckets', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: 'different-user-id' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toBe('Unauthorized');
      expect(data.message).toContain('You can only view your own buckets');
    });

    it('TC-OBJ-037: should reject unauthenticated requests', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });
  });

  describe('Rate Limiting', () => {
    it('TC-OBJ-038: should reject requests exceeding rate limit', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 15,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
      expect(data.message).toContain('Retry after');
    });
  });

  describe('Error Handling', () => {
    it('TC-OBJ-039: should handle database errors gracefully', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_buckets).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('Request processing failed');
    });

    it('TC-OBJ-040: should handle unexpected errors', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_buckets).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read_all',
        { owner_id: mockUser.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('Request processing failed');
    });
  });
});
