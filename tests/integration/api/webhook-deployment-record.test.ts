import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/webhooks/platform-apps/deployment-record/route';

vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/platform-app-billing');

describe('POST /api/webhooks/platform-apps/deployment-record', () => {
  const testUrl = 'http://localhost:3000/api/webhooks/platform-apps/deployment-record';
  const webhookSecret = 'test-deployment-record-secret';

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
    failure_reason: null,
    commit_sha: 'abc123',
  };

  function createRequest(
    body: Record<string, unknown>,
    headers?: Record<string, string>
  ): NextRequest {
    return new NextRequest(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-deployment-record-secret': webhookSecret,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.JENKINS_DEPLOYMENT_RECORD_SECRET = webhookSecret;

    const { Platform_App_Deployments, Platform_Apps } = await import('@/lib/supabase/queries');
    const { PlatformAppBillingService } = await import('@/lib/services/platform-app-billing');

    vi.mocked(Platform_App_Deployments.complete_build).mockResolvedValue({
      success: true,
      data: mockDeployment,
      updated: true,
      created: false,
    } as any);
    vi.mocked(Platform_App_Deployments.set_active_for_app).mockResolvedValue(undefined as any);
    vi.mocked(Platform_Apps.update).mockResolvedValue({ success: true } as any);
    vi.mocked(PlatformAppBillingService.activateInitialBillingIfNeeded).mockResolvedValue({
      success: true,
      activated: true,
      alreadyActive: false,
      skipped: false,
    } as any);
  });

  it('returns 401 when the shared secret is missing', async () => {
    const req = createRequest(validPayload, { 'x-deployment-record-secret': '' });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const req = createRequest({ status: 'success', trigger: 'webhook', image_tag: 'tag' });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('app_id');
  });

  it('returns 400 for invalid status', async () => {
    const req = createRequest({ ...validPayload, status: 'running' });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when build_number is missing', async () => {
    const req = createRequest({ ...validPayload, build_number: null });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('build_number');
  });

  it('returns 400 when image identity is missing', async () => {
    const req = createRequest({
      ...validPayload,
      image_tag: null,
      image_digest: null,
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('image_tag or image_digest');
  });

  it('finalizes a successful deployment and marks the app running', async () => {
    const { Platform_App_Deployments, Platform_Apps } = await import('@/lib/supabase/queries');
    const { PlatformAppBillingService } = await import('@/lib/services/platform-app-billing');

    const req = createRequest(validPayload);
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Platform_App_Deployments.complete_build).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: 'app-1',
        build_number: 42,
        status: 'success',
        allowed_current_statuses: ['building'],
        create_if_missing: true,
      })
    );
    expect(Platform_App_Deployments.set_active_for_app).toHaveBeenCalledWith('app-1', 'deploy-1');
    expect(PlatformAppBillingService.activateInitialBillingIfNeeded).toHaveBeenCalledWith(
      'app-1',
      'deploy-1'
    );
    expect(Platform_Apps.update).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        status: 'running',
        last_deploy_trigger: 'webhook',
      })
    );
  });

  it('normalizes a string build_number before finalizing', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

    const req = createRequest({ ...validPayload, build_number: '42' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(Platform_App_Deployments.complete_build).toHaveBeenCalledWith(
      expect.objectContaining({ build_number: 42 })
    );
  });

  it('updates app status to failed and does not set active deployment on terminal failure', async () => {
    const { Platform_App_Deployments, Platform_Apps } = await import('@/lib/supabase/queries');
    const { PlatformAppBillingService } = await import('@/lib/services/platform-app-billing');
    vi.mocked(Platform_App_Deployments.complete_build).mockResolvedValue({
      success: true,
      data: {
        ...mockDeployment,
        status: 'failed',
        failure_reason: 'Build failed: FAILURE',
      },
      updated: true,
      created: false,
    } as any);

    const req = createRequest({
      ...validPayload,
      status: 'failed',
      failure_reason: 'Build failed: FAILURE',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(Platform_App_Deployments.set_active_for_app).not.toHaveBeenCalled();
    expect(PlatformAppBillingService.activateInitialBillingIfNeeded).not.toHaveBeenCalled();
    expect(Platform_Apps.update).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        status: 'failed',
        last_failure_reason: 'Build failed: FAILURE',
      })
    );
  });

  it('treats duplicate webhook delivery as idempotent success', async () => {
    const { Platform_App_Deployments, Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.complete_build).mockResolvedValue({
      success: true,
      data: mockDeployment,
      updated: false,
      created: false,
    } as any);

    const req = createRequest(validPayload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(Platform_App_Deployments.set_active_for_app).not.toHaveBeenCalled();
    expect(Platform_Apps.update).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({ status: 'running' })
    );
  });

  it('returns 500 when deployment finalization fails', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.complete_build).mockResolvedValue({
      success: false,
      error: 'Database error',
      data: null,
    } as any);

    const req = createRequest(validPayload);
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain('Database error');
  });

  it('returns 500 on unexpected errors', async () => {
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.complete_build).mockRejectedValue(new Error('DB crash'));

    const req = createRequest(validPayload);
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain('Internal server error');
  });
});
