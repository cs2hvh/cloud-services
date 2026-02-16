import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Database_Clusters } from '@/lib/supabase/queries/database_clusters';

vi.mock('@/lib/supabase/server');

describe('Database_Clusters', () => {
  function chainMock(result: { data?: any; error?: any }) {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select, single });
    const neq = vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue(result) });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) });
    const deleteFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue(result) }) });

    return {
      from: vi.fn().mockReturnValue({
        insert,
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single,
            neq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function mockWorker(result: { data?: any; error?: any }) {
    const mock = chainMock(result);
    const { createWorkerClient } = await import('@/lib/supabase/server');
    vi.mocked(createWorkerClient).mockResolvedValue(mock as any);
    return mock;
  }

  async function mockSSR(result: { data?: any; error?: any }) {
    const mock = chainMock(result);
    const { createSSRClient } = await import('@/lib/supabase/server');
    vi.mocked(createSSRClient).mockResolvedValue(mock as any);
    return mock;
  }

  // ============================================
  // create
  // ============================================
  describe('create', () => {
    it('should create a cluster successfully', async () => {
      const clusterData = { name: 'test-db', engine: 'pg', status: 'pending' as const, owner_id: 'u1', project_id: 'p1', size: 'db-s-1vcpu-1gb', password: 'pass' };
      await mockWorker({ data: { ...clusterData, id: '1' }, error: null });

      const result = await Database_Clusters.create(clusterData);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return error on insert failure', async () => {
      await mockWorker({ data: null, error: { message: 'duplicate key' } });

      const result = await Database_Clusters.create({ name: 'dup', engine: 'pg', status: 'pending', owner_id: 'u1', project_id: 'p1', size: 's', password: 'p' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('duplicate key');
    });
  });

  // ============================================
  // read
  // ============================================
  describe('read', () => {
    it('should read a cluster by ID', async () => {
      await mockSSR({ data: { cluster_id: 'c1', name: 'my-db' }, error: null });

      const result = await Database_Clusters.read('c1');
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('my-db');
    });

    it('should return error for non-existent cluster', async () => {
      await mockSSR({ data: null, error: { message: 'not found' } });

      const result = await Database_Clusters.read('nonexistent');
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // read_all_owner
  // ============================================
  describe('read_all_owner', () => {
    it('should return clusters for owner', async () => {
      const { createSSRClient } = await import('@/lib/supabase/server');
      const mockData = [{ cluster_id: 'c1' }, { cluster_id: 'c2' }];
      vi.mocked(createSSRClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
            }),
          }),
        }),
      } as any);

      const result = await Database_Clusters.read_all_owner('owner-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should return error on failure', async () => {
      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockResolvedValue({ data: null, error: { message: 'query failed' } }),
            }),
          }),
        }),
      } as any);

      const result = await Database_Clusters.read_all_owner('owner-1');
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // update_project
  // ============================================
  describe('update_project', () => {
    it('should update project association', async () => {
      await mockWorker({ data: { cluster_id: 'c1', project_id: 'p2' }, error: null });

      const result = await Database_Clusters.update_project('c1', 'p2');
      expect(result.success).toBe(true);
    });

    it('should return error on update failure', async () => {
      await mockWorker({ data: null, error: { message: 'update failed' } });

      const result = await Database_Clusters.update_project('c1', 'p2');
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // update_network_rules
  // ============================================
  describe('update_network_rules', () => {
    it('should update firewall rules', async () => {
      const rules = [{ uuid: 'r1', type: 'ip_addr', value: '1.2.3.4' }] as any;
      await mockWorker({ data: { cluster_id: 'c1', network_rules: rules }, error: null });

      const result = await Database_Clusters.update_network_rules('c1', rules);
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // update_storage_size
  // ============================================
  describe('update_storage_size', () => {
    it('should update storage size', async () => {
      await mockWorker({ data: { cluster_id: 'c1', storage_size_mib: 20480 }, error: null });

      const result = await Database_Clusters.update_storage_size('c1', 20480);
      expect(result.success).toBe(true);
    });

    it('should return error on failure', async () => {
      await mockWorker({ data: null, error: { message: 'update failed' } });

      const result = await Database_Clusters.update_storage_size('c1', 99999);
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // update_maintenance_window
  // ============================================
  describe('update_maintenance_window', () => {
    it('should update maintenance window', async () => {
      const window = { day: 'monday', hour: '03:00' };
      await mockWorker({ data: { cluster_id: 'c1', window }, error: null });

      const result = await Database_Clusters.update_maintenance_window('c1', window);
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // delete
  // ============================================
  describe('delete', () => {
    it('should delete a cluster', async () => {
      await mockWorker({ data: [{ cluster_id: 'c1' }], error: null });

      const result = await Database_Clusters.delete('c1');
      expect(result.success).toBe(true);
    });

    it('should return error on delete failure', async () => {
      await mockWorker({ data: null, error: { message: 'delete failed' } });

      const result = await Database_Clusters.delete('c1');
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // mark_as_deleted
  // ============================================
  describe('mark_as_deleted', () => {
    it('should soft-delete a cluster', async () => {
      await mockWorker({ data: [{ cluster_id: 'c1', status: 'deleted' }], error: null });

      const result = await Database_Clusters.mark_as_deleted('c1');
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // add_user / remove_user
  // ============================================
  describe('add_user', () => {
    it('should add a user to the cluster', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      let callCount = 0;
      const user = { name: 'newuser', role: 'normal', password: 'pass' } as any;

      vi.mocked(createWorkerClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { users: [user] }, error: null }),
              }),
            }),
          }),
        }),
      } as any);

      const result = await Database_Clusters.add_user('c1', user);
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // get_by_project_id
  // ============================================
  describe('get_by_project_id', () => {
    it('should return clusters for valid project ID', async () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      const { createWorkerClient } = await import('@/lib/supabase/server');
      vi.mocked(createWorkerClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [{ cluster_id: 'c1' }], error: null }),
              }),
            }),
          }),
        }),
      } as any);

      const result = await Database_Clusters.get_by_project_id(validUUID);
      expect(result).toHaveLength(1);
    });

    it('should return empty array for invalid UUID', async () => {
      const result = await Database_Clusters.get_by_project_id('not-a-uuid');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty string', async () => {
      const result = await Database_Clusters.get_by_project_id('');
      expect(result).toEqual([]);
    });
  });
});
