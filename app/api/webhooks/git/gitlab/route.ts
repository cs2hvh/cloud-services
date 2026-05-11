/**
 * GitLab Webhook Endpoint
 * Receives push events from GitLab and triggers deployments.
 *
 * URL: POST /api/webhooks/git/gitlab
 */
import { NextRequest, NextResponse } from 'next/server';
import { GitLabWebhookHandler } from '@/lib/webhooks/gitlab';
import { Platform_App_Webhooks } from '@/lib/supabase/queries';
import { queueBuild } from '@/lib/build-job';
import { logError, sanitizeError } from '@/lib/api/error-sanitizer';
import { KubernetesInfoService } from '@/lib/services/kubernetes-info';
import { AuditLogService, getAuditContext } from '@/lib/audit';
import type { WebhookResult } from '@/lib/webhooks/types';

export async function POST(req: NextRequest): Promise<NextResponse<WebhookResult>> {
  const startTime = Date.now();

  try {
    // 1. Get raw body for potential logging (not used in token validation)
    const rawBody = await req.text();

    if (!rawBody) {
      console.error('[GitLab Webhook] Empty request body');
      return NextResponse.json(
        {
          success: false,
          action: 'error',
          message: 'Empty request body',
        },
        { status: 400 }
      );
    }

    // 2. Parse JSON
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      console.error('[GitLab Webhook] Invalid JSON payload');
      return NextResponse.json(
        {
          success: false,
          action: 'error',
          message: 'Invalid JSON payload',
        },
        { status: 400 }
      );
    }

    // 3. Get GitLab headers
    const { signature, event, deliveryId } = GitLabWebhookHandler.getHeaders(req.headers);

    console.log(`[GitLab Webhook] Received event: ${event}, delivery: ${deliveryId}`);

    // 4. Only process push events
    if (!GitLabWebhookHandler.isPushEvent(event)) {
      console.log(`[GitLab Webhook] Ignoring event type: ${event}`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: `Ignoring event: ${event}`,
      });
    }

    // 5. Check for branch deletion
    if (GitLabWebhookHandler.isBranchDeletion(body)) {
      console.log('[GitLab Webhook] Ignoring branch deletion event');
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: 'Branch deletion - no deployment triggered',
      });
    }

    // 6. Parse push event
    const payload = GitLabWebhookHandler.parsePushEvent(body, deliveryId);

    console.log(
      `[GitLab Webhook] Push to ${payload.repository.full_name}:${payload.branch}`
    );
    console.log(
      `[GitLab Webhook] Commit: ${payload.commit.sha.substring(0, 7)} - ${
        payload.commit.message.split('\n')[0]
      }`
    );

    // 7. Find app by repository ID (GitLab project ID) + pushed branch for correct multi-app routing
    const app = await Platform_App_Webhooks.find_by_repository(
      payload.repository.id,
      'gitlab',
      payload.branch,
    );

    if (!app) {
      console.warn(
        `[GitLab Webhook] No app found for repository: ${payload.repository.id}`
      );
      return NextResponse.json(
        {
          success: false,
          action: 'error',
          message: `No app configured for repository ${payload.repository.full_name}`,
        },
        { status: 404 }
      );
    }

    console.log(`[GitLab Webhook] Found app: ${app.name} (${app.id})`);

    // Best-effort: log current Kubernetes images (connectivity verification)
    KubernetesInfoService.logAppImages(app.name, `gitlab-webhook-pre-build delivery=${deliveryId || 'n/a'}`)
      .catch(() => undefined);

    // 8. Validate webhook token
    const validSignature = GitLabWebhookHandler.validateSignature(
      rawBody,
      signature,
      app.webhook_secret
    );

    if (!validSignature) {
      console.error(`[GitLab Webhook] Invalid token for app: ${app.name}`);

      await Platform_App_Webhooks.record_trigger(app.webhook_id, 'Invalid token');

      return NextResponse.json(
        {
          success: false,
          action: 'error',
          message: 'Invalid webhook token',
        },
        { status: 401 }
      );
    }

    // 9. Check if auto-deploy is enabled
    if (!app.auto_deploy_enabled) {
      console.log(`[GitLab Webhook] Auto-deploy disabled for app: ${app.name}`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: 'Auto-deploy is disabled for this app',
        app_name: app.name,
      });
    }

    // 10. Check branch filter
    const targetBranch = app.deploy_branch || app.branch;
    if (payload.branch !== targetBranch) {
      console.log(
        `[GitLab Webhook] Branch mismatch: pushed to ${payload.branch}, deploy branch is ${targetBranch}`
      );
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: `Push to ${payload.branch} ignored, deploy branch is ${targetBranch}`,
        app_name: app.name,
        branch: payload.branch,
      });
    }

    // 11. Queue the deployment — the build worker picks it up and calls AutoDeployService.
    console.log(`[GitLab Webhook] Queuing deployment for ${app.name} commit ${payload.commit.sha.substring(0, 7)}`);

    await queueBuild({
      appId: app.id,
      buildType: 'full',
      sourceHash: payload.commit.sha,
      branch: payload.branch,
      timestamp: Date.now(),
      deliveryId: deliveryId ?? undefined,
      webhookId: app.webhook_id,
    });

    // 12. Record the queued trigger immediately
    await Platform_App_Webhooks.record_trigger(app.webhook_id);

    const duration = Date.now() - startTime;
    console.log(`[GitLab Webhook] Deployment queued for ${app.name} (${duration}ms)`);

    // Audit log
    const auditContext = getAuditContext(req);
    await AuditLogService.create({
      user_id: app.user_id,
      user_role: 'system',
      action: 'webhook_received',
      service_type: 'git_webhook',
      service_id: app.id,
      service_name: `GitLab Webhook - ${app.name}`,
      metadata: {
        provider: 'gitlab',
        event: 'push',
        delivery_id: deliveryId,
        repository: payload.repository.full_name,
        branch: payload.branch,
        commit_sha: payload.commit.sha,
        commit_message: payload.commit.message.split('\n')[0],
        duration_ms: duration,
        result: 'queued',
      },
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
    });

    return NextResponse.json({
      success: true,
      action: 'queued',
      message: `Deployment queued for ${app.name}`,
      app_name: app.name,
      branch: payload.branch,
      commit_sha: payload.commit.sha,
    }, { status: 202 });
  } catch (error: unknown) {
    logError('POST /api/webhooks/git/gitlab', error);
    return NextResponse.json(
      {
        success: false,
        action: 'error',
        message: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}

// GitLab may send HEAD/GET for verification; respond with 200
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
