import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/object-storage/buckets/create/route';
import { NextRequest } from 'next/server';
import {
  mockCreateBucketPayload,
  mockObjectSpaceBucket,
  mockDigitalOceanSpacesKey,
  mockInvalidBucketPayloads,
  mockUser,
} from '../../utils/mock-data';
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
vi.mock('@/config/object-storage-functions');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/services/object-storage/buckets/create', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticatedUser();

    // Mock rate limiting to allow requests
    await mockRateLimitAllow();
  });

  describe('Success Cases', () => {
    it('should create bucket with valid data', async () => {
      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.createBucket).mockResolvedValue({
        success: true,
        data: mockObjectSpaceBucket,
        message: 'Bucket created successfully with secure access credentials',
      });

      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockCreateBucketPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 201);

      expect(data.success).toBe(true);
      expect(data.message).toContain('created successfully');
      expect(ObjectStorageFunctions.createBucket).toHaveBeenCalledWith({
        name: mockCreateBucketPayload.name,
        region: mockCreateBucketPayload.region,
        acl: mockCreateBucketPayload.acl,
        cors_enabled: mockCreateBucketPayload.cors_enabled,
        versioning_enabled: mockCreateBucketPayload.versioning_enabled,
        owner_id: mockCreateBucketPayload.owner_id,
        project_id: mockCreateBucketPayload.project_id,
      });
    });

    it('should create bucket with public ACL', async () => {
      const payload = {
        ...mockCreateBucketPayload,
        name: 'public-bucket-test',
        acl: 'public-read' as const,
      };

      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.createBucket).mockResolvedValue({
        success: true,
        data: { ...mockObjectSpaceBucket, acl: 'public-read' },
        message: 'Bucket created successfully',
      });

      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        payload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 201);

      expect(ObjectStorageFunctions.createBucket).toHaveBeenCalledWith(
        expect.objectContaining({ acl: 'public-read' })
      );
    });

    it('should create bucket with CORS enabled', async () => {
      const payload = {
        ...mockCreateBucketPayload,
        name: 'cors-bucket-test',
        cors_enabled: true,
      };

      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.createBucket).mockResolvedValue({
        success: true,
        data: { ...mockObjectSpaceBucket, cors_enabled: true },
        message: 'Bucket created successfully',
      });

      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        payload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 201);

      expect(ObjectStorageFunctions.createBucket).toHaveBeenCalledWith(
        expect.objectContaining({ cors_enabled: true })
      );
    });

    it('should create bucket with versioning enabled', async () => {
      const payload = {
        ...mockCreateBucketPayload,
        name: 'versioning-bucket-test',
        versioning_enabled: true,
      };

      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.createBucket).mockResolvedValue({
        success: true,
        data: { ...mockObjectSpaceBucket, versioning_enabled: true },
        message: 'Bucket created successfully',
      });

      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        payload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 201);

      expect(ObjectStorageFunctions.createBucket).toHaveBeenCalledWith(
        expect.objectContaining({ versioning_enabled: true })
      );
    });

    it('should create bucket in different regions', async () => {
      const regions = ['nyc3', 'sfo2', 'sfo3', 'sgp1', 'ams3', 'fra1', 'blr1'];

      for (const region of regions) {
        vi.clearAllMocks();

        const payload = {
          ...mockCreateBucketPayload,
          name: `${region}-bucket`,
          region,
        };

        const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
        vi.mocked(ObjectStorageFunctions.createBucket).mockResolvedValue({
          success: true,
          data: { ...mockObjectSpaceBucket, region },
          message: 'Bucket created successfully',
        });

        const { ObjectSpaces } = await import('@/lib/supabase/queries');
        vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

        const request = createMockPostRequest(
          'http://localhost:3000/api/services/object-storage/buckets/create',
          payload
        );

        const response = await POST(request as NextRequest);
        await expectResponseStatus(response, 201);

        expect(ObjectStorageFunctions.createBucket).toHaveBeenCalledWith(
          expect.objectContaining({ region })
        );
      }
    });
  });

  describe('Validation Errors', () => {
    it('should reject bucket name that is too short', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockInvalidBucketPayloads.nameTooShort
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject bucket name that is too long', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockInvalidBucketPayloads.nameTooLong
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject bucket name with uppercase letters', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockInvalidBucketPayloads.nameWithUppercase
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject bucket name formatted as IP address', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockInvalidBucketPayloads.nameIPFormat
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid region', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockInvalidBucketPayloads.invalidRegion
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid ACL', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockInvalidBucketPayloads.invalidACL
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid project_id', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockInvalidBucketPayloads.invalidProjectId
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid owner_id', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockInvalidBucketPayloads.invalidOwnerId
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Duplicate Bucket', () => {
    it('should reject duplicate bucket name (database check)', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(mockObjectSpaceBucket);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockCreateBucketPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toBe('Bucket name already exists');
    });

    it('should reject duplicate bucket name (provider check)', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.createBucket).mockResolvedValue({
        success: false,
        error: 'Bucket already exists',
        message: 'A bucket with this name already exists. Please choose a different name.',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockCreateBucketPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toBe('Bucket already exists');
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockCreateBucketPayload
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
        retryAfterSec: 30,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockCreateBucketPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
      expect(data.message).toContain('Retry after');
    });
  });

  describe('Error Handling', () => {
    it('should handle creation failures gracefully', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockResolvedValue(null);

      const { ObjectStorageFunctions } = await import('@/config/object-storage-functions');
      vi.mocked(ObjectStorageFunctions.createBucket).mockResolvedValue({
        success: false,
        error: 'Failed to create storage bucket',
        message: 'Provider error occurred',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockCreateBucketPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBeDefined();
    });

    it('should handle unexpected errors', async () => {
      const { ObjectSpaces } = await import('@/lib/supabase/queries');
      vi.mocked(ObjectSpaces.get_bucket_by_bucket_id).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/object-storage/buckets/create',
        mockCreateBucketPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('Request processing failed');
    });
  });
});
