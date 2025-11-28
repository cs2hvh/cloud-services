import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/delete/route';
import { NextRequest } from 'next/server';
import {
  mockKubernetesCluster,
  mockKubernetesUser,
  mockKubernetesProject,
} from '../../utils/mock-data-kubernetes';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/kubernetes/clusters/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Tests', () => {
    it('should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                error: null,
              })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      // Mock axios for droplet deletion
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204 });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);
    });

    it('should delete cluster with valid cluster_id', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockDelete = vi.fn(() => ({
        single: vi.fn(() => ({ error: null })),
      }));
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: mockDelete,
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204 });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(mockDelete).toHaveBeenCalledWith('cluster_id', mockKubernetesCluster.cluster_id);
    });

    it('should delete control plane droplet from DigitalOcean', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ error: null })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const axios = await import('axios');
      const mockAxiosDelete = vi.fn().mockResolvedValue({ status: 204 });
      vi.mocked(axios.default.delete).mockImplementation(mockAxiosDelete);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);

      expect(mockAxiosDelete).toHaveBeenCalledWith(
        expect.stringContaining(`/droplets/${mockKubernetesCluster.control_plane.droplet_id}`),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          }),
        })
      );
    });

    it('should delete worker droplets from DigitalOcean', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ error: null })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const axios = await import('axios');
      const mockAxiosDelete = vi.fn().mockResolvedValue({ status: 204 });
      vi.mocked(axios.default.delete).mockImplementation(mockAxiosDelete);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);

      // Should delete control plane + 2 workers = 3 calls
      expect(mockAxiosDelete).toHaveBeenCalledTimes(3);
      expect(mockAxiosDelete).toHaveBeenCalledWith(
        expect.stringContaining('/droplets/123'),
        expect.any(Object)
      );
      expect(mockAxiosDelete).toHaveBeenCalledWith(
        expect.stringContaining('/droplets/124'),
        expect.any(Object)
      );
    });

    it('should add activity log on deletion', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ error: null })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      const mockAddLog = vi.fn().mockResolvedValue(true);
      vi.mocked(Projects.add_log).mockImplementation(mockAddLog);

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204 });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);

      expect(mockAddLog).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: mockKubernetesCluster.project_id,
          event: 'Trash2',
          text: expect.stringContaining(mockKubernetesCluster.cluster_name),
        })
      );
    });

    it('should handle partial droplet deletion failures', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ error: null })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const axios = await import('axios');
      // First call succeeds, second fails, third succeeds
      vi.mocked(axios.default.delete)
        .mockResolvedValueOnce({ status: 204 })
        .mockRejectedValueOnce(new Error('Droplet not found'))
        .mockResolvedValueOnce({ status: 204 });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.droplet_warnings).toBeDefined();
      expect(Array.isArray(data.droplet_warnings)).toBe(true);
    });
  });

  describe('Error Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);
    });

    it('should return error for non-existent cluster', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: null,
                error: { message: 'Not found' },
              })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: 'non-existent-id' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should handle DigitalOcean API errors gracefully', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ error: null })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue(new Error('API Error'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      
      // Should still succeed with warnings
      const data = await expectResponseStatus(response, 200);
      expect(data.droplet_warnings).toBeDefined();
    });

    it('should still delete from database if droplet deletion fails', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockDbDelete = vi.fn(() => ({
        single: vi.fn(() => ({ error: null })),
      }));
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: mockDbDelete,
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue(new Error('API Error'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);

      expect(mockDbDelete).toHaveBeenCalled();
    });

    it('should include warnings in response for failed droplet deletions', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ error: null })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue(new Error('Droplet not found'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.droplet_warnings).toBeDefined();
      expect(data.droplet_warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Authorization Tests', () => {
    it('should allow user to delete own cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: {
                  ...mockKubernetesCluster,
                  owner_id: mockKubernetesUser.id,
                },
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ error: null })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204 });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });

    it('should handle database deletion errors', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: mockKubernetesCluster,
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                error: { message: 'Database error' },
              })),
            })),
          })),
        })),
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204 });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should handle malformed request body', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { invalid: 'payload' }
      );

      const response = await POST(request as NextRequest);
      
      // May return 400 for validation or error during processing
      expect([400, 500]).toContain(response.status);
    });
  });
});
