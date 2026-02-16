import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Spectrum_Apps } from '@/lib/supabase/queries/spectrum_apps';

vi.mock('@/lib/supabase/server');

describe('Spectrum_Apps', () => {
  function chainMock(result: { data?: any; error?: any }) {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ single });
    const order = vi.fn().mockResolvedValue(result);
    const neq = vi.fn().mockReturnValue({ order });

    return {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single,
            neq: vi.fn().mockReturnValue({ order }),
          }),
          neq: vi.fn().mockReturnValue({ order }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue(result) }),
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

  async function mockService(result: { data?: any; error?: any }) {
    const mock = chainMock(result);
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue(mock as any);
    return mock;
  }

  async function mockClient(result: { data?: any; error?: any }) {
    const mock = chainMock(result);
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(mock as any);
    return mock;
  }

  // ============================================
  // create
  // ============================================
  describe('create', () => {
    it('should create a spectrum app', async () => {
      await mockWorker({
        data: { spectrum_id: 's1', protocol: 'tcp/22', status: 'active' },
        error: null,
      });

      const result = await Spectrum_Apps.create({
        protocol: 'tcp/22',
        origin_direct: ['tcp://1.2.3.4:22'],
        owner_id: 'u1',
      } as any);
      expect(result.success).toBe(true);
      expect(result.data?.spectrum_id).toBe('s1');
    });

    it('should return error on insert failure', async () => {
      await mockWorker({ data: null, error: { message: 'insert failed' } });

      const result = await Spectrum_Apps.create({ protocol: 'tcp/22' } as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('insert failed');
    });
  });

  // ============================================
  // update
  // ============================================
  describe('update', () => {
    it('should update a spectrum app', async () => {
      await mockWorker({
        data: { spectrum_id: 's1', protocol: 'tcp/443' },
        error: null,
      });

      const result = await Spectrum_Apps.update('s1', { protocol: 'tcp/443' } as any);
      expect(result.success).toBe(true);
    });

    it('should return error on update failure', async () => {
      await mockWorker({ data: null, error: { message: 'update failed' } });

      const result = await Spectrum_Apps.update('s1', { protocol: 'tcp/443' } as any);
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // get
  // ============================================
  describe('get', () => {
    it('should return app by spectrum_id', async () => {
      await mockService({
        data: { spectrum_id: 's1', protocol: 'tcp/22' },
        error: null,
      });

      const result = await Spectrum_Apps.get('s1');
      expect(result.success).toBe(true);
      expect(result.data?.protocol).toBe('tcp/22');
    });

    it('should return error for non-existent app', async () => {
      await mockService({ data: null, error: { message: 'not found' } });

      const result = await Spectrum_Apps.get('nonexistent');
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // list_by_owner
  // ============================================
  describe('list_by_owner', () => {
    it('should return apps for owner', async () => {
      await mockClient({
        data: [{ spectrum_id: 's1' }, { spectrum_id: 's2' }],
        error: null,
      });

      const result = await Spectrum_Apps.list_by_owner('owner-1');
      expect(result).toHaveLength(2);
    });

    it('should return empty array on error', async () => {
      await mockClient({ data: null, error: { message: 'query failed' } });

      const result = await Spectrum_Apps.list_by_owner('owner-1');
      expect(result).toEqual([]);
    });
  });

  // ============================================
  // delete
  // ============================================
  describe('delete', () => {
    it('should delete a spectrum app', async () => {
      await mockWorker({ data: [{ id: '1' }], error: null });

      const result = await Spectrum_Apps.delete('s1');
      expect(result.success).toBe(true);
    });

    it('should return error on delete failure', async () => {
      await mockWorker({ data: null, error: { message: 'delete failed' } });

      const result = await Spectrum_Apps.delete('s1');
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // mark_as_deleted
  // ============================================
  describe('mark_as_deleted', () => {
    it('should soft-delete a spectrum app', async () => {
      await mockWorker({
        data: [{ spectrum_id: 's1', status: 'deleted' }],
        error: null,
      });

      const result = await Spectrum_Apps.mark_as_deleted('s1');
      expect(result.success).toBe(true);
    });

    it('should return error on mark_as_deleted failure', async () => {
      const { createWorkerClient } = await import('@/lib/supabase/server');
      vi.mocked(createWorkerClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: null, error: { message: 'update failed' } }),
            }),
          }),
        }),
      } as any);

      const result = await Spectrum_Apps.mark_as_deleted('s1');
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // get_by_project_id
  // ============================================
  describe('get_by_project_id', () => {
    it('should return apps for project', async () => {
      await mockClient({
        data: [{ spectrum_id: 's1', project_id: 'p1' }],
        error: null,
      });

      const result = await Spectrum_Apps.get_by_project_id('p1');
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      await mockClient({ data: null, error: { message: 'failed' } });

      const result = await Spectrum_Apps.get_by_project_id('p1');
      expect(result).toEqual([]);
    });
  });
});
