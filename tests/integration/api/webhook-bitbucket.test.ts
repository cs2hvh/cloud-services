//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, HEAD } from '@/app/api/webhooks/git/bitbucket/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/webhooks/bitbucket');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/auto-deploy');
vi.mock('@/lib/services/kubernetes-info');
vi.mock('@/lib/audit');

describe('POST /api/webhooks/git/bitbucket', () => {
  const testUrl = 'http://localhost:3000/api/webhooks/git/bitbucket';

  const mockApp = {
    id: 'app-1',
    name: 'my-app',
    user_id: 'user-1',
    webhook_id: 'wh-1',
    webhook_secret: 'bb-secret-123',
    auto_deploy_enabled: true,
    deploy_branch: 'main',
    branch: 'main',
    repository_url: 'https://bitbucket.org/test/repo',
    framework: 'nextjs',
    size: 'small',
  };

  const mockPayload = {
    repository: { id: 'repo-123', full_name: 'test/repo' },
    branch: 'main',
    commit: { sha: 'abc1234567890', message: 'test commit\nsecond line' },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { BitbucketWebhookHandler } = await import('@/lib/webhooks/bitbucket');
    vi.mocked(BitbucketWebhookHandler.getHeaders).mockReturnValue({
      signature: 'sha256=valid',
      event: 'repo:push',
      deliveryId: 'delivery-1',
    });
    vi.mocked(BitbucketWebhookHandler.isPushEvent).mockReturnValue(true);
    vi.mocked(BitbucketWebhookHandler.isBranchDeletion).mockReturnValue(false);
    vi.mocked(BitbucketWebhookHandler.parsePushEvent).mockReturnValue(mockPayload);
    vi.mocked(BitbucketWebhookHandler.validateSignature).mockReturnValue(true);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_by_repository).mockResolvedValue(mockApp as any);
    vi.mocked(Platform_App_Webhooks.record_trigger).mockResolvedValue(undefined as any);

    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    vi.mocked(AutoDeployService.deploy).mockResolvedValue({
      success: true,
      buildNumber: 15,
    } as any);

    const { KubernetesInfoService } = await import('@/lib/services/kubernetes-info');
    vi.mocked(KubernetesInfoService.logAppImages).mockResolvedValue(undefined as any);

    const { AuditLogService, getAuditContext } = await import('@/lib/audit');
    vi.mocked(getAuditContext).mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'Bitbucket-Webhooks/2.0',
      requestId: 'req-1',
    } as any);
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);
  });

  function createWebhookRequest(body: string | null): NextRequest {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Event-Key': 'repo:push',
        'X-Hub-Signature': 'sha256=valid',
      },
    };
    if (body !== null) {
      init.body = body;
    }
    return new NextRequest(testUrl, init);
  }

  it('should return 400 for empty request body', async () => {
    const req = new NextRequest(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('Empty request body');
  });

  it('should return 400 for invalid JSON payload', async () => {
    const req = createWebhookRequest('not-valid-json');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('Invalid JSON payload');
  });

  it('should skip non-push events', async () => {
    const { BitbucketWebhookHandler } = await import('@/lib/webhooks/bitbucket');
    vi.mocked(BitbucketWebhookHandler.isPushEvent).mockReturnValue(false);

    const req = createWebhookRequest(JSON.stringify({ event: 'pullrequest:created' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
  });

  it('should skip branch deletion events', async () => {
    const { BitbucketWebhookHandler } = await import('@/lib/webhooks/bitbucket');
    vi.mocked(BitbucketWebhookHandler.isBranchDeletion).mockReturnValue(true);

    const req = createWebhookRequest(JSON.stringify({ push: { changes: [] } }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Branch deletion');
  });

  it('should return 404 when no app matches repository', async () => {
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_by_repository).mockResolvedValue(null as any);

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toContain('No app configured');
  });

  it('should return 401 when signature is invalid', async () => {
    const { BitbucketWebhookHandler } = await import('@/lib/webhooks/bitbucket');
    vi.mocked(BitbucketWebhookHandler.validateSignature).mockReturnValue(false);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.message).toContain('Invalid webhook signature');
    expect(Platform_App_Webhooks.record_trigger).toHaveBeenCalledWith('wh-1', 'Invalid signature');
  });

  it('should skip when auto-deploy is disabled', async () => {
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_by_repository).mockResolvedValue({
      ...mockApp,
      auto_deploy_enabled: false,
    } as any);

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Auto-deploy is disabled');
  });

  it('should skip when push branch does not match deploy branch', async () => {
    const { BitbucketWebhookHandler } = await import('@/lib/webhooks/bitbucket');
    vi.mocked(BitbucketWebhookHandler.parsePushEvent).mockReturnValue({
      ...mockPayload,
      branch: 'develop',
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/develop' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('ignored');
  });

  it('should return 500 when deployment fails', async () => {
    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    vi.mocked(AutoDeployService.deploy).mockResolvedValue({
      success: false,
      error: 'Jenkins timeout',
    } as any);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('Jenkins timeout');
    expect(Platform_App_Webhooks.record_trigger).toHaveBeenCalledWith('wh-1', 'Jenkins timeout');
  });

  it('should trigger deployment successfully', async () => {
    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    const { AuditLogService } = await import('@/lib/audit');

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.action).toBe('triggered');
    expect(data.app_name).toBe('my-app');
    expect(data.build_number).toBe(15);

    expect(AutoDeployService.deploy).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        gitProvider: 'bitbucket',
        branch: 'main',
      })
    );

    expect(Platform_App_Webhooks.record_trigger).toHaveBeenCalledWith('wh-1');
    expect(AuditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webhook_received',
        service_type: 'git_webhook',
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    const { BitbucketWebhookHandler } = await import('@/lib/webhooks/bitbucket');
    vi.mocked(BitbucketWebhookHandler.getHeaders).mockImplementation(() => {
      throw new Error('Unexpected crash');
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('Unexpected crash');
  });

  it('should handle non-Error objects thrown', async () => {
    const { BitbucketWebhookHandler } = await import('@/lib/webhooks/bitbucket');
    vi.mocked(BitbucketWebhookHandler.getHeaders).mockImplementation(() => {
      throw 'string error';
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toBe('Internal server error');
  });
});

describe('HEAD /api/webhooks/git/bitbucket', () => {
  it('should return 200 for HEAD request', async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
  });
});
