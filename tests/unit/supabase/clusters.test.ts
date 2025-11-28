import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Clusters } from '@/lib/supabase/queries';
import {
  mockKubernetesCluster,
  mockKubernetesUser,
  mockKubernetesProject,
  mockPendingCluster,
  mockAdminUser,
  mockAllUsersForAdmin,
} from '../../utils/mock-data-kubernetes';

// Mock Supabase client
vi.mock('@/lib/supabase/server');

describe('Clusters Supabase Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get_by_project_id', () => {
    it('should return clusters for valid project ID', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                data: [mockKubernetesCluster, mockPendingCluster],
                error: null,
              })),
            })),
          })),
        })),
      };
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_by_project_id(mockKubernetesProject.id);

      expect(result).toHaveLength(2);
      expect(result[0].cluster_id).toBe(mockKubernetesCluster.cluster_id);
      expect(mockSupabase.from).toHaveBeenCalledWith('clusters');
    });

    it('should return empty array for project with no clusters', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
          })),
        })),
      };
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_by_project_id(mockKubernetesProject.id);

      expect(result).toEqual([]);
    });

    it('should handle invalid project ID', async () => {
      const result = await Clusters.get_by_project_id('');

      expect(result).toEqual([]);
    });

    it('should handle non-UUID project ID', async () => {
      const result = await Clusters.get_by_project_id('not-a-uuid');

      expect(result).toEqual([]);
    });

    it('should return clusters in descending order by created_at', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      const mockOrder = vi.fn(() => ({
        data: [mockKubernetesCluster],
        error: null,
      }));
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: mockOrder,
            })),
          })),
        })),
      };
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      await Clusters.get_by_project_id(mockKubernetesProject.id);

      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should handle database errors gracefully', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                data: null,
                error: { message: 'Database error' },
              })),
            })),
          })),
        })),
      };
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_by_project_id(mockKubernetesProject.id);

      expect(result).toEqual([]);
    });
  });

  describe('get_by_user_id', () => {
    it('should return clusters for valid user ID', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                data: [mockKubernetesCluster],
                error: null,
              })),
            })),
          })),
        })),
      };
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_by_user_id(mockKubernetesUser.id);

      expect(result).toHaveLength(1);
      expect(result[0].owner_id).toBe(mockKubernetesUser.id);
    });

    it('should return empty array for user with no clusters', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
          })),
        })),
      };
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_by_user_id('550e8400-e29b-41d4-a716-446655440099');

      expect(result).toEqual([]);
    });

    it('should handle invalid user ID', async () => {
      const result = await Clusters.get_by_user_id('');

      expect(result).toEqual([]);
    });

    it('should handle non-UUID user ID', async () => {
      const result = await Clusters.get_by_user_id('invalid-uuid');

      expect(result).toEqual([]);
    });

    it('should filter by owner_id', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      const mockEq = vi.fn(() => ({
        order: vi.fn(() => ({
          data: [mockKubernetesCluster],
          error: null,
        })),
      }));
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: mockEq,
          })),
        })),
      };
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      await Clusters.get_by_user_id(mockKubernetesUser.id);

      expect(mockEq).toHaveBeenCalledWith('owner_id', mockKubernetesUser.id);
    });
  });

  describe('get_by_id', () => {
    it('should return cluster for valid cluster_id', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
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
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_by_id(mockKubernetesCluster.cluster_id);

      expect(result).toBeDefined();
      expect(result?.cluster_id).toBe(mockKubernetesCluster.cluster_id);
    });

    it('should return null for non-existent cluster', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
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
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_by_id('non-existent-id');

      expect(result).toBeNull();
    });

    it('should include all cluster fields', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
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
      vi.mocked(createWorkerClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_by_id(mockKubernetesCluster.cluster_id);

      expect(result).toHaveProperty('cluster_id');
      expect(result).toHaveProperty('cluster_name');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('workers');
      expect(result).toHaveProperty('control_plane');
      expect(result).toHaveProperty('k8s_version');
    });
  });

  describe('get_all_for_admin', () => {
    it('should return all clusters with user data', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [
                {
                  ...mockKubernetesCluster,
                  user_profiles: { username: 'testuser' },
                },
              ],
              error: null,
            })),
          })),
        })),
        auth: {
          admin: {
            listUsers: vi.fn(() => ({
              data: {
                users: [
                  { id: mockKubernetesUser.id, email: mockKubernetesUser.email },
                ],
              },
              error: null,
            })),
          },
        },
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_all_for_admin();

      expect(result).toHaveLength(1);
      expect(result[0].owner_email).toBe(mockKubernetesUser.email);
    });

    it('should include owner email from auth users', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [
                {
                  ...mockKubernetesCluster,
                  user_profiles: { username: 'testuser' },
                },
              ],
              error: null,
            })),
          })),
        })),
        auth: {
          admin: {
            listUsers: vi.fn(() => ({
              data: {
                users: [
                  { id: mockKubernetesUser.id, email: mockKubernetesUser.email },
                ],
              },
              error: null,
            })),
          },
        },
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_all_for_admin();

      expect(result[0]).toHaveProperty('owner_email');
      expect(result[0].owner_email).toBe(mockKubernetesUser.email);
    });

    it('should include owner username from profiles', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [
                {
                  ...mockKubernetesCluster,
                  user_profiles: { username: 'testuser' },
                },
              ],
              error: null,
            })),
          })),
        })),
        auth: {
          admin: {
            listUsers: vi.fn(() => ({
              data: {
                users: [
                  { id: mockKubernetesUser.id, email: mockKubernetesUser.email },
                ],
              },
              error: null,
            })),
          },
        },
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_all_for_admin();

      expect(result[0]).toHaveProperty('owner_username');
      expect(result[0].owner_username).toBe('testuser');
    });

    it('should handle missing user profiles gracefully', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [
                {
                  ...mockKubernetesCluster,
                  user_profiles: null,
                },
              ],
              error: null,
            })),
          })),
        })),
        auth: {
          admin: {
            listUsers: vi.fn(() => ({
              data: {
                users: [
                  { id: mockKubernetesUser.id, email: mockKubernetesUser.email },
                ],
              },
              error: null,
            })),
          },
        },
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_all_for_admin();

      expect(result[0].owner_username).toBeNull();
    });

    it('should return clusters in descending order by created_at', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockOrder = vi.fn(() => ({
        data: [
          {
            ...mockKubernetesCluster,
            user_profiles: { username: 'testuser' },
          },
        ],
        error: null,
      }));
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: mockOrder,
          })),
        })),
        auth: {
          admin: {
            listUsers: vi.fn(() => ({
              data: { users: [] },
              error: null,
            })),
          },
        },
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      await Clusters.get_all_for_admin();

      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should return empty array on error', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              data: null,
              error: { message: 'Database error' },
            })),
          })),
        })),
        auth: {
          admin: {
            listUsers: vi.fn(() => ({
              data: { users: [] },
              error: null,
            })),
          },
        },
      };
      vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

      const result = await Clusters.get_all_for_admin();

      expect(result).toEqual([]);
    });
  });
});
