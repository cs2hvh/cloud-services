import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/webhooks/platform-apps/deployment-record/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/server');

describe('POST /api/webhooks/platform-apps/deployment-record', () => {
  const testUrl = 'http://localhost:3000/api/webhooks/platform-apps/deployment-record';

  const validPayload = {
    app_id: 'app-1',
    status: 'success' as const,
    trigger: 'webhook' as const,
    image_tag: 'my-app:42',
    build_number: 42,
    commit_sha: 'abc123',
  };

  const mockDeployment = {
    id: 'deploy-1',
    app_id: 'app-1',
    build_number: 42,
    status: 'success',
    trigger: 'webhook',
    image_tag: 'my-app:42',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { Platform_App_Deployments, Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.create).mockResolvedValue({
      success: true,
      data: mockDeployment,
    } as any);
    vi.mocked(Platform_App_Deployments.set_active_for_app).mockResolvedValue(undefined as any);
    vi.mocked(Platform_Apps.update).mockResolvedValue({ success: true } as any);
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // === Missing required fields ===
  it('should return 400 when app_id is missing', async () => {
    const req = createRequest({ status: 'success', trigger: 'webhook', image_tag: 'tag' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('app_id');
  });

  it('should return 400 when status is missing', async () => {
    const req = createRequest({ app_id: 'app-1', trigger: 'webhook', image_tag: 'tag' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('status');
  });

  it('should return 400 when trigger is missing', async () => {
    const req = createRequest({ app_id: 'app-1', status: 'success', image_tag: 'tag' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('trigger');
  });

  // === Invalid status ===
  it('should return 400 for invalid status value', async () => {
    const req = createRequest({ app_id: 'app-1', status: 'running', trigger: 'webhook', image_tag: 'tag' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid status');
  });

  // === Invalid trigger ===
  it('should return 400 for invalid trigger value', async () => {
    const req = createRequest({ app_id: 'app-1', status: 'success', trigger: 'auto', image_tag: 'tag' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid trigger');
  });

  // === Missing image identity ===
  it('should return 400 when both image_tag and image_digest are missing', async () => {
    const req = createRequest({ app_id: 'app-1', status: 'success', trigger: 'webhook' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('image_tag or image_digest');
  });

  // === Accepts image_digest instead of image_tag ===
  it('should accept image_digest without image_tag', async () => {
    const req = createRequest({
      app_id: 'app-1',
      status: 'success',
      trigger: 'webhook',
      image_digest: 'sha256:abc123',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  // === Successful creation ===
  it('should create deployment record successfully', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deployment).toBeDefined();

    expect(Platform_App_Deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: 'app-1',
        status: 'success',
        trigger: 'webhook',
        image_tag: 'my-app:42',
        build_number: 42,
      })
    );
  });

  // === Success status marks active + updates app ===
  it('should set deployment as active and update app on success status', async () => {
    const { Platform_App_Deployments, Platform_Apps } = await import('@/lib/supabase/queries');

    const req = createRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_App_Deployments.set_active_for_app).toHaveBeenCalledWith('app-1', 'deploy-1');
    expect(Platform_Apps.update).toHaveBeenCalledWith('app-1', expect.objectContaining({
      status: 'running',
      last_deploy_trigger: 'webhook',
    }));
  });

  // === Failed status does NOT mark active ===
  it('should not set deployment as active on failed status', async () => {
    const { Platform_App_Deployments, Platform_Apps } = await import('@/lib/supabase/queries');

    const req = createRequest({ ...validPayload, status: 'failed' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_App_Deployments.set_active_for_app).not.toHaveBeenCalled();
    expect(Platform_Apps.update).not.toHaveBeenCalled();
  });

  // === Build number normalization ===
  it('should normalize string build_number to integer', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({ ...validPayload, build_number: '42' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_App_Deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({ build_number: 42 })
    );
  });

  it('should handle null build_number', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({ ...validPayload, build_number: null });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(Platform_App_Deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({ build_number: null })
    );
  });

  // === Idempotency: duplicate build_number ===
  it('should handle duplicate build_number via idempotency', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.create).mockResolvedValue({
      success: false,
      error: 'duplicate key value violates unique constraint "uq_platform_app_deployments_app_build_number"',
      data: null,
    } as any);

    const { createServiceClient } = await import('@/lib/supabase/server');
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: mockDeployment });
    const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockEqBuild = vi.fn().mockReturnValue({ order: mockOrder });
    const mockEqApp = vi.fn().mockReturnValue({ eq: mockEqBuild });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqApp });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    vi.mocked(createServiceClient).mockResolvedValue({
      from: mockFrom,
    } as any);

    const req = createRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deployment).toBeDefined();
  });

  // === Create failure ===
  it('should return 500 when deployment creation fails', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.create).mockResolvedValue({
      success: false,
      error: 'Database error',
      data: null,
    } as any);

    const req = createRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  // === Unexpected error ===
  it('should return 500 on unexpected error', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.create).mockRejectedValue(new Error('DB crash'));

    const req = createRequest(validPayload);
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('DB crash');
  });

  // === Valid trigger values ===
  it('should accept manual trigger', async () => {
    const req = createRequest({ ...validPayload, trigger: 'manual' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('should accept rollback trigger', async () => {
    const req = createRequest({ ...validPayload, trigger: 'rollback' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('should accept resize trigger', async () => {
    const req = createRequest({ ...validPayload, trigger: 'resize' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
