import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as UpdateACL } from '@/app/api/services/object-storage/buckets/settings/update-acl/route';
import { POST as UpdateCORS } from '@/app/api/services/object-storage/buckets/settings/update-cors/route';
import { POST as UpdateVersioning } from '@/app/api/services/object-storage/buckets/settings/update-versioning/route';
import { POST as UpdateProject } from '@/app/api/services/object-storage/buckets/settings/update-project/route';
import { NextRequest } from 'next/server';
import { mockObjectSpaceBucket, mockProject, mockUser } from '../../utils/mock-data';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockRateLimitAllow,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/aws/s3-client');
vi.mock('@/lib/aws/s3-operations');
vi.mock('@/lib/cooldown/userbased');

describe('PUT /api/services/object-storage/buckets/settings', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticatedUser();

    // Mock rate limiting to allow requests
    await mockRateLimitAllow();
  });

  describe('POST /api/services/object-storage/buckets/settings/update-acl', () => {
    it('should update ACL to public-read', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);
      vi.mocked(ObjectSpaces.update_bucket_settings).mockResolvedValue({ success: true });

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      vi.mocked(createS3ClientFromAccessKey).mockReturnValue({} as any);

      const { updateBucketACL } = await import('@/lib/aws/s3-operations');
      vi.mocked(updateBucketACL).mockResolvedValue({ success: true });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-acl',
        {
          bucket_id: mockObjectSpaceBucket.id,
          acl: 'public-read',
        }
      );

      const response = await UpdateACL(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('ACL updated successfully');
      expect(updateBucketACL).toHaveBeenCalledWith(expect.anything(), mockObjectSpaceBucket.name, 'public-read');
      expect(ObjectSpaces.update_bucket_settings).toHaveBeenCalledWith(
        mockObjectSpaceBucket.id,
        { acl: 'public-read' }
      );
    });

    it('should update ACL to private', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);
      vi.mocked(ObjectSpaces.update_bucket_settings).mockResolvedValue({ success: true });

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      vi.mocked(createS3ClientFromAccessKey).mockReturnValue({} as any);

      const { updateBucketACL } = await import('@/lib/aws/s3-operations');
      vi.mocked(updateBucketACL).mockResolvedValue({ success: true });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-acl',
        {
          bucket_id: mockObjectSpaceBucket.id,
          acl: 'private',
        }
      );

      const response = await UpdateACL(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(updateBucketACL).toHaveBeenCalledWith(expect.anything(), mockObjectSpaceBucket.name, 'private');
    });

    it('should reject invalid ACL value', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-acl',
        {
          bucket_id: mockObjectSpaceBucket.id,
          acl: 'public-write',
        }
      );

      const response = await UpdateACL(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject unauthorized user', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue({
        ...mockObjectSpaceBucket,
        owner_id: 'different-user',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-acl',
        {
          bucket_id: mockObjectSpaceBucket.id,
          acl: 'private',
        }
      );

      const response = await UpdateACL(request as NextRequest);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toBe('Unauthorized');
    });

    it('should reject bucket not found', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-acl',
        {
          bucket_id: 'non-existent',
          acl: 'private',
        }
      );

      const response = await UpdateACL(request as NextRequest);
      await expectResponseStatus(response, 404);
    });
  });

  describe('POST /api/services/object-storage/buckets/settings/update-cors', () => {
    it('should enable CORS', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);
      vi.mocked(ObjectSpaces.update_bucket_settings).mockResolvedValue({ success: true });

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      vi.mocked(createS3ClientFromAccessKey).mockReturnValue({} as any);

      const { updateBucketCORS } = await import('@/lib/aws/s3-operations');
      vi.mocked(updateBucketCORS).mockResolvedValue({ success: true });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-cors',
        {
          bucket_id: mockObjectSpaceBucket.id,
          enabled: true,
        }
      );

      const response = await UpdateCORS(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('CORS enabled successfully');
      expect(updateBucketCORS).toHaveBeenCalledWith(expect.anything(), mockObjectSpaceBucket.name, true);
      expect(ObjectSpaces.update_bucket_settings).toHaveBeenCalledWith(
        mockObjectSpaceBucket.id,
        { cors_enabled: true }
      );
    });

    it('should disable CORS', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);
      vi.mocked(ObjectSpaces.update_bucket_settings).mockResolvedValue({ success: true });

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      vi.mocked(createS3ClientFromAccessKey).mockReturnValue({} as any);

      const { updateBucketCORS } = await import('@/lib/aws/s3-operations');
      vi.mocked(updateBucketCORS).mockResolvedValue({ success: true });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-cors',
        {
          bucket_id: mockObjectSpaceBucket.id,
          enabled: false,
        }
      );

      const response = await UpdateCORS(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('CORS disabled successfully');
      expect(updateBucketCORS).toHaveBeenCalledWith(expect.anything(), mockObjectSpaceBucket.name, false);
    });

    it('should reject invalid enabled value', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-cors',
        {
          bucket_id: mockObjectSpaceBucket.id,
          enabled: 'yes',
        }
      );

      const response = await UpdateCORS(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('POST /api/services/object-storage/buckets/settings/update-versioning', () => {
    it('should enable versioning', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);
      vi.mocked(ObjectSpaces.update_bucket_settings).mockResolvedValue({ success: true });

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      vi.mocked(createS3ClientFromAccessKey).mockReturnValue({} as any);

      const { updateBucketVersioning } = await import('@/lib/aws/s3-operations');
      vi.mocked(updateBucketVersioning).mockResolvedValue({ success: true });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-versioning',
        {
          bucket_id: mockObjectSpaceBucket.id,
          enabled: true,
        }
      );

      const response = await UpdateVersioning(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('Bucket versioning enabled successfully');
      expect(updateBucketVersioning).toHaveBeenCalledWith(expect.anything(), mockObjectSpaceBucket.name, true);
      expect(ObjectSpaces.update_bucket_settings).toHaveBeenCalledWith(
        mockObjectSpaceBucket.id,
        { versioning_enabled: true }
      );
    });

    it('should disable versioning', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);
      vi.mocked(ObjectSpaces.update_bucket_settings).mockResolvedValue({ success: true });

      const { createS3ClientFromAccessKey } = await import('@/lib/aws/s3-client');
      vi.mocked(createS3ClientFromAccessKey).mockReturnValue({} as any);

      const { updateBucketVersioning } = await import('@/lib/aws/s3-operations');
      vi.mocked(updateBucketVersioning).mockResolvedValue({ success: true });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-versioning',
        {
          bucket_id: mockObjectSpaceBucket.id,
          enabled: false,
        }
      );

      const response = await UpdateVersioning(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('Bucket versioning disabled successfully');
    });
  });

  describe('POST /api/services/object-storage/buckets/settings/update-project', () => {
    it('should update project_id', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);
      vi.mocked(ObjectSpaces.update_bucket_settings).mockResolvedValue({ success: true });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-project',
        {
          bucket_id: mockObjectSpaceBucket.id,
          project_id: mockProject.id,
        }
      );

      const response = await UpdateProject(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('Bucket project assignment updated successfully');
      expect(ObjectSpaces.update_bucket_settings).toHaveBeenCalledWith(
        mockObjectSpaceBucket.id,
        { project_id: mockProject.id }
      );
    });

    it('should set project_id to null', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);
      vi.mocked(ObjectSpaces.update_bucket_settings).mockResolvedValue({ success: true });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-project',
        {
          bucket_id: mockObjectSpaceBucket.id,
          project_id: null,
        }
      );

      const response = await UpdateProject(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(ObjectSpaces.update_bucket_settings).toHaveBeenCalledWith(
        mockObjectSpaceBucket.id,
        { project_id: null }
      );
    });

    it('should reject invalid project_id (not UUID)', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-project',
        {
          bucket_id: mockObjectSpaceBucket.id,
          project_id: 'not-a-uuid',
        }
      );

      const response = await UpdateProject(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Common Error Handling', () => {
    it('should reject unauthenticated requests', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-acl',
        {
          bucket_id: mockObjectSpaceBucket.id,
          acl: 'private',
        }
      );

      const response = await UpdateACL(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should respect rate limits', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 25,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/settings/update-acl',
        {
          bucket_id: mockObjectSpaceBucket.id,
          acl: 'private',
        }
      );

      const response = await UpdateACL(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
    });
  });
});
