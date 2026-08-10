import { describe, it, expect } from 'vitest';
import {
  createDatabaseSchema,
  updateNetworkSchema,
  validateEngineVersion,
  createDatabaseUserSchema,
  deleteDatabaseUserSchema,
  updateMaintenanceSchema,
} from '@/lib/validation/database';
import { mockCreateDatabasePayload, mockInvalidPayloads } from '../../utils/mock-data';

describe('Database Validation Schemas', () => {
  describe('createDatabaseSchema', () => {
    describe('Valid Cases', () => {
      it('should accept valid MySQL cluster configuration', () => {
        const result = createDatabaseSchema.safeParse(mockCreateDatabasePayload);
        expect(result.success).toBe(true);
      });

      it('should accept valid PostgreSQL configuration', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          engine: 'pg',
          version: '14',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept valid MongoDB configuration', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          engine: 'mongodb',
          version: '5',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept valid Redis configuration', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          engine: 'redis',
          version: '7',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept 3 nodes', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          num_nodes: 3,
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    describe('Name Validation', () => {
      it('should reject names shorter than 3 characters', () => {
        const result = createDatabaseSchema.safeParse(mockInvalidPayloads.invalidName);
        expect(result.success).toBe(false);
      });

      it('should reject names with uppercase letters', () => {
        const result = createDatabaseSchema.safeParse(mockInvalidPayloads.invalidNameUppercase);
        expect(result.success).toBe(false);
      });

      it('should reject names with underscores', () => {
        const result = createDatabaseSchema.safeParse(mockInvalidPayloads.invalidNameUnderscore);
        expect(result.success).toBe(false);
      });

      it('should reject names starting with hyphen', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          name: '-test-db',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject names ending with hyphen', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          name: 'test-db-',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject names longer than 63 characters', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          name: 'a'.repeat(64),
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should accept valid names with hyphens', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          name: 'test-db-01',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    describe('Engine Validation', () => {
      it('should reject invalid engine', () => {
        const result = createDatabaseSchema.safeParse(mockInvalidPayloads.invalidEngine);
        expect(result.success).toBe(false);
      });

      it('should accept all valid engines', () => {
        const engines = ['mysql', 'pg', 'mongodb', 'redis', 'kafka'];
        engines.forEach((engine) => {
          const payload = {
            ...mockCreateDatabasePayload,
            engine,
            version: engine === 'mysql' ? '8' : engine === 'pg' ? '14' : '5',
          };
          const result = createDatabaseSchema.safeParse(payload);
          expect(result.success).toBe(true);
        });
      });
    });

    describe('Version Validation', () => {
      it('should accept numeric versions', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          version: '8',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept decimal versions', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          engine: 'mongodb',
          version: '5.0',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should reject non-numeric versions', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          version: 'latest',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });

    describe('Node Count Validation', () => {
      it('should reject 0 nodes', () => {
        const result = createDatabaseSchema.safeParse(mockInvalidPayloads.invalidNodes);
        expect(result.success).toBe(false);
      });

      it('should reject negative nodes', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          num_nodes: -1,
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject non-integer nodes', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          num_nodes: 1.5,
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });

    describe('Region Validation', () => {
      it('should reject invalid regions', () => {
        const result = createDatabaseSchema.safeParse(mockInvalidPayloads.invalidRegion);
        expect(result.success).toBe(false);
      });

      it('should accept valid regions', () => {
        const regions = ['nyc1', 'sfo2', 'lon1'];
        regions.forEach((region) => {
          const payload = {
            ...mockCreateDatabasePayload,
            region,
          };
          const result = createDatabaseSchema.safeParse(payload);
          expect(result.success).toBe(true);
        });
      });
    });

    describe('UUID Validation', () => {
      it('should reject invalid project_id', () => {
        const result = createDatabaseSchema.safeParse(mockInvalidPayloads.invalidProjectId);
        expect(result.success).toBe(false);
      });

      it('should reject invalid owner_id', () => {
        const payload = {
          ...mockCreateDatabasePayload,
          owner_id: 'not-a-uuid',
        };
        const result = createDatabaseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('validateEngineVersion', () => {
    // These mirror DigitalOcean's GET /v2/databases/options. They previously
    // asserted MySQL 8, PostgreSQL 13/14 and MongoDB 4/5 — versions the
    // provider no longer offers — which is why the create endpoint rejected
    // the MySQL 8.4 the wizard was offering.
    it('should validate MySQL versions', () => {
      expect(validateEngineVersion('mysql', '8.4')).toBe(true);
      expect(validateEngineVersion('mysql', '8')).toBe(false); // retired at the provider
      expect(validateEngineVersion('mysql', '5.7')).toBe(false);
      expect(validateEngineVersion('mysql', '14')).toBe(false);
    });

    it('should validate PostgreSQL versions', () => {
      expect(validateEngineVersion('pg', '18')).toBe(true);
      expect(validateEngineVersion('pg', '15')).toBe(true);
      expect(validateEngineVersion('pg', '14')).toBe(false); // retired at the provider
      expect(validateEngineVersion('pg', '8')).toBe(false);
    });

    it('should validate MongoDB versions', () => {
      // The format matters as much as the number — the provider says '8.0'.
      expect(validateEngineVersion('mongodb', '8.0')).toBe(true);
      expect(validateEngineVersion('mongodb', '7.0')).toBe(true);
      expect(validateEngineVersion('mongodb', '8')).toBe(false);
      expect(validateEngineVersion('mongodb', '5')).toBe(false);
      expect(validateEngineVersion('mongodb', '2')).toBe(false);
    });

    it('should validate Kafka versions', () => {
      expect(validateEngineVersion('kafka', '4.1')).toBe(true);
      expect(validateEngineVersion('kafka', '3.9')).toBe(true);
      expect(validateEngineVersion('kafka', '3.8')).toBe(false); // retired at the provider
    });

    it('should validate Redis versions', () => {
      expect(validateEngineVersion('redis', '7')).toBe(true);
      expect(validateEngineVersion('redis', '6')).toBe(true);
      expect(validateEngineVersion('redis', '8')).toBe(false);
    });
  });

  describe('updateNetworkSchema', () => {
    it('should accept valid IPv4 address', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        ip_address: '203.0.113.1',
      };
      const result = updateNetworkSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept valid IPv6 address', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        ip_address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      };
      const result = updateNetworkSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept CIDR notation', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        ip_address: '203.0.113.0/24',
      };
      const result = updateNetworkSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept allow all IPv4', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        ip_address: '0.0.0.0/0',
      };
      const result = updateNetworkSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept allow all IPv6', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        ip_address: '::/0',
      };
      const result = updateNetworkSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid IP format', () => {
      const payload = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        ip_address: '999.999.999.999',
      };
      const result = updateNetworkSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid database ID', () => {
      const payload = {
        id: 'not-a-uuid',
        ip_address: '203.0.113.1',
      };
      const result = updateNetworkSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('createDatabaseUserSchema', () => {
    it('should accept valid user data', () => {
      const payload = {
        cluster_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'testuser',
      };
      const result = createDatabaseUserSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid cluster_id', () => {
      const payload = {
        cluster_id: 'not-a-uuid',
        name: 'testuser',
      };
      const result = createDatabaseUserSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject empty username', () => {
      const payload = {
        cluster_id: '550e8400-e29b-41d4-a716-446655440000',
        name: '',
      };
      const result = createDatabaseUserSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('updateMaintenanceSchema', () => {
    it('should accept valid maintenance window', () => {
      const payload = {
        database_id: '550e8400-e29b-41d4-a716-446655440000',
        day: 'tuesday',
        hour: '02:00',
      };
      const result = updateMaintenanceSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid day', () => {
      const payload = {
        database_id: '550e8400-e29b-41d4-a716-446655440000',
        day: 'notaday',
        hour: '02:00',
      };
      const result = updateMaintenanceSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid hour format', () => {
      const payload = {
        database_id: '550e8400-e29b-41d4-a716-446655440000',
        day: 'tuesday',
        hour: '25:00',
      };
      const result = updateMaintenanceSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
