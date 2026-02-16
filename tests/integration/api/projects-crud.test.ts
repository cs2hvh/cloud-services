import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/projects/route';
import { PATCH, PUT, DELETE } from '@/app/api/projects/[id]/route';
import { GET } from '@/app/api/projects/list/route';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/types/zod/project', () => ({
  projectSchema: {
    parse: vi.fn((data: any) => data),
  },
}));

describe('Projects API', () => {
  const mockUser = { id: 'user-1', email: 'user@test.com' };

  function createSupabaseMock(options: {
    user?: any;
    userError?: any;
    insertResult?: any;
    selectResult?: any;
  } = {}) {
    const {
      user = mockUser,
      userError = null,
      insertResult = { data: { id: 'proj-1' }, error: null },
      selectResult = { data: [{ id: 'proj-1', name: 'Test' }], error: null },
    } = options;

    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: userError }),
      },
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(insertResult),
          }),
        }),
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(selectResult),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ POST /api/projects ============
  describe('POST /api/projects', () => {
    it('should return 401 when not authenticated', async () => {
      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new Request('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', description: 'Desc' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('should create project successfully', async () => {
      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({
          insertResult: { data: { id: 'new-proj-1' }, error: null },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'My Project', description: 'A project' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message).toBe('Project created successfully');
      expect(body.id).toBe('new-proj-1');
    });

    it('should return 500 on insert error', async () => {
      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({
          insertResult: { data: null, error: { message: 'Insert failed' } },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', description: 'Desc' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });

  // ============ GET /api/projects/list ============
  describe('GET /api/projects/list', () => {
    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const res = await GET();
      expect(res.status).toBe(401);
    });

    it('should list user projects', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({
          selectResult: { data: [{ id: 'proj-1', name: 'Project 1' }], error: null },
        }) as any
      );

      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('should return 500 on database error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({
          selectResult: { data: null, error: { message: 'DB error' } },
        }) as any
      );

      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  // ============ PATCH /api/projects/[id] ============
  describe('PATCH /api/projects/[id]', () => {
    const mockParams = Promise.resolve({ id: 'proj-1' });

    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new Request('http://localhost:3000/api/projects/proj-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req, { params: mockParams });
      expect(res.status).toBe(401);
    });

    it('should update project successfully', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.update).mockResolvedValue(true as any);
      vi.mocked(Projects.add_log).mockResolvedValue(true as any);

      const req = new Request('http://localhost:3000/api/projects/proj-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Project updated successfully');
    });

    it('should return 500 when update fails', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.update).mockResolvedValue(null as any);

      const req = new Request('http://localhost:3000/api/projects/proj-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(500);
    });
  });

  // ============ PUT /api/projects/[id] ============
  describe('PUT /api/projects/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', {
        method: 'PUT',
        body: JSON.stringify({ event: 'add', users: ['user-2'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid event', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', {
        method: 'PUT',
        body: JSON.stringify({ event: 'invalid', users: ['user-2'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Invalid payload');
    });

    it('should add users to project', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({
        id: 'proj-1',
        users: ['user-1'],
        owner: 'user-1',
      } as any);
      vi.mocked(Projects.update).mockResolvedValue(true as any);

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', {
        method: 'PUT',
        body: JSON.stringify({ event: 'add', users: ['user-2'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.users).toContain('user-1');
      expect(body.users).toContain('user-2');
    });

    it('should remove users from project', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({
        id: 'proj-1',
        users: ['user-1', 'user-2'],
        owner: 'user-1',
      } as any);
      vi.mocked(Projects.update).mockResolvedValue(true as any);

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', {
        method: 'PUT',
        body: JSON.stringify({ event: 'remove', users: ['user-2'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.users).toContain('user-1');
      expect(body.users).not.toContain('user-2');
    });

    it('should return 404 when project not found', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue(null as any);

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', {
        method: 'PUT',
        body: JSON.stringify({ event: 'add', users: ['user-2'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(404);
    });
  });

  // ============ DELETE /api/projects/[id] ============
  describe('DELETE /api/projects/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', { method: 'DELETE' });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(401);
    });

    it('should return 404 when project not found', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue(null as any);

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', { method: 'DELETE' });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(404);
    });

    it('should return 403 when user is not owner', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({
        id: 'proj-1',
        owner: 'other-user',
        users: ['user-1'],
      } as any);

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', { method: 'DELETE' });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain("don't have permission");
    });

    it('should delete project successfully', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({
        id: 'proj-1',
        owner: 'user-1',
        users: ['user-1'],
      } as any);
      vi.mocked(Projects.delete).mockResolvedValue(true as any);

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', { method: 'DELETE' });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Project deleted successfully');
    });

    it('should return 500 when delete fails', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({
        id: 'proj-1',
        owner: 'user-1',
        users: ['user-1'],
      } as any);
      vi.mocked(Projects.delete).mockResolvedValue(null as any);

      const req = new NextRequest('http://localhost:3000/api/projects/proj-1', { method: 'DELETE' });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'proj-1' }) });
      expect(res.status).toBe(500);
    });
  });
});
