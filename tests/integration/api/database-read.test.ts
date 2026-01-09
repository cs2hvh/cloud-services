import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/read/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster, mockUser } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies - use exact paths as imported in the route
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/config/functions');
vi.mock('@/config/hosttoip');
vi.mock('axios');

describe('POST /api/services/database/read', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();

    // Mock Encryption module
    const { Encryption } = await import('@/config/functions');
    vi.mocked(Encryption.decrypt).mockImplementation((encrypted: any) => {
      // Return plain text for mocked encrypted data
      if (typeof encrypted === 'object' && encrypted.encrypted) {
        return 'decrypted-value';
      }
      return encrypted;
    });
  });

  describe('Success Cases', () => {
    it('TC-DB-015: should read cluster by ID with valid authentication', async () => {
      // Mock Supabase query
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(data.data.name).toBe(mockDatabaseCluster.name);
      expect(data.message).toBe('database fetched successfully');
    });

    it('TC-DB-018: should verify returned data structure includes all required fields', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Verify connection details
      expect(data.data.public_connection).toBeDefined();
      expect(data.data.public_connection.host).toBeDefined();
      expect(data.data.public_connection.port).toBeDefined();

      // Verify users list included
      expect(data.data.users).toBeDefined();
      expect(Array.isArray(data.data.users)).toBe(true);

      // Verify databases list included
      expect(data.data.dbs).toBeDefined();
      expect(Array.isArray(data.data.dbs)).toBe(true);
    });

    it('should check DO status when checkStatus flag is true', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          database: {
            ...mockDatabaseCluster,
            status: 'online',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.cluster_id, checkStatus: true }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(axios.default.get).toHaveBeenCalled();
    });
  });

  describe('Authentication Tests', () => {
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
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 for missing cluster ID', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should return 400 for invalid cluster ID format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: 'invalid-uuid' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });

  describe('Error Cases', () => {
    it('should handle database query errors gracefully', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });
  });

  describe('Password Decryption', () => {
    it('should return public_connection with host and port', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Connection details should be present
      expect(data.data.public_connection).toBeDefined();
      expect(data.data.public_connection.host).toBeDefined();
      expect(data.data.public_connection.port).toBe(25060);
    });
  });
});
