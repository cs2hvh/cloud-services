import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GET_ACTIVITIES } from '@/app/api/projects/activity/read/route';
import { POST as ADD_ACTIVITY } from '@/app/api/projects/activity/add/route';
import { GET as GET_LOGS } from '@/app/api/projects/logs/read/route';
import { POST as ADD_LOG } from '@/app/api/projects/logs/add/route';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/queries/activities');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/types/zod/activity', () => ({
  addActivitySchema: {
    safeParse: vi.fn((data: any) => {
      if (!data.cluster_name || !data.action || !data.project_id) {
        return { success: false, error: { errors: [{ message: 'Missing field' }] } };
      }
      return { success: true, data };
    }),
  },
}));

describe('Projects Activity & Logs API', () => {
  const mockUser = { id: 'user-1', email: 'user@test.com' };
  const validProjectId = '550e8400-e29b-41d4-a716-446655440000';

  function createSupabaseMock(options: {
    user?: any;
    userError?: any;
    projectResult?: any;
    insertResult?: any;
  } = {}) {
    const {
      user = mockUser,
      userError = null,
      projectResult = { data: { owner: 'user-1', users: ['user-1'] }, error: null },
      insertResult = { data: { id: 'activity-1' }, error: null },
    } = options;

    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: userError }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(projectResult),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(insertResult),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ GET /api/projects/activity/read ============
  describe('GET /api/projects/activity/read', () => {
    it('should return 400 when project_id missing', async () => {
      const req = new Request('http://localhost:3000/api/projects/activity/read');
      const res = await GET_ACTIVITIES(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('project_id is required');
    });

    it('should return 400 for invalid UUID format', async () => {
      const req = new Request('http://localhost:3000/api/projects/activity/read?project_id=invalid');
      const res = await GET_ACTIVITIES(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Invalid project_id format');
    });

    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new Request(`http://localhost:3000/api/projects/activity/read?project_id=${validProjectId}`);
      const res = await GET_ACTIVITIES(req);
      expect(res.status).toBe(401);
    });

    it('should return 404 when project not found', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({
          projectResult: { data: null, error: { message: 'Not found' } },
        }) as any
      );

      const req = new Request(`http://localhost:3000/api/projects/activity/read?project_id=${validProjectId}`);
      const res = await GET_ACTIVITIES(req);
      expect(res.status).toBe(404);
    });

    it('should return 403 when user has no access', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({
          projectResult: { data: { owner: 'other-user', users: ['other-user'] }, error: null },
        }) as any
      );

      const req = new Request(`http://localhost:3000/api/projects/activity/read?project_id=${validProjectId}`);
      const res = await GET_ACTIVITIES(req);
      expect(res.status).toBe(403);
    });

    it('should return activities successfully', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Activities } = await import('@/lib/supabase/queries/activities');
      vi.mocked(Activities.get_by_project_id).mockResolvedValue([
        { id: 'a1', action: 'created', cluster_name: 'test' },
      ] as any);

      const req = new Request(`http://localhost:3000/api/projects/activity/read?project_id=${validProjectId}`);
      const res = await GET_ACTIVITIES(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.activities).toHaveLength(1);
      expect(body.count).toBe(1);
    });
  });

  // ============ POST /api/projects/activity/add ============
  describe('POST /api/projects/activity/add', () => {
    it('should return 400 for invalid body', async () => {
      const req = new Request('http://localhost:3000/api/projects/activity/add', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_ACTIVITY(req);
      expect(res.status).toBe(400);
    });

    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new Request('http://localhost:3000/api/projects/activity/add', {
        method: 'POST',
        body: JSON.stringify({
          cluster_name: 'test',
          cluster_type: 'k8s',
          action: 'created',
          project_id: validProjectId,
          owner_id: 'user-1',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_ACTIVITY(req);
      expect(res.status).toBe(401);
    });

    it('should return 403 when user has no access', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({
          projectResult: { data: { owner: 'other-user', users: [] }, error: null },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/projects/activity/add', {
        method: 'POST',
        body: JSON.stringify({
          cluster_name: 'test',
          cluster_type: 'k8s',
          action: 'created',
          project_id: validProjectId,
          owner_id: 'user-1',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_ACTIVITY(req);
      expect(res.status).toBe(403);
    });

    it('should create activity successfully', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const req = new Request('http://localhost:3000/api/projects/activity/add', {
        method: 'POST',
        body: JSON.stringify({
          cluster_name: 'test-cluster',
          cluster_type: 'k8s',
          action: 'created',
          project_id: validProjectId,
          owner_id: 'user-1',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_ACTIVITY(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message).toBe('Activity added successfully');
      expect(body.id).toBe('activity-1');
    });
  });

  // ============ GET /api/projects/logs/read ============
  describe('GET /api/projects/logs/read', () => {
    it('should return 400 when project_id missing', async () => {
      const req = new Request('http://localhost:3000/api/projects/logs/read');
      const res = await GET_LOGS(req);
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid UUID', async () => {
      const req = new Request('http://localhost:3000/api/projects/logs/read?project_id=invalid');
      const res = await GET_LOGS(req);
      expect(res.status).toBe(400);
    });

    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new Request(`http://localhost:3000/api/projects/logs/read?project_id=${validProjectId}`);
      const res = await GET_LOGS(req);
      expect(res.status).toBe(401);
    });

    it('should return 403 when user has no access', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({
          projectResult: { data: { owner: 'other-user', users: null }, error: null },
        }) as any
      );

      const req = new Request(`http://localhost:3000/api/projects/logs/read?project_id=${validProjectId}`);
      const res = await GET_LOGS(req);
      expect(res.status).toBe(403);
    });

    it('should return logs successfully', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_logs).mockResolvedValue([
        { id: 'log-1', event: 'Settings', text: 'Updated name' },
      ] as any);

      const req = new Request(`http://localhost:3000/api/projects/logs/read?project_id=${validProjectId}`);
      const res = await GET_LOGS(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
    });

    it('should return 500 when get_logs fails', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_logs).mockResolvedValue(null as any);

      const req = new Request(`http://localhost:3000/api/projects/logs/read?project_id=${validProjectId}`);
      const res = await GET_LOGS(req);
      expect(res.status).toBe(500);
    });
  });

  // ============ POST /api/projects/logs/add ============
  describe('POST /api/projects/logs/add', () => {
    it('should return 400 when required fields missing', async () => {
      const req = new Request('http://localhost:3000/api/projects/logs/add', {
        method: 'POST',
        body: JSON.stringify({ project_id: validProjectId }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_LOG(req);
      expect(res.status).toBe(400);
    });

    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new Request('http://localhost:3000/api/projects/logs/add', {
        method: 'POST',
        body: JSON.stringify({ project_id: validProjectId, event: 'Test', text: 'Log entry' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_LOG(req);
      expect(res.status).toBe(401);
    });

    it('should return 403 when user has no access', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({
          projectResult: { data: { owner: 'other-user', users: null }, error: null },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/projects/logs/add', {
        method: 'POST',
        body: JSON.stringify({ project_id: validProjectId, event: 'Test', text: 'Log entry' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_LOG(req);
      expect(res.status).toBe(403);
    });

    it('should add log successfully', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.add_log).mockResolvedValue(true as any);

      const req = new Request('http://localhost:3000/api/projects/logs/add', {
        method: 'POST',
        body: JSON.stringify({ project_id: validProjectId, event: 'Settings', text: 'Updated' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_LOG(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Log entry added successfully');
    });

    it('should return 500 when add_log fails', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.add_log).mockResolvedValue(null as any);

      const req = new Request('http://localhost:3000/api/projects/logs/add', {
        method: 'POST',
        body: JSON.stringify({ project_id: validProjectId, event: 'Settings', text: 'Updated' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await ADD_LOG(req);
      expect(res.status).toBe(500);
    });
  });
});
