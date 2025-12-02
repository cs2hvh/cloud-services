import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/object-storage/buckets/read/route';
import { NextRequest } from 'next/server';
import { mockObjectSpaceBucket, mockUser } from '../../utils/mock-data';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockRateLimitAllow,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/config/object-storage-functions');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/services/object-storage/buckets/read', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticatedUser();

    // Mock rate limiting to allow requests
    await mockRateLimitAllow();
  });

  describe('Success Cases', () => {
    it('should read bucket with valid ID', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.readBucket).mockResolvedValue({
        success: true,
        data: {
          ...mockObjectSpaceBucket,
          endpoint: 'https://test-bucket-12345.nyc3.digitaloceanspaces.com',
          key_id: 'DO00ABC123XYZ',
          secret_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCY',
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBe(mockObjectSpaceBucket.id);
      expect(ObjectStorageFunctions.readBucket).toHaveBeenCalledWith({
        bucket_id: mockObjectSpaceBucket.id,
        user_id: mockUser.id,
      });
    });

    it('should return decrypted credentials', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.readBucket).mockResolvedValue({
        success: true,
        data: {
          ...mockObjectSpaceBucket,
          endpoint: 'https://test-bucket-12345.nyc3.digitaloceanspaces.com',
          key_id: 'DECRYPTED_ACCESS_KEY',
          secret_key: 'DECRYPTED_SECRET_KEY',
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.data.key_id).toBe('DECRYPTED_ACCESS_KEY');
      expect(data.data.secret_key).toBe('DECRYPTED_SECRET_KEY');
      expect(data.data.endpoint).toContain('digitaloceanspaces.com');
    });

    it('should return live bucket stats', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.readBucket).mockResolvedValue({
        success: true,
        data: {
          ...mockObjectSpaceBucket,
          size_bytes: 2097152, // 2 MB (updated from live stats)
          object_count: 10, // Updated from live stats
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.data.size_bytes).toBe(2097152);
      expect(data.data.object_count).toBe(10);
    });
  });

  describe('Validation Errors', () => {
    it('should reject missing bucket_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid request');
      expect(data.message).toContain('Bucket ID is required');
    });

    it('should reject invalid bucket_id type', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: 123 }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid request');
    });

    it('should reject empty bucket_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: '' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid request');
    });
  });

  describe('Not Found', () => {
    it('should return 404 for non-existent bucket', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.readBucket).mockResolvedValue({
        success: false,
        error: 'Bucket not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: 'non-existent-bucket' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toBe('Bucket not found');
    });
  });

  describe('Authorization', () => {
    it('should reject access to other user\'s bucket', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.readBucket).mockResolvedValue({
        success: false,
        error: 'Unauthorized',
        message: 'Access denied to this bucket',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: 'other-users-bucket' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toBe('Unauthorized');
      expect(data.message).toContain('Access denied');
    });

    it('should reject unauthenticated requests', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });
  });

  describe('Rate Limiting', () => {
    it('should reject requests exceeding rate limit', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 20,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
      expect(data.message).toContain('Retry after');
    });
  });

  describe('Error Handling', () => {
    it('should handle read failures gracefully', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.readBucket).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve bucket',
        message: 'Internal error occurred',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBeDefined();
    });

    it('should handle unexpected errors', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.readBucket).mockRejectedValue(
        new Error('Unexpected error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/read',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('Request processing failed');
    });
  });
});
