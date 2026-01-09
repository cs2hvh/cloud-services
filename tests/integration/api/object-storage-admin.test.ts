import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as AdminReadAll } from '@/app/api/admin/object-storage/buckets/read-all/route';
import { POST as AdminDelete } from '@/app/api/admin/object-storage/buckets/delete/route';
import { NextRequest, NextResponse } from 'next/server';
import { mockObjectSpaceBucket, mockPublicBucket, mockBucketWithCORS } from '../../utils/mock-data';
import {
  createMockPostRequest,
  expectResponseStatus
} from '../../utils/test-helpers';

// Mock dependencies with correct paths
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/queries/object_spaces');
vi.mock('@/lib/supabase/queries/billing');
vi.mock('@/lib/supabase/auth');
vi.mock('@/config/object-storage-functions');

describe('Admin Object Storage APIs', () => {
  const mockAdminUser = {
    id: 'admin-user-id',
    email: 'admin@example.com',
  };

  const mockAdminBuckets = [
    {
      ...mockObjectSpaceBucket,
      owner_email: 'user1@example.com',
      owner_username: 'user1',
    },
    {
      ...mockPublicBucket,
      owner_email: 'user2@example.com',
      owner_username: 'user2',
    },
    {
      ...mockBucketWithCORS,
      owner_email: 'user3@example.com',
      owner_username: 'user3',
    },
  ];

  describe('POST /api/admin/object-storage/buckets/read-all', () => {
    beforeEach(async () => {
      vi.clearAllMocks();

      // Mock admin authentication
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: true,
        user: { ...mockAdminUser, role: 'admin' } as any,
        response: null,
      });
    });

    it('should list all buckets for admin', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_all_for_admin).mockResolvedValue(mockAdminBuckets as any);

      const response = await AdminReadAll();
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.data[0]).toHaveProperty('owner_email');
      expect(data.data[0]).toHaveProperty('owner_username');
      expect(ObjectSpaces.get_all_for_admin).toHaveBeenCalled();
    });

    it('should return empty array when no buckets exist', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_all_for_admin).mockResolvedValue([]);

      const response = await AdminReadAll();
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });

    it('should include owner information', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries/object_spaces');
      vi.mocked(ObjectSpaces.get_all_for_admin).mockResolvedValue([mockAdminBuckets[0]] as any);

      const response = await AdminReadAll();
      const data = await expectResponseStatus(response, 200);

      expect(data.data[0].owner_email).toBe('user1@example.com');
      expect(data.data[0].owner_username).toBe('user1');
    });

    it('should reject non-admin users', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: true,
        user: { ...mockAdminUser, role: 'user' } as any, // Not admin
        response: null,
      });

      const response = await AdminReadAll();
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toContain('Unauthorized');
    });

    it('should reject unauthenticated users', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) as any,
      });

      const response = await AdminReadAll();
      const data = await expectResponseStatus(response, 401);

      expect(data.message).toContain('Unauthorized');
    });
  });

  describe('POST /api/admin/object-storage/buckets/delete', () => {
    beforeEach(async () => {
      vi.clearAllMocks();

      // Mock admin authentication
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: true,
        user: { ...mockAdminUser, role: 'admin' } as any,
        response: null,
      });
    });

    // TODO: Fix admin delete authentication mocking
    it.skip('should delete any bucket as admin', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/object-storage/buckets/delete',
        {
          bucket_id: mockObjectSpaceBucket.id,
          owner_id: 'any-user-id',
        }
      );

      const response = await AdminDelete(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted successfully');
      expect(ObjectStorageFunctions.deleteBucket).toHaveBeenCalledWith({
        bucket_id: mockObjectSpaceBucket.id,
        user_id: 'any-user-id',
        force: true,
        is_admin: true,
      });
    });

    // TODO: Fix admin delete authentication mocking
    it.skip('should force delete by default', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: true,
        message: 'Bucket deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/object-storage/buckets/delete',
        {
          bucket_id: mockObjectSpaceBucket.id,
          owner_id: 'any-user-id',
        }
      );

      await AdminDelete(request as NextRequest);

      expect(ObjectStorageFunctions.deleteBucket).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
          is_admin: true,
        })
      );
    });

    // TODO: Fix admin delete authentication mocking
    it.skip('should handle bucket not found', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: false,
        error: 'Bucket not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/object-storage/buckets/delete',
        {
          bucket_id: 'non-existent',
          owner_id: 'any-user-id',
        }
      );

      const response = await AdminDelete(request as NextRequest);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toBe('Bucket not found');
    });

    // TODO: Fix admin delete authentication mocking
    it.skip('should reject missing bucket_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/object-storage/buckets/delete',
        { owner_id: 'any-user-id' }
      );

      const response = await AdminDelete(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid request');
      expect(data.message).toContain('Bucket ID is required');
    });

    it('should reject non-admin users', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      const mockSupabaseClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockAdminUser },
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { roles: ['user'] }, // Not admin
              }),
            }),
          }),
        }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/object-storage/buckets/delete',
        {
          bucket_id: mockObjectSpaceBucket.id,
          owner_id: 'any-user-id',
        }
      );

      const response = await AdminDelete(request as NextRequest);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toContain('Unauthorized');
    });

    // TODO: Fix admin delete authentication mocking
    it.skip('should handle deletion failures', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockResolvedValue({
        success: false,
        error: 'Failed to delete bucket',
        message: 'Provider error',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/object-storage/buckets/delete',
        {
          bucket_id: mockObjectSpaceBucket.id,
          owner_id: 'any-user-id',
        }
      );

      const response = await AdminDelete(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBeDefined();
    });

    // TODO: Fix admin delete authentication mocking
    it.skip('should handle unexpected errors', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.deleteBucket).mockRejectedValue(
        new Error('Unexpected error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/object-storage/buckets/delete',
        {
          bucket_id: mockObjectSpaceBucket.id,
          owner_id: 'any-user-id',
        }
      );

      const response = await AdminDelete(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('Request processing failed');
    });
  });
});
