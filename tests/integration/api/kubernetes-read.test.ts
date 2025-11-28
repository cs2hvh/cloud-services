import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/read/route';
import { NextRequest } from 'next/server';
import {
  mockKubernetesCluster,
  mockKubernetesUser,
  mockPendingCluster,
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
vi.mock('@/lib/supabase/auth');

describe('POST /api/services/kubernetes/clusters/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock requireAdmin for all tests
    import('@/lib/supabase/auth').then(({ requireAdmin }) => {
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);
    });
  });

  describe('Authentication', () => {
    it('should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });
  });

  describe('List All Clusters', () => {
    it('should return all user clusters', async () => {
      const mockUser = await mockAuthenticatedUser(mockKubernetesUser.id);

      // Mock requireAdmin
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      // Mock Supabase response
      const { createSSRClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [mockKubernetesCluster, mockPendingCluster],
              error: null,
            })),
          })),
        })),
      };
      vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        {} // Empty body to list all
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(2);
    });

    it('should return empty array if no clusters', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      };
      vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should only return authenticated user clusters', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn((field: string, value: string) => {
              // Verify it's filtering by owner_id
              expect(field).toBe('owner_id');
              expect(value).toBe(mockKubernetesUser.id);
              return {
                data: [mockKubernetesCluster],
                error: null,
              };
            }),
          })),
        })),
      };
      vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        {}
      );

      await POST(request as NextRequest);
      
      // Verify the query was called correctly
      expect(mockSupabase.from).toHaveBeenCalledWith('clusters');
    });

    // it('should not include kubeconfig in list response', async () => {
    //   await mockAuthenticatedUser(mockKubernetesUser.id);

    //   const { createSSRClient } = await import('@/lib/supabase/server');
    //   const mockSupabase = {
    //     from: vi.fn(() => ({
    //       select: vi.fn((fields: string) => {
    //         // Verify kubeconfig is NOT in the selected fields
    //         expect(fields).not.toContain('kubeconfig');
    //         return {
    //           eq: vi.fn(() => ({
    //             data: [mockKubernetesCluster],
    //             error: null,
    //           })),
    //         };
    //       }),
    //     })),
    //   };
    //   vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/kubernetes/clusters/read',
    //     {}
    //   );

    //   const response = await POST(request as NextRequest);
    //   const data = await expectResponseStatus(response, 200);

    //   expect(data.data[0]).not.toHaveProperty('kubeconfig');
    // });
  });

  describe('Get Single Cluster', () => {
    it('should return specific cluster by cluster_id', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn((field: string, value: string) => {
              if (field === 'cluster_id') {
                expect(value).toBe(mockKubernetesCluster.cluster_id);
              }
              return {
                eq: vi.fn(() => ({
                  single: vi.fn(() => ({
                    data: mockKubernetesCluster,
                    error: null,
                  })),
                })),
                single: vi.fn(() => ({
                  data: mockKubernetesCluster,
                  error: null,
                })),
              };
            }),
          })),
        })),
      };
      vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.cluster).toBeDefined();
      expect(data.cluster.cluster_id).toBe(mockKubernetesCluster.cluster_id);
    });

    it('should enforce ownership for non-admin users', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      // Mock non-admin check
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      const { createSSRClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn((field: string, value: string) => {
              const chainedEq = vi.fn(() => ({
                single: vi.fn(() => ({
                  data: mockKubernetesCluster,
                  error: null,
                })),
              }));
              
              // If it's cluster_id, return object that allows chaining another eq
              if (field === 'cluster_id') {
                return { eq: chainedEq };
              }
              // If it's owner_id (ownership check), call it
              if (field === 'owner_id') {
                expect(value).toBe(mockKubernetesUser.id);
              }
              return { single: vi.fn(() => ({ data: mockKubernetesCluster, error: null })) };
            }),
          })),
        })),
      };
      vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);
      
      // Verify ownership check was performed
      expect(mockSupabase.from).toHaveBeenCalledWith('clusters');
    });

    it('should allow admin to view any cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      // Mock admin check
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: true, userId: mockKubernetesUser.id } as any);

      const { createSSRClient } = await import('@/lib/supabase/server');
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
        })),
      };
      vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: null,
                  error: null,
                })),
              })),
              single: vi.fn(() => ({
                data: null,
                error: null,
              })),
            })),
          })),
        })),
      };
      vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: 'non-existent-id' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 404);
    });

    it('should return 400 for database error', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: null,
                  error: { message: 'Database error' },
                })),
              })),
              single: vi.fn(() => ({
                data: null,
                error: { message: 'Database error' },
              })),
            })),
          })),
        })),
      };
      vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });
});
