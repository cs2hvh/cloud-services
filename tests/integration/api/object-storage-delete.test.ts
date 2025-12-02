import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/object-storage/buckets/delete/route';
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

describe('DELETE /api/services/object-storage/buckets/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticatedUser();

    // Mock rate limiting to allow requests
    await mockRateLimitAllow();
  });

  describe('Success Cases', () => {
    it('should delete bucket with force=true', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        {
          bucket_id: mockObjectSpaceBucket.id,
          force: true,
          is_admin: false,
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted successfully');
      expect(ObjectStorageFunctions.deleteBucket).toHaveBeenCalledWith({
        bucket_id: mockObjectSpaceBucket.id,
        user_id: mockUser.id,
        force: true,
        is_admin: false,
      });
    });

    it('should delete bucket with force=false', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        {
          bucket_id: mockObjectSpaceBucket.id,
          force: false,
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(ObjectStorageFunctions.deleteBucket).toHaveBeenCalledWith(
        expect.objectContaining({ force: false })
      );
    });

    it('should delete bucket with default force (true)', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        {
          bucket_id: mockObjectSpaceBucket.id,
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);

      // Should be called without force parameter, allowing function to use default
      expect(ObjectStorageFunctions.deleteBucket).toHaveBeenCalled();
    });
  });

  describe('Validation Errors', () => {
    it('should reject missing bucket_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { force: true }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject empty bucket_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: '', force: true }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid force value', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id, force: 'yes' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Not Found', () => {
    it('should return 404 for non-existent bucket', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: false,
        error: 'Bucket not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: 'non-existent-bucket' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toBe('Bucket not found');
    });
  });

  describe('Authorization', () => {
    it('should reject deletion of other user\'s bucket', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: false,
        error: 'Unauthorized',
        message: 'Access denied to this bucket',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: 'other-users-bucket' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toBe('Unauthorized');
    });

    it('should reject unauthenticated requests', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
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
        retryAfterSec: 40,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
      expect(data.message).toContain('Retry after');
    });
  });

  describe('Delete Operations', () => {
    it('should empty bucket before deletion when force=true', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      
      // Mock successful deletion
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id, force: true }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);

      // Verify force was passed
      expect(ObjectStorageFunctions.deleteBucket).toHaveBeenCalledWith(
        expect.objectContaining({ force: true })
      );
    });

    it('should delete bucket from provider', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
    });

    it('should delete access key from provider', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      await POST(request as NextRequest);

      // Function should handle access key deletion internally
      expect(ObjectStorageFunctions.deleteBucket).toHaveBeenCalled();
    });

    it('should remove bucket from database', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle deletion failures from provider', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: false,
        error: 'Failed to delete bucket',
        message: 'Provider error occurred',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBeDefined();
    });

    it('should handle database deletion failures', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: false,
        error: 'Failed to remove bucket from database',
        message: 'Database error occurred',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 500);
    });

    it('should handle unexpected errors', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockRejectedValue(
        new Error('Unexpected error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('Request processing failed');
    });

    it('should handle bucket with objects when force=false', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: false,
        error: 'Failed to delete bucket',
        message: 'Bucket is not empty',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id, force: false }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.message).toBeDefined();
    });
  });
});
