//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, HEAD } from '@/app/api/webhooks/git/gitlab/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/webhooks/gitlab');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/auto-deploy');
vi.mock('@/lib/services/kubernetes-info');
vi.mock('@/lib/audit');

describe('POST /api/webhooks/git/gitlab', () => {
  const testUrl = 'http://localhost:3000/api/webhooks/git/gitlab';

  const mockApp = {
    id: 'app-1',
    name: 'my-app',
    user_id: 'user-1',
    webhook_id: 'wh-1',
    webhook_secret: 'gitlab-secret-123',
    auto_deploy_enabled: true,
    deploy_branch: 'main',
    branch: 'main',
    repository_url: 'https://gitlab.com/test/repo',
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

    const { GitLabWebhookHandler } = await import('@/lib/webhooks/gitlab');
    vi.mocked(GitLabWebhookHandler.getHeaders).mockReturnValue({
      signature: 'gitlab-token-value',
      event: 'Push Hook',
      deliveryId: 'delivery-1',
    });
    vi.mocked(GitLabWebhookHandler.isPushEvent).mockReturnValue(true);
    vi.mocked(GitLabWebhookHandler.isBranchDeletion).mockReturnValue(false);
    vi.mocked(GitLabWebhookHandler.parsePushEvent).mockReturnValue(mockPayload);
    vi.mocked(GitLabWebhookHandler.validateSignature).mockReturnValue(true);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_by_repository).mockResolvedValue(mockApp as any);
    vi.mocked(Platform_App_Webhooks.record_trigger).mockResolvedValue(undefined as any);

    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    vi.mocked(AutoDeployService.deploy).mockResolvedValue({
      success: true,
      buildNumber: 10,
    } as any);

    const { KubernetesInfoService } = await import('@/lib/services/kubernetes-info');
    vi.mocked(KubernetesInfoService.logAppImages).mockResolvedValue(undefined as any);

    const { AuditLogService, getAuditContext } = await import('@/lib/audit');
    vi.mocked(getAuditContext).mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'GitLab/test',
      requestId: 'req-1',
    } as any);
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);
  });

  function createWebhookRequest(body: string | null): NextRequest {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gitlab-Event': 'Push Hook',
        'X-Gitlab-Token': 'gitlab-token-value',
      },
    };
    if (body !== null) {
      init.body = body;
    }
    return new NextRequest(testUrl, init);
  }

  // === Empty body ===
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

  // === Invalid JSON ===
  it('should return 400 for invalid JSON payload', async () => {
    const req = createWebhookRequest('not-valid-json');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('Invalid JSON payload');
  });

  // === Non-push event ===
  it('should skip non-push events', async () => {
    const { GitLabWebhookHandler } = await import('@/lib/webhooks/gitlab');
    vi.mocked(GitLabWebhookHandler.isPushEvent).mockReturnValue(false);

    const req = createWebhookRequest(JSON.stringify({ object_kind: 'merge_request' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Ignoring event');
  });

  // === Branch deletion ===
  it('should skip branch deletion events', async () => {
    const { GitLabWebhookHandler } = await import('@/lib/webhooks/gitlab');
    vi.mocked(GitLabWebhookHandler.isBranchDeletion).mockReturnValue(true);

    const req = createWebhookRequest(JSON.stringify({ after: '0000000000000000000000000000000000000000' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Branch deletion');
  });

  // === No matching app ===
  it('should return 404 when no app matches repository', async () => {
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_by_repository).mockResolvedValue(null as any);

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toContain('No app configured');
  });

  // === Invalid token ===
  it('should return 401 when token is invalid', async () => {
    const { GitLabWebhookHandler } = await import('@/lib/webhooks/gitlab');
    vi.mocked(GitLabWebhookHandler.validateSignature).mockReturnValue(false);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.message).toContain('Invalid webhook token');
    expect(Platform_App_Webhooks.record_trigger).toHaveBeenCalledWith('wh-1', 'Invalid token');
  });

  // === Auto-deploy disabled ===
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

  // === Branch mismatch ===
  it('should skip when push branch does not match deploy branch', async () => {
    const { GitLabWebhookHandler } = await import('@/lib/webhooks/gitlab');
    vi.mocked(GitLabWebhookHandler.parsePushEvent).mockReturnValue({
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

  // === Deploy failure ===
  it('should return 500 when deployment fails', async () => {
    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    vi.mocked(AutoDeployService.deploy).mockResolvedValue({
      success: false,
      error: 'Build server offline',
    } as any);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('Build server offline');
    expect(Platform_App_Webhooks.record_trigger).toHaveBeenCalledWith('wh-1', 'Build server offline');
  });

  // === Successful deployment ===
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
    expect(data.build_number).toBe(10);

    expect(AutoDeployService.deploy).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        gitProvider: 'gitlab',
        branch: 'main',
      })
    );

    expect(Platform_App_Webhooks.record_trigger).toHaveBeenCalledWith('wh-1');
    expect(AuditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        action: 'webhook_received',
        service_type: 'git_webhook',
      })
    );
  });

  // === KubernetesInfoService best-effort logging ===
  it('should continue even if KubernetesInfoService.logAppImages fails', async () => {
    const { KubernetesInfoService } = await import('@/lib/services/kubernetes-info');
    vi.mocked(KubernetesInfoService.logAppImages).mockRejectedValue(new Error('K8s unreachable'));

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('triggered');
  });

  // === Unexpected error ===
  it('should return 500 on unexpected error', async () => {
    const { GitLabWebhookHandler } = await import('@/lib/webhooks/gitlab');
    vi.mocked(GitLabWebhookHandler.getHeaders).mockImplementation(() => {
      throw new Error('Unexpected crash');
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('Unexpected crash');
  });

  it('should handle non-Error objects thrown', async () => {
    const { GitLabWebhookHandler } = await import('@/lib/webhooks/gitlab');
    vi.mocked(GitLabWebhookHandler.getHeaders).mockImplementation(() => {
      throw 'string error';
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toBe('Internal server error');
  });
});

describe('HEAD /api/webhooks/git/gitlab', () => {
  it('should return 200 for HEAD request', async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
  });
});
