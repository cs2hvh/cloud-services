import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/create/route';
import { NextRequest } from 'next/server';
import { mockCreateDatabasePayload, mockDigitalOceanCluster, mockInvalidPayloads } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/database/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
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
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.create).mockResolvedValue({
        success: true,
        data: { id: 'test-cluster-id' },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        mockCreateDatabasePayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 201);

      expect(data.message).toContain('created successfully');
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

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.create).mockResolvedValue({
        success: true,
        data: { id: 'test-pg-cluster' },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/create',
        payload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 201);
    });

    it('should encrypt passwords before storing', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: mockDigitalOceanCluster,
      });

      const { Database_Clusters } = await import('@/lib/supabase/queries');
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

      // Verify encryption was called for passwords
      expect(createMock).toHaveBeenCalled();
      const callArg = createMock.mock.calls[0][0];
      expect(callArg.connection.password).toHaveProperty('encryptedData');
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

      const { Database_Clusters } = await import('@/lib/supabase/queries');
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
