import { describe, it, expect } from 'vitest';
import {
  createPlatformAppSchema,
  updatePlatformAppSchema,
  deletePlatformAppSchema,
  getPlatformAppSchema,
  validateCustomSpec,
} from '@/lib/validation/platform-apps';
import {
  mockCreatePlatformAppPayload,
  mockInvalidPlatformAppPayloads,
  validFrameworks,
  validGitProviders,
  validSizes,
} from '../../utils/mock-data-platform-apps';

/**
 * Platform Apps Validation Schema Tests
 * Tests for Zod validation schemas used in platform app operations
 */

describe('Platform Apps Validation Schemas', () => {
  // ============================================
  // createPlatformAppSchema Tests
  // ============================================
  describe('createPlatformAppSchema', () => {
    describe('Valid Payloads', () => {
      it('TC-PA-U001: should accept valid app name with lowercase and hyphens', () => {
        const payload = { ...mockCreatePlatformAppPayload, name: 'my-valid-app' };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('TC-PA-U002: should accept app name with numbers', () => {
        const payload = { ...mockCreatePlatformAppPayload, name: 'app123test' };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('TC-PA-U003: should accept minimum length app name (3 chars)', () => {
        const payload = { ...mockCreatePlatformAppPayload, name: 'abc' };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('TC-PA-U004: should accept maximum length app name (40 chars)', () => {
        const payload = {
          ...mockCreatePlatformAppPayload,
          name: 'a' + 'b'.repeat(38) + 'c', // 40 chars, starts and ends with letter
        };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it.each(validGitProviders)(
        'TC-PA-U005: should accept valid git provider: %s',
        (provider) => {
          const payload = { ...mockCreatePlatformAppPayload, git_provider: provider };
          const result = createPlatformAppSchema.safeParse(payload);
          expect(result.success).toBe(true);
        }
      );

      it.each(validFrameworks)(
        'TC-PA-U007: should accept valid framework: %s',
        (framework) => {
          const payload = { ...mockCreatePlatformAppPayload, framework };
          const result = createPlatformAppSchema.safeParse(payload);
          expect(result.success).toBe(true);
        }
      );

      it.each(validSizes)('TC-PA-U009: should accept valid size: %s', (size) => {
        const payload = { ...mockCreatePlatformAppPayload, size };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('TC-PA-U011: should accept valid repository URL', () => {
        const payload = {
          ...mockCreatePlatformAppPayload,
          repository_url: 'https://github.com/user/repo',
        };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('TC-PA-U013: should accept valid env_vars array', () => {
        const payload = {
          ...mockCreatePlatformAppPayload,
          env_vars: [
            { key: 'NODE_ENV', value: 'production' },
            { key: 'API_KEY', value: 'secret123' },
          ],
        };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('TC-PA-U015: should accept valid UUID for project_id', () => {
        const payload = {
          ...mockCreatePlatformAppPayload,
          project_id: '550e8400-e29b-41d4-a716-446655440000',
        };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept payload without optional fields', () => {
        const payload = {
          name: 'minimal-app',
          git_provider: 'github',
          repository_id: 'repo-123',
          repository_name: 'user/repo',
          repository_url: 'https://github.com/user/repo',
          branch: 'main',
          framework: 'Next.js',
        };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should default size to small when not provided', () => {
        const payload = {
          name: 'test-app',
          git_provider: 'github',
          repository_id: 'repo-123',
          repository_name: 'user/repo',
          repository_url: 'https://github.com/user/repo',
          branch: 'main',
          framework: 'Next.js',
        };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.size).toBe('small');
        }
      });

      it('should default auto_deploy to false when not provided', () => {
        const payload = {
          name: 'test-app',
          git_provider: 'github',
          repository_id: 'repo-123',
          repository_name: 'user/repo',
          repository_url: 'https://github.com/user/repo',
          branch: 'main',
          framework: 'Next.js',
        };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.auto_deploy).toBe(false);
        }
      });

      it('should default env_vars to empty array when not provided', () => {
        const payload = {
          name: 'test-app',
          git_provider: 'github',
          repository_id: 'repo-123',
          repository_name: 'user/repo',
          repository_url: 'https://github.com/user/repo',
          branch: 'main',
          framework: 'Next.js',
        };
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.env_vars).toEqual([]);
        }
      });
    });

    describe('Invalid Payloads', () => {
      it('TC-PA-U017: should reject app name with uppercase letters', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.invalidName
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('name');
        }
      });

      it('TC-PA-U018: should reject app name too short (<3 chars)', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.nameTooShort
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('name');
          expect(result.error.issues[0].message).toContain('at least 3');
        }
      });

      it('TC-PA-U019: should reject app name too long (>63 chars)', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.nameTooLong
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('name');
        }
      });

      it('should reject app name starting with hyphen', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.nameStartsWithHyphen
        );
        expect(result.success).toBe(false);
      });

      it('should reject app name ending with hyphen', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.nameEndsWithHyphen
        );
        expect(result.success).toBe(false);
      });

      it('TC-PA-U006: should reject invalid git provider', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.invalidProvider
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('git_provider');
        }
      });

      it('TC-PA-U008: should reject invalid framework', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.invalidFramework
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('framework');
        }
      });

      it('TC-PA-U010: should reject invalid size', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.invalidSize
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('size');
        }
      });

      it('TC-PA-U012: should reject invalid repository URL', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.invalidUrl
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('repository_url');
        }
      });

      it('TC-PA-U014: should reject empty env_var key', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.emptyEnvVarKey
        );
        expect(result.success).toBe(false);
      });

      it('should reject empty env_var value', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.emptyEnvVarValue
        );
        expect(result.success).toBe(false);
      });

      it('TC-PA-U016: should reject invalid UUID format for project_id', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.invalidProjectId
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('project_id');
        }
      });

      it('should reject empty repository_id', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.emptyRepoId
        );
        expect(result.success).toBe(false);
      });

      it('should reject empty repository_name', () => {
        const result = createPlatformAppSchema.safeParse(
          mockInvalidPlatformAppPayloads.emptyRepoName
        );
        expect(result.success).toBe(false);
      });

      it('should reject missing required fields', () => {
        const result = createPlatformAppSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should reject missing name field', () => {
        const { name, ...payloadWithoutName } = mockCreatePlatformAppPayload;
        const result = createPlatformAppSchema.safeParse(payloadWithoutName);
        expect(result.success).toBe(false);
      });

      it('should reject missing git_provider field', () => {
        const { git_provider, ...payload } = mockCreatePlatformAppPayload;
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject missing repository_url field', () => {
        const { repository_url, ...payload } = mockCreatePlatformAppPayload;
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject missing framework field', () => {
        const { framework, ...payload } = mockCreatePlatformAppPayload;
        const result = createPlatformAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });
  });

  // ============================================
  // deletePlatformAppSchema Tests
  // ============================================
  describe('deletePlatformAppSchema', () => {
    it('TC-PA-U060: should accept valid UUID for app_id', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = deletePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept is_admin flag', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
        is_admin: true,
      };
      const result = deletePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should default is_admin to false', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = deletePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_admin).toBe(false);
      }
    });

    it('TC-PA-U061: should reject invalid UUID format', () => {
      const payload = {
        app_id: 'invalid-uuid',
      };
      const result = deletePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject missing app_id', () => {
      const payload = {};
      const result = deletePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // getPlatformAppSchema Tests
  // ============================================
  describe('getPlatformAppSchema', () => {
    it('should accept valid UUID for app_id', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = getPlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID format', () => {
      const payload = {
        app_id: 'not-a-valid-uuid',
      };
      const result = getPlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject empty app_id', () => {
      const payload = {
        app_id: '',
      };
      const result = getPlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // updatePlatformAppSchema Tests
  // ============================================
  describe('updatePlatformAppSchema', () => {
    it('should accept valid app_id with optional fields', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'updated-app',
      };
      const result = updatePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept status update', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'running',
      };
      const result = updatePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject framework update', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
        framework: 'React',
      };
      const result = updatePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should accept deployment_url update', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
        deployment_url: 'https://new-url.example.com',
      };
      const result = updatePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status value', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'invalid-status',
      };
      const result = updatePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid framework value', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
        framework: 'invalid-framework',
      };
      const result = updatePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid deployment_url format', () => {
      const payload = {
        app_id: '550e8400-e29b-41d4-a716-446655440000',
        deployment_url: 'not-a-url',
      };
      const result = updatePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should require app_id', () => {
      const payload = {
        name: 'updated-app',
      };
      const result = updatePlatformAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('validateCustomSpec', () => {
    const validSpec = {
      cpuRequest: '4',
      cpuLimit: '8',
      memoryRequest: '8Gi',
      memoryLimit: '16Gi',
      replicas: 4,
    };

    it('accepts a valid custom profile', () => {
      expect(validateCustomSpec(validSpec, 0.5)).toBeNull();
    });

    it('rejects unsupported fields', () => {
      expect(validateCustomSpec({ ...validSpec, nodePool: 'dedicated' }, 0.5))
        .toBe('custom_spec.nodePool is not supported');
    });

    it('compares large Kubernetes memory units without underflow', () => {
      expect(validateCustomSpec({
        ...validSpec,
        memoryRequest: '1Pi',
        memoryLimit: '1Ei',
      }, 0.5)).toBeNull();
      expect(validateCustomSpec({
        ...validSpec,
        memoryRequest: '1Ei',
        memoryLimit: '1Pi',
      }, 0.5)).toBe('custom_spec.memoryLimit must be >= memoryRequest');
    });
  });
});
