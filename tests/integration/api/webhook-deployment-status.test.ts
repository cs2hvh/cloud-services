import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/webhooks/deployment-status/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/queries');

describe('POST /api/webhooks/deployment-status', () => {
  const testUrl = 'http://localhost:3000/api/webhooks/deployment-status';

  const mockApp = {
    id: 'app-1',
    name: 'my-app',
    user_id: 'user-1',
    status: 'building',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.list_by_owner).mockResolvedValue([mockApp] as any);
    vi.mocked(Platform_Apps.update).mockResolvedValue({ success: true } as any);
    vi.mocked(Platform_App_Deployments.create).mockResolvedValue({
      success: true,
      data: { id: 'deploy-1' },
    } as any);
    vi.mocked(Platform_App_Deployments.set_active_for_app).mockResolvedValue(undefined as any);
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // === Missing required fields ===
  it('should return 400 when app_name is missing', async () => {
    const req = createRequest({ status: 'running' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('app_name');
  });

  it('should return 400 when status is missing', async () => {
    const req = createRequest({ app_name: 'my-app' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('status');
  });

  // === App not found ===
  it('should return 404 when app is not found', async () => {
    const req = createRequest({ app_name: 'nonexistent-app', status: 'running' });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.warning).toContain('App not found');
  });

  // === Strip -job suffix ===
  it('should strip -job suffix from app_name', async () => {
    const { Platform_Apps } = await import('@/lib/supabase/queries');

    const req = createRequest({ app_name: 'my-app-job', status: 'running' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.app_name).toBe('my-app');
  });

  // === Invalid status ===
  it('should return 400 for invalid status value', async () => {
    const req = createRequest({ app_name: 'my-app', status: 'unknown' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid status');
  });

  // === Valid statuses ===
  it('should accept pending status', async () => {
    const req = createRequest({ app_name: 'my-app', status: 'pending' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('should accept building status', async () => {
    const req = createRequest({ app_name: 'my-app', status: 'building' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('should accept stopped status', async () => {
    const req = createRequest({ app_name: 'my-app', status: 'stopped' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  // === Running status (success deployment) ===
  it('should update app status and create deployment record for running status', async () => {
    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({
      app_name: 'my-app',
      status: 'running',
      build_number: 5,
      commit_sha: 'abc123',
      image_tag: 'my-app:5',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Should clear failure reason for running status
    expect(Platform_Apps.update).toHaveBeenCalledWith('app-1', {
      status: 'running',
      last_failure_reason: null,
    });

    // Should create deployment record with status 'success'
    expect(Platform_App_Deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: 'app-1',
        status: 'success',
        build_number: 5,
        commit_sha: 'abc123',
        image_tag: 'my-app:5',
      })
    );

    // Should set as active deployment on success
    expect(Platform_App_Deployments.set_active_for_app).toHaveBeenCalledWith('app-1', 'deploy-1');
  });

  // === Failed status ===
  it('should store failure reason and create deployment record for failed status', async () => {
    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({
      app_name: 'my-app',
      status: 'failed',
      build_number: 6,
      failure_reason: 'Build timeout',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_Apps.update).toHaveBeenCalledWith('app-1', {
      status: 'failed',
      last_failure_reason: 'Build timeout',
    });

    expect(Platform_App_Deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: 'app-1',
        status: 'failed',
        failure_reason: 'Build timeout',
      })
    );

    // Should NOT set as active deployment on failure
    expect(Platform_App_Deployments.set_active_for_app).not.toHaveBeenCalled();
  });

  // === Trigger normalization ===
  it('should default trigger to webhook when not provided', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({
      app_name: 'my-app',
      status: 'running',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_App_Deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'webhook' })
    );
  });

  it('should use valid trigger value when provided', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({
      app_name: 'my-app',
      status: 'running',
      trigger: 'rollback',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_App_Deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'rollback' })
    );
  });

  it('should fallback to webhook for invalid trigger', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({
      app_name: 'my-app',
      status: 'running',
      trigger: 'invalid-trigger',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_App_Deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'webhook' })
    );
  });

  // === No deployment record for non-running/failed statuses ===
  it('should not create deployment record for building status', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({ app_name: 'my-app', status: 'building' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_App_Deployments.create).not.toHaveBeenCalled();
  });

  // === Response body ===
  it('should include failure_reason in response only for failed status', async () => {
    const reqFailed = createRequest({
      app_name: 'my-app',
      status: 'failed',
      failure_reason: 'OOM',
    });
    const resFailed = await POST(reqFailed);
    const dataFailed = await resFailed.json();
    expect(dataFailed.failure_reason).toBe('OOM');

    vi.clearAllMocks();
    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.list_by_owner).mockResolvedValue([mockApp] as any);
    vi.mocked(Platform_Apps.update).mockResolvedValue({ success: true } as any);
    vi.mocked(Platform_App_Deployments.create).mockResolvedValue({
      success: true,
      data: { id: 'deploy-2' },
    } as any);
    vi.mocked(Platform_App_Deployments.set_active_for_app).mockResolvedValue(undefined as any);

    const reqRunning = createRequest({
      app_name: 'my-app',
      status: 'running',
      failure_reason: 'Should be ignored',
    });
    const resRunning = await POST(reqRunning);
    const dataRunning = await resRunning.json();
    expect(dataRunning.failure_reason).toBeUndefined();
  });

  // === Unexpected error ===
  it('should return 500 on unexpected error', async () => {
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.list_by_owner).mockRejectedValue(new Error('DB down'));

    const req = createRequest({ app_name: 'my-app', status: 'running' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('DB down');
  });

  it('should handle non-Error thrown', async () => {
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.list_by_owner).mockRejectedValue('string error');

    const req = createRequest({ app_name: 'my-app', status: 'running' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Internal server error');
  });
});
