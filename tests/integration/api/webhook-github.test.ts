//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, HEAD } from '@/app/api/webhooks/git/github/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/webhooks/github');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/auto-deploy');
vi.mock('@/lib/audit');

describe('POST /api/webhooks/git/github', () => {
  const testUrl = 'http://localhost:3000/api/webhooks/git/github';

  const mockApp = {
    id: 'app-1',
    name: 'my-app',
    user_id: 'user-1',
    webhook_id: 'wh-1',
    webhook_secret: 'secret123',
    auto_deploy_enabled: true,
    deploy_branch: 'main',
    branch: 'main',
    repository_url: 'https://github.com/test/repo',
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

    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.getHeaders).mockReturnValue({
      signature: 'sha256=valid',
      event: 'push',
      deliveryId: 'delivery-1',
    });
    vi.mocked(GitHubWebhookHandler.isPingEvent).mockReturnValue(false);
    vi.mocked(GitHubWebhookHandler.isPushEvent).mockReturnValue(true);
    vi.mocked(GitHubWebhookHandler.isBranchDeletion).mockReturnValue(false);
    vi.mocked(GitHubWebhookHandler.parsePushEvent).mockReturnValue(mockPayload);
    vi.mocked(GitHubWebhookHandler.validateSignature).mockReturnValue(true);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_all_by_repository).mockResolvedValue([mockApp] as any);
    vi.mocked(Platform_App_Webhooks.record_trigger).mockResolvedValue(undefined as any);

    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    vi.mocked(AutoDeployService.deploy).mockResolvedValue({
      success: true,
      buildNumber: 42,
    } as any);

    const { AuditLogService, getAuditContext } = await import('@/lib/audit');
    vi.mocked(getAuditContext).mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'GitHub-Hookshot/test',
      requestId: 'req-1',
    } as any);
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);
  });

  function createWebhookRequest(body: string | null): NextRequest {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-Hub-Signature-256': 'sha256=valid',
        'X-GitHub-Delivery': 'delivery-1',
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
    const req = createWebhookRequest('not-json{{{');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('Invalid JSON payload');
  });

  // === Ping event ===
  it('should handle ping event successfully', async () => {
    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.isPingEvent).mockReturnValue(true);
    vi.mocked(GitHubWebhookHandler.parsePingEvent).mockReturnValue({
      webhook_id: 'wh-123',
      zen: 'Keep it simple',
    });

    const req = createWebhookRequest(JSON.stringify({ zen: 'Keep it simple' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Keep it simple');
  });

  // === Non-push event ===
  it('should skip non-push events', async () => {
    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.isPingEvent).mockReturnValue(false);
    vi.mocked(GitHubWebhookHandler.isPushEvent).mockReturnValue(false);

    const req = createWebhookRequest(JSON.stringify({ action: 'created' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Ignoring event');
  });

  // === Branch deletion ===
  it('should skip branch deletion events', async () => {
    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.isBranchDeletion).mockReturnValue(true);

    const req = createWebhookRequest(JSON.stringify({ deleted: true }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Branch deletion');
  });

  // === No matching apps ===
  it('should return 404 when no apps match repository', async () => {
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_all_by_repository).mockResolvedValue([]);

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toContain('No app configured');
  });

  it('should return 404 when find_all_by_repository returns null', async () => {
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_all_by_repository).mockResolvedValue(null as any);

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // === Invalid signature ===
  it('should return 401 when signature does not match any app', async () => {
    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.validateSignature).mockReturnValue(false);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.message).toContain('Invalid webhook signature');
    expect(Platform_App_Webhooks.record_trigger).toHaveBeenCalledWith('wh-1', 'Invalid signature');
  });

  // === Auto-deploy disabled ===
  it('should skip when auto-deploy is disabled', async () => {
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_all_by_repository).mockResolvedValue([
      { ...mockApp, auto_deploy_enabled: false },
    ] as any);

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Auto-deploy is disabled');
  });

  // === Branch mismatch ===
  it('should skip when push branch does not match deploy branch', async () => {
    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.parsePushEvent).mockReturnValue({
      ...mockPayload,
      branch: 'develop',
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/develop' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('ignored');
    expect(data.branch).toBe('develop');
  });

  // === Deployment skipped ===
  it('should handle deploy skipped result', async () => {
    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    vi.mocked(AutoDeployService.deploy).mockResolvedValue({
      success: true,
      skipped: true,
      skipReason: 'Duplicate delivery',
    } as any);

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('skipped');
    expect(data.message).toContain('Duplicate delivery');
  });

  // === Deploy failure ===
  it('should return 500 when deployment fails', async () => {
    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    vi.mocked(AutoDeployService.deploy).mockResolvedValue({
      success: false,
      error: 'Jenkins unreachable',
    } as any);

    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('Jenkins unreachable');
    expect(Platform_App_Webhooks.record_trigger).toHaveBeenCalledWith('wh-1', 'Jenkins unreachable');
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
    expect(data.build_number).toBe(42);

    expect(AutoDeployService.deploy).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        appName: 'my-app',
        gitProvider: 'github',
        branch: 'main',
        commitSha: 'abc1234567890',
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

  // === Multi-app signature matching ===
  it('should match the correct app when multiple apps share same repo', async () => {
    const app2 = { ...mockApp, id: 'app-2', name: 'my-app-2', webhook_id: 'wh-2', webhook_secret: 'secret456' };
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_all_by_repository).mockResolvedValue([
      mockApp, app2,
    ] as any);

    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    // First app fails signature, second succeeds
    vi.mocked(GitHubWebhookHandler.validateSignature)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const { AutoDeployService } = await import('@/lib/services/auto-deploy');

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.app_name).toBe('my-app-2');
    expect(AutoDeployService.deploy).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'app-2' })
    );
  });

  // === Uses deploy_branch when set ===
  it('should use deploy_branch over branch field', async () => {
    const { Platform_App_Webhooks } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Webhooks.find_all_by_repository).mockResolvedValue([
      { ...mockApp, deploy_branch: 'production', branch: 'main' },
    ] as any);

    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.parsePushEvent).mockReturnValue({
      ...mockPayload,
      branch: 'production',
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/production' }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action).toBe('triggered');
  });

  // === Unexpected error ===
  it('should return 500 on unexpected error', async () => {
    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.getHeaders).mockImplementation(() => {
      throw new Error('Unexpected crash');
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('Unexpected crash');
  });

  // === Non-Error thrown ===
  it('should handle non-Error objects thrown', async () => {
    const { GitHubWebhookHandler } = await import('@/lib/webhooks/github');
    vi.mocked(GitHubWebhookHandler.getHeaders).mockImplementation(() => {
      throw 'string error';
    });

    const req = createWebhookRequest(JSON.stringify({ ref: 'refs/heads/main' }));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toBe('Internal server error');
  });
});

describe('HEAD /api/webhooks/git/github', () => {
  it('should return 200 for HEAD request', async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
  });
});
