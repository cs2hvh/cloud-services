import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/create/route';
import { NextRequest } from 'next/server';
import { mockCreateDatabasePayload, mockDigitalOceanCluster, mockInvalidPayloads } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies - use exact paths as imported in the route
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/billing');
vi.mock('@/config/billing-flow');
vi.mock('@/config/pricing');
vi.mock('axios');

describe('POST /api/services/database/create', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();

    // Mock billing flow - ensureBalance
    const { ensureBalance, postProvisionBilling } = await import('@/config/billing-flow');
    vi.mocked(ensureBalance).mockResolvedValue({ ok: true });
    vi.mocked(postProvisionBilling).mockResolvedValue(undefined);

    // Mock pricing - getRatesForDatabase
    const { getRatesForDatabase } = await import('@/config/pricing');
    vi.mocked(getRatesForDatabase).mockResolvedValue({
      initialCost: 10,
      hourlyRate: 0.02,
    });
  });

  describe('Success Cases', () => {
    it('should create MySQL database with valid data', async () => {
      // Mock DigitalOcean API response
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: mockDigitalOceanCluster,
      });

      // Mock Supabase insert
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.create).mockResolvedValue({
        success: true,
        data: { id: 'test-cluster-id' },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockCreateDatabasePayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toBe('database creation started');
      expect(data.data).toBeDefined();
      expect(data.connection).toBeDefined();
      expect(axios.default.post).toHaveBeenCalledWith(
        'https://api.digitalocean.com/v2/databases',
        mockCreateDatabasePayload,
        expect.any(Object)
      );
    });

    it('should create PostgreSQL database', async () => {
      const payload = {
        ...mockCreateDatabasePayload,
        engine: 'pg',
        version: '14',
      };

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          database: {
            ...mockDigitalOceanCluster.database,
            engine: 'pg',
            version: '14',
          },
        },
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.create).mockResolvedValue({
        success: true,
        data: { id: 'test-pg-cluster' },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        payload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });

    it('should encrypt passwords before storing', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: mockDigitalOceanCluster,
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      const createMock = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'test-cluster-id' },
        error: null,
      });
      vi.mocked(Database_Clusters.create).mockImplementation(createMock);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockCreateDatabasePayload
      );

      await POST(request as NextRequest);

      // Verify create was called with encrypted password in public_connection
      expect(createMock).toHaveBeenCalled();
      const callArg = createMock.mock.calls[0][0];
      expect(callArg.public_connection.password).toHaveProperty('encrypted');
      expect(callArg.public_connection.password).toHaveProperty('iv');
    });

    it('should trigger billing after successful creation', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: mockDigitalOceanCluster,
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.create).mockResolvedValue({
        success: true,
        data: { id: 'test-cluster-id' },
      });

      const { postProvisionBilling } = await import('@/config/billing-flow');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockCreateDatabasePayload
      );

      await POST(request as NextRequest);

      expect(postProvisionBilling).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockCreateDatabasePayload.owner_id,
          initialCost: 10,
          hourlyRate: 0.02,
        })
      );
    });
  });

  describe('Billing Checks', () => {
    it('should return 402 when insufficient balance', async () => {
      const { ensureBalance } = await import('@/config/billing-flow');
      vi.mocked(ensureBalance).mockResolvedValue({
        ok: false,
        balance: 5,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockCreateDatabasePayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 402);

      expect(data.error).toBe('Insufficient credits');
      expect(data.balance).toBe(5);
    });
  });

  describe('Validation Errors', () => {
    it('should reject invalid cluster name (too short)', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockInvalidPayloads.invalidName
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });

    it('should reject invalid cluster name (uppercase)', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockInvalidPayloads.invalidNameUppercase
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid engine', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockInvalidPayloads.invalidEngine
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid version for engine', async () => {
      const payload = {
        ...mockCreateDatabasePayload,
        engine: 'mysql',
        version: '14', // PostgreSQL version
      };

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        payload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Invalid version');
    });

    it('should reject too many nodes', async () => {
      const payload = {
        ...mockCreateDatabasePayload,
        num_nodes: 100, // Exceeds max
      };

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        payload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid UUIDs', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockInvalidPayloads.invalidProjectId
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject missing plan_id', async () => {
      const { plan_id, ...payloadWithoutPlanId } = mockCreateDatabasePayload;

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        payloadWithoutPlanId
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      // Mock unauthenticated user
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      const { NextResponse } = await import('next/server');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ) as any,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockCreateDatabasePayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });
  });

  describe('Error Handling', () => {
    it('should handle DigitalOcean API errors gracefully', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue(new Error('DO API Error'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockCreateDatabasePayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle Supabase write failures', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: mockDigitalOceanCluster,
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.create).mockResolvedValue({
        success: false,
        error: 'Database write failed',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockCreateDatabasePayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBeDefined();
    });
  });
});
