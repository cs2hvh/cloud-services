import { describe, it, expect } from 'vitest';
import {
  createBucketSchema,
  deleteBucketSchema,
  updateBucketAclSchema,
  updateBucketCorsSchema,
  updateBucketVersioningSchema,
  updateBucketProjectSchema,
  validateBucketNameFormat,
  getSpacesEndpoint,
  getBucketUrl,
  formatFileSize,
  DO_SPACES_REGIONS,
} from '@/lib/validation/object-storage';

describe('Object Storage Validation', () => {
  describe('createBucketSchema', () => {
    it('should validate a correct bucket creation payload', () => {
      const validPayload = {
        type: 'bucket' as const,
        name: 'valid-bucket-name',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('valid-bucket-name');
        expect(result.data.region).toBe('nyc3');
        expect(result.data.acl).toBe('private');
      }
    });

    it('should accept public-read ACL', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'public-bucket',
        region: 'sfo2',
        acl: 'public-read' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.acl).toBe('public-read');
      }
    });

    it('should accept all valid DO Spaces regions', () => {
      const regions = ['nyc3', 'sfo2', 'sfo3', 'sgp1', 'ams3', 'fra1', 'blr1'];
      
      regions.forEach(region => {
        const payload = {
          type: 'bucket' as const,
          name: 'test-bucket',
          region,
          acl: 'private' as const,
          cors_enabled: false,
          versioning_enabled: false,
          project_id: '550e8400-e29b-41d4-a716-446655440000',
          owner_id: '550e8400-e29b-41d4-a716-446655440001',
        };

        const result = createBucketSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    it('should accept CORS and versioning enabled', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'feature-bucket',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: true,
        versioning_enabled: true,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cors_enabled).toBe(true);
        expect(result.data.versioning_enabled).toBe(true);
      }
    });

    // Bucket name validation tests
    it('should reject bucket name that is too short', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'ab',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject bucket name that is too long', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'a'.repeat(64),
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject bucket name with uppercase letters', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'Test-Bucket',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject bucket name starting with hyphen', () => {
      const payload = {
        type: 'bucket' as const,
        name: '-bucket-name',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject bucket name ending with hyphen', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'bucket-name-',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject bucket name formatted as IP address', () => {
      const payload = {
        type: 'bucket' as const,
        name: '192.168.1.1',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject bucket name starting with "xn--"', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'xn--bucket-name',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject bucket name ending with "-s3alias"', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'my-bucket-s3alias',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid region', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'valid-bucket',
        region: 'invalid-region',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid ACL value', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'valid-bucket',
        region: 'nyc3',
        acl: 'public-write' as any,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid project_id (not UUID)', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'valid-bucket',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: 'not-a-uuid',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid owner_id (not UUID)', () => {
      const payload = {
        type: 'bucket' as const,
        name: 'valid-bucket',
        region: 'nyc3',
        acl: 'private' as const,
        cors_enabled: false,
        versioning_enabled: false,
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: 'not-a-uuid',
      };

      const result = createBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('deleteBucketSchema', () => {
    it('should validate correct delete payload', () => {
      const payload = {
        bucket_id: 'test-bucket-id',
        force: true,
        is_admin: false,
      };

      const result = deleteBucketSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should allow optional force and is_admin fields', () => {
      const payload = {
        bucket_id: 'test-bucket-id',
      };

      const result = deleteBucketSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject empty bucket_id', () => {
      const payload = {
        bucket_id: '',
      };

      const result = deleteBucketSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('updateBucketAclSchema', () => {
    it('should validate ACL update to private', () => {
      const payload = {
        bucket_id: 'test-bucket',
        acl: 'private' as const,
      };

      const result = updateBucketAclSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate ACL update to public-read', () => {
      const payload = {
        bucket_id: 'test-bucket',
        acl: 'public-read' as const,
      };

      const result = updateBucketAclSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid ACL value', () => {
      const payload = {
        bucket_id: 'test-bucket',
        acl: 'public-write' as any,
      };

      const result = updateBucketAclSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('updateBucketCorsSchema', () => {
    it('should validate CORS enable', () => {
      const payload = {
        bucket_id: 'test-bucket',
        enabled: true,
      };

      const result = updateBucketCorsSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate CORS disable', () => {
      const payload = {
        bucket_id: 'test-bucket',
        enabled: false,
      };

      const result = updateBucketCorsSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject non-boolean enabled value', () => {
      const payload = {
        bucket_id: 'test-bucket',
        enabled: 'yes' as any,
      };

      const result = updateBucketCorsSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('updateBucketVersioningSchema', () => {
    it('should validate versioning enable', () => {
      const payload = {
        bucket_id: 'test-bucket',
        enabled: true,
      };

      const result = updateBucketVersioningSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate versioning disable', () => {
      const payload = {
        bucket_id: 'test-bucket',
        enabled: false,
      };

      const result = updateBucketVersioningSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('updateBucketProjectSchema', () => {
    it('should validate project update with UUID', () => {
      const payload = {
        bucket_id: 'test-bucket',
        project_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = updateBucketProjectSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate project update with null', () => {
      const payload = {
        bucket_id: 'test-bucket',
        project_id: null,
      };

      const result = updateBucketProjectSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const payload = {
        bucket_id: 'test-bucket',
        project_id: 'not-a-uuid',
      };

      const result = updateBucketProjectSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('validateBucketNameFormat', () => {
    it('should validate correct bucket name', () => {
      const result = validateBucketNameFormat('valid-bucket-name');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid bucket name and return error message', () => {
      const result = validateBucketNameFormat('AB');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate bucket name with numbers', () => {
      const result = validateBucketNameFormat('bucket-123-name');
      expect(result.valid).toBe(true);
    });
  });

  describe('getSpacesEndpoint', () => {
    it('should return correct endpoint for nyc3', () => {
      const endpoint = getSpacesEndpoint('nyc3');
      expect(endpoint).toBe('https://nyc3.digitaloceanspaces.com');
    });

    it('should return correct endpoint for all regions', () => {
      DO_SPACES_REGIONS.forEach(region => {
        const endpoint = getSpacesEndpoint(region);
        expect(endpoint).toBe(`https://${region}.digitaloceanspaces.com`);
      });
    });
  });

  describe('getBucketUrl', () => {
    it('should return correct bucket URL', () => {
      const url = getBucketUrl('my-bucket', 'nyc3');
      expect(url).toBe('https://my-bucket.nyc3.digitaloceanspaces.com');
    });

    it('should work with different regions', () => {
      const url = getBucketUrl('test-bucket', 'sfo2');
      expect(url).toBe('https://test-bucket.sfo2.digitaloceanspaces.com');
    });
  });

  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500 Bytes');
    });

    it('should format KB', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(2048)).toBe('2 KB');
    });

    it('should format MB', () => {
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(5242880)).toBe('5 MB');
    });

    it('should format GB', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB');
      expect(formatFileSize(2147483648)).toBe('2 GB');
    });

    it('should format TB', () => {
      expect(formatFileSize(1099511627776)).toBe('1 TB');
    });

    it('should round to 2 decimal places', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1572864)).toBe('1.5 MB');
    });
  });
});
