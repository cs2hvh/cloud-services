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

// Mock dependencies with correct paths
vi.mock('@/lib/auth/server-auth');
vi.mock('@/config/object-storage-functions');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/supabase/queries/billing');

describe('DELETE /api/services/object-storage/buckets/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticatedUser();

    // Mock rate limiting to allow requests
    await mockRateLimitAllow();

    // Mock admin check (non-admin by default)
    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

    // Mock billing close
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Billing.close_active_service).mockResolvedValue({ success: true } as any);
  });

  describe('Success Cases', () => {
    it('TC-OBJ-041: should delete bucket with force=true', async () => {
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

    it('TC-OBJ-042: should delete bucket with force=false', async () => {
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

    it('TC-OBJ-043: should delete bucket with default force (true)', async () => {
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
    it('TC-OBJ-044: should reject missing bucket_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { force: true }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('TC-OBJ-045: should reject empty bucket_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: '', force: true }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('TC-OBJ-046: should reject invalid force value', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/delete',
        { bucket_id: mockObjectSpaceBucket.id, force: 'yes' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Not Found', () => {
    it('TC-OBJ-047: should return 404 for non-existent bucket', async () => {
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
    it('TC-OBJ-048: should reject deletion of other user\'s bucket', async () => {
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

    it('TC-OBJ-049: should reject unauthenticated requests', async () => {
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
    it('TC-OBJ-050: should reject requests exceeding rate limit', async () => {
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
    it('TC-OBJ-051: should empty bucket before deletion when force=true', async () => {
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

    it('TC-OBJ-052: should delete bucket from provider', async () => {
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

    it('TC-OBJ-053: should delete access key from provider', async () => {
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

    it('TC-OBJ-054: should remove bucket from database', async () => {
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
    it('TC-OBJ-055: should handle deletion failures from provider', async () => {
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

    it('TC-OBJ-056: should handle database deletion failures', async () => {
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

    it('TC-OBJ-057: should handle unexpected errors', async () => {
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

    it('TC-OBJ-058: should handle bucket with objects when force=false', async () => {
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
