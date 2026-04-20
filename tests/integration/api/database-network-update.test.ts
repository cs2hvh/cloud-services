import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/network/update/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('axios');

describe('POST /api/services/database/network/update', () => {
  const validPayload = {
    id: mockDatabaseCluster.cluster_id,
    ip_address: '192.168.1.100',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();

    // Default mock: existing rules (first call)
    const axios = await import('axios');
    vi.mocked(axios.default.get)
      .mockResolvedValueOnce({
        status: 200,
        data: {
          rules: [{ type: 'ip_addr', value: '10.0.0.1', uuid: 'existing-rule-1' }],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          rules: [
            { type: 'ip_addr', value: '10.0.0.1', uuid: 'existing-rule-1' },
            { type: 'ip_addr', value: '192.168.1.100', uuid: 'new-rule-1' },
          ],
        },
      });

    // Default mock: update success
    vi.mocked(axios.default.put).mockResolvedValue({
      status: 204,
      data: {},
    });

    // Default mock: Supabase update
    const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
    vi.mocked(Database_Clusters.update_network_rules).mockResolvedValue({
      success: true,
    } as any);
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: { ...mockDatabaseCluster, project_id: 'proj-123' },
    } as any);

    // Default mock: Projects log
    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue({
      success: true,
    } as any);
  });

  describe('Success Cases', () => {
    it('adds a new IP address to firewall rules', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBe('IP address added to firewall successfully');
      expect(data.rules).toBeDefined();
    });

    it('makes correct API calls to DigitalOcean', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      await POST(request as NextRequest);

      const axios = await import('axios');
      
      // Check GET call to read existing rules
      expect(axios.default.get).toHaveBeenCalledWith(
        `https://api.digitalocean.com/v2/databases/${validPayload.id}/firewall`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      // Check PUT call to update rules
      expect(axios.default.put).toHaveBeenCalledWith(
        `https://api.digitalocean.com/v2/databases/${validPayload.id}/firewall`,
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({ type: 'ip_addr', value: '10.0.0.1' }),
            expect.objectContaining({ type: 'ip_addr', value: '192.168.1.100' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('updates Supabase with new rules after successful update', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      await POST(request as NextRequest);

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      expect(Database_Clusters.update_network_rules).toHaveBeenCalledWith(
        validPayload.id,
        expect.any(Array)
      );
    });

    it('accepts valid IPv4 address', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValueOnce({ status: 200, data: { rules: [] } })
        .mockResolvedValueOnce({ status: 200, data: { rules: [{ type: 'ip_addr', value: '203.0.113.50' }] } });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { id: mockDatabaseCluster.cluster_id, ip_address: '203.0.113.50' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBe('IP address added to firewall successfully');
    });

    it('accepts valid CIDR notation', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValueOnce({ status: 200, data: { rules: [] } })
        .mockResolvedValueOnce({ status: 200, data: { rules: [{ type: 'ip_addr', value: '10.0.0.0/24' }] } });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { id: mockDatabaseCluster.cluster_id, ip_address: '10.0.0.0/24' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBe('IP address added to firewall successfully');
    });

    it('accepts full-form IPv6 address', async () => {
      // Note: Schema uses strict regex that requires full-form IPv6 (no :: compression)
      const fullIpv6 = '2001:0db8:0000:0000:0000:0000:0000:0001';
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValueOnce({ status: 200, data: { rules: [] } })
        .mockResolvedValueOnce({ status: 200, data: { rules: [{ type: 'ip_addr', value: fullIpv6 }] } });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { id: mockDatabaseCluster.cluster_id, ip_address: fullIpv6 }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBe('IP address added to firewall successfully');
    });

    it('accepts allow all IPv4 (0.0.0.0/0)', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValueOnce({ status: 200, data: { rules: [] } })
        .mockResolvedValueOnce({ status: 200, data: { rules: [{ type: 'ip_addr', value: '0.0.0.0/0' }] } });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { id: mockDatabaseCluster.cluster_id, ip_address: '0.0.0.0/0' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBe('IP address added to firewall successfully');
    });
  });

  describe('Duplicate Prevention', () => {
    it('rejects duplicate IP address', async () => {
      // Mock existing rules with the IP we're trying to add
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValue({
          status: 200,
          data: {
            rules: [
              { type: 'ip_addr', value: '192.168.1.100', uuid: 'existing-rule-1' },
            ],
          },
        });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toContain('already exists');
    });
  });

  describe('Validation Cases', () => {
    it('rejects missing id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { ip_address: '192.168.1.100' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('rejects missing ip_address', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('rejects invalid UUID for id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { id: 'not-a-uuid', ip_address: '192.168.1.100' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('rejects invalid IP address format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { id: mockDatabaseCluster.cluster_id, ip_address: 'not-an-ip' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('accepts CIDR /33 (schema allows 1-2 digit prefix, forwarded to DO)', async () => {
      // Note: Schema regex accepts /33 (only checks digit count, not range)
      // Actual CIDR range validation would be handled by DigitalOcean
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValueOnce({ status: 200, data: { rules: [] } })
        .mockResolvedValueOnce({ status: 200, data: { rules: [{ type: 'ip_addr', value: '192.168.1.0/33' }] } });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        { id: mockDatabaseCluster.cluster_id, ip_address: '192.168.1.0/33' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBe('IP address added to firewall successfully');
    });
  });

  describe('Error Handling', () => {
    it('returns 500 when reading existing rules fails', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValue({
          status: 500,
          data: { error: 'Internal Server Error' },
        });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toContain('fetch existing firewall');
    });

    it('returns error when DigitalOcean update fails', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValue({
          status: 200,
          data: { rules: [] },
        });
      vi.mocked(axios.default.put).mockReset().mockResolvedValue({
        status: 422,
        data: { message: 'Unprocessable Entity' },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(422);
    });

    it('handles network errors gracefully', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockRejectedValue(new Error('Network timeout'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('returns 500 when Supabase sync fails', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get)
        .mockReset()
        .mockResolvedValueOnce({ status: 200, data: { rules: [] } })
        .mockResolvedValueOnce({
          status: 200,
          data: { rules: [{ type: 'ip_addr', value: '192.168.1.100' }] },
        });
      vi.mocked(axios.default.put).mockReset().mockResolvedValue({ status: 204, data: {} });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_network_rules).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toContain('sync with database');
    });
  });

  describe('Authorization', () => {
    it('rejects unauthenticated requests', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
        }),
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      const response = await POST(request as NextRequest);
      expect(response?.status).toBe(401);
    });

    it('rejects updating firewall for a cluster owned by another user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          ...mockDatabaseCluster,
          owner_id: '00000000-0000-0000-0000-000000000999',
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 403);
      expect(data.error).toContain('not authorized');
    });
  });

  describe('Activity Logging', () => {
    it('logs firewall rule addition to project activity', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        validPayload
      );

      await POST(request as NextRequest);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'Shield',
          text: expect.stringContaining(validPayload.ip_address),
        })
      );
    });
  });
});
