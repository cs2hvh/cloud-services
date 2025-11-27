import { describe, it, expect } from 'vitest';
import {
  createSpectrumAppSchema,
  updateSpectrumAppSchema,
  deleteSpectrumAppSchema,
  getSpectrumAppSchema,
} from '@/lib/validation/spectrum';
import {
  mockCreateSpectrumPayload,
  mockInvalidSpectrumPayloads,
} from '../../utils/mock-data';

describe('Spectrum Validation Schemas', () => {
  describe('createSpectrumAppSchema', () => {
    describe('Valid Cases', () => {
      it('should accept valid spectrum app payload with all fields', () => {
        const result = createSpectrumAppSchema.safeParse(mockCreateSpectrumPayload);
        expect(result.success).toBe(true);
      });

      it('should accept valid TCP protocol with single port', () => {
        const payload = {
          ...mockCreateSpectrumPayload,
          protocol: 'tcp/22',
        };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept valid UDP protocol', () => {
        const payload = {
          ...mockCreateSpectrumPayload,
          protocol: 'udp/27015',
        };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept valid port range', () => {
        const payload = {
          ...mockCreateSpectrumPayload,
          protocol: 'tcp/8000-9000',
        };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should default tls to "off"', () => {
        const { tls, ...payloadWithoutTls } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutTls);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.tls).toBe('off');
        }
      });

      it('should default ip_firewall to false', () => {
        const { ip_firewall, ...payloadWithoutFirewall } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutFirewall);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.ip_firewall).toBe(false);
        }
      });

      it('should default traffic_type to "direct"', () => {
        const { traffic_type, ...payloadWithoutTrafficType } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutTrafficType);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.traffic_type).toBe('direct');
        }
      });

      it('should default proxy_protocol to "off"', () => {
        const { proxy_protocol, ...payloadWithoutProxy } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutProxy);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.proxy_protocol).toBe('off');
        }
      });

      it('should default edge_ips', () => {
        const { edge_ips, ...payloadWithoutEdgeIps } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutEdgeIps);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.edge_ips).toEqual({
            connectivity: 'all',
            type: 'dynamic',
          });
        }
      });

      it('should accept DNS type A', () => {
        const payload = {
          ...mockCreateSpectrumPayload,
          dns: { name: 'test-app', type: 'A' as const },
        };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept DNS type CNAME', () => {
        const payload = {
          ...mockCreateSpectrumPayload,
          dns: { name: 'test-app', type: 'CNAME' as const },
        };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    describe('Invalid Cases - project_id', () => {
      it('should reject non-UUID project_id', () => {
        const result = createSpectrumAppSchema.safeParse(
          mockInvalidSpectrumPayloads.invalidProjectId
        );
        expect(result.success).toBe(false);
      });

      it('should reject empty project_id', () => {
        const payload = { ...mockCreateSpectrumPayload, project_id: '' };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject missing project_id', () => {
        const { project_id, ...payloadWithoutProject } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutProject);
        expect(result.success).toBe(false);
      });
    });

    describe('Invalid Cases - owner_id', () => {
      it('should reject non-UUID owner_id', () => {
        const result = createSpectrumAppSchema.safeParse(
          mockInvalidSpectrumPayloads.invalidOwnerId
        );
        expect(result.success).toBe(false);
      });

      it('should reject empty owner_id', () => {
        const payload = { ...mockCreateSpectrumPayload, owner_id: '' };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject missing owner_id', () => {
        const { owner_id, ...payloadWithoutOwner } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutOwner);
        expect(result.success).toBe(false);
      });
    });

    describe('Invalid Cases - dns', () => {
      it('should reject missing dns object', () => {
        const { dns, ...payloadWithoutDns } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutDns);
        expect(result.success).toBe(false);
      });

      it('should reject dns without name', () => {
        const payload = {
          ...mockCreateSpectrumPayload,
          dns: { type: 'A' as const },
        };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject dns.name shorter than minimum length', () => {
        const result = createSpectrumAppSchema.safeParse(
          mockInvalidSpectrumPayloads.shortDNSName
        );
        expect(result.success).toBe(false);
      });

      it('should reject dns.type not in [A, CNAME]', () => {
        const result = createSpectrumAppSchema.safeParse(
          mockInvalidSpectrumPayloads.invalidDNSType
        );
        expect(result.success).toBe(false);
      });
    });

    describe('Invalid Cases - protocol', () => {
      it('should reject protocol without port', () => {
        const result = createSpectrumAppSchema.safeParse(
          mockInvalidSpectrumPayloads.invalidProtocolNoPort
        );
        expect(result.success).toBe(false);
      });

      it('should reject invalid protocol format (http/80)', () => {
        const result = createSpectrumAppSchema.safeParse(
          mockInvalidSpectrumPayloads.invalidProtocol
        );
        expect(result.success).toBe(false);
      });

      // it('should reject reversed port range', () => {
      //   const result = createSpectrumAppSchema.safeParse(
      //     mockInvalidSpectrumPayloads.invalidPortRange
      //   );
      //   expect(result.success).toBe(false);
      // });

      // it('should reject port > 65535', () => {
      //   const result = createSpectrumAppSchema.safeParse(
      //     mockInvalidSpectrumPayloads.invalidPortTooHigh
      //   );
      //   expect(result.success).toBe(false);
      // });

      it('should reject non-numeric port', () => {
        const payload = {
          ...mockCreateSpectrumPayload,
          protocol: 'tcp/abc',
        };
        const result = createSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });

    describe('Invalid Cases - origin_direct', () => {
      it('should reject empty origin_direct array', () => {
        const result = createSpectrumAppSchema.safeParse(
          mockInvalidSpectrumPayloads.emptyOrigins
        );
        expect(result.success).toBe(false);
      });

      it('should reject missing origin_direct', () => {
        const { origin_direct, ...payloadWithoutOrigin } = mockCreateSpectrumPayload;
        const result = createSpectrumAppSchema.safeParse(payloadWithoutOrigin);
        expect(result.success).toBe(false);
      });
    });

    describe('Invalid Cases - tls', () => {
      it('should reject invalid tls value', () => {
        const result = createSpectrumAppSchema.safeParse(
          mockInvalidSpectrumPayloads.invalidTLS
        );
        expect(result.success).toBe(false);
      });
    });
  });

  describe('updateSpectrumAppSchema', () => {
    describe('Valid Cases', () => {
      it('should accept valid app_id only', () => {
        const payload = { app_id: 'cf-app-123' };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept partial update with dns', () => {
        const payload = {
          app_id: 'cf-app-123',
          dns: { name: 'updated-app', type: 'A' as const },
        };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept partial update with protocol', () => {
        const payload = {
          app_id: 'cf-app-123',
          protocol: 'tcp/3389',
        };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept partial update with origin_direct', () => {
        const payload = {
          app_id: 'cf-app-123',
          origin_direct: ['10.0.0.1:22'],
        };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept partial update with tls', () => {
        const payload = {
          app_id: 'cf-app-123',
          tls: 'full' as const,
        };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept partial update with ip_firewall', () => {
        const payload = {
          app_id: 'cf-app-123',
          ip_firewall: true,
        };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should accept update with multiple fields', () => {
        const payload = {
          app_id: 'cf-app-123',
          protocol: 'tcp/25565',
          tls: 'full' as const,
          ip_firewall: true,
        };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    describe('Invalid Cases', () => {
      it('should reject missing app_id', () => {
        const payload = { protocol: 'tcp/22' };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject empty app_id', () => {
        const payload = { app_id: '' };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject invalid protocol format if provided', () => {
        const payload = {
          app_id: 'cf-app-123',
          protocol: 'http/80',
        };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('should reject invalid tls value if provided', () => {
        const payload = {
          app_id: 'cf-app-123',
          tls: 'partial' as any,
        };
        const result = updateSpectrumAppSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('deleteSpectrumAppSchema', () => {
    it('should accept valid app_id', () => {
      const payload = { app_id: 'cf-app-123' };
      const result = deleteSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept app_id with optional owner_id', () => {
      const payload = {
        app_id: 'cf-app-123',
        owner_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = deleteSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject missing app_id', () => {
      const payload = {};
      const result = deleteSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject empty app_id', () => {
      const payload = { app_id: '' };
      const result = deleteSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID owner_id if provided', () => {
      const payload = {
        app_id: 'cf-app-123',
        owner_id: 'not-a-uuid',
      };
      const result = deleteSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('getSpectrumAppSchema', () => {
    it('should accept valid app_id', () => {
      const payload = { app_id: 'cf-app-123' };
      const result = getSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept app_id with optional owner_id', () => {
      const payload = {
        app_id: 'cf-app-123',
        owner_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = getSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject missing app_id', () => {
      const payload = {};
      const result = getSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject empty app_id', () => {
      const payload = { app_id: '' };
      const result = getSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID owner_id if provided', () => {
      const payload = {
        app_id: 'cf-app-123',
        owner_id: 'not-a-uuid',
      };
      const result = getSpectrumAppSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
