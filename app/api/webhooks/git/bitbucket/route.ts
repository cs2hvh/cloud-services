/**
 * Bitbucket Webhook Endpoint
 * Receives push events from Bitbucket and triggers deployments.
 *
 * URL: POST /api/webhooks/git/bitbucket
 */
import { NextRequest, NextResponse } from 'next/server';
import { BitbucketWebhookHandler } from '@/lib/webhooks/bitbucket';
import { Platform_App_Webhooks } from '@/lib/supabase/queries';
import { AutoDeployService } from '@/lib/services/auto-deploy';
import { logError, sanitizeError } from '@/lib/api/error-sanitizer';
import { KubernetesInfoService } from '@/lib/services/kubernetes-info';
import { AuditLogService, getAuditContext } from '@/lib/audit';
import type { WebhookResult } from '@/lib/webhooks/types';

export async function POST(req: NextRequest): Promise<NextResponse<WebhookResult>> {
  const startTime = Date.now();

  try {
    // 1. Get raw body for signature validation
    const rawBody = await req.text();

    if (!rawBody) {
      console.error('[Bitbucket Webhook] Empty request body');
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
      console.error('[Bitbucket Webhook] Invalid JSON payload');
      return NextResponse.json(
        {
          success: false,
          action: 'error',
          message: 'Invalid JSON payload',
        },
        { status: 400 }
      );
    }

    // 3. Get Bitbucket headers
    const { signature, event, deliveryId } = BitbucketWebhookHandler.getHeaders(req.headers);

    console.log(`[Bitbucket Webhook] Received event: ${event}, delivery: ${deliveryId}`);

    // 4. Only process push events
    if (!BitbucketWebhookHandler.isPushEvent(event)) {
      console.log(`[Bitbucket Webhook] Ignoring event type: ${event}`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: `Ignoring event: ${event}`,
      });
    }

    // 5. Check for branch deletion
    if (BitbucketWebhookHandler.isBranchDeletion(body)) {
      console.log('[Bitbucket Webhook] Ignoring branch deletion event');
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: 'Branch deletion - no deployment triggered',
      });
    }

    // 6. Parse push event
    const payload = BitbucketWebhookHandler.parsePushEvent(body, deliveryId);

    console.log(
      `[Bitbucket Webhook] Push to ${payload.repository.full_name}:${payload.branch}`
    );
    console.log(
      `[Bitbucket Webhook] Commit: ${payload.commit.sha.substring(0, 7)} - ${
        payload.commit.message.split('\n')[0]
      }`
    );

    // 7. Find app by repository ID
    const app = await Platform_App_Webhooks.find_by_repository(
      payload.repository.id,
      'bitbucket'
    );

    if (!app) {
      console.warn(
        `[Bitbucket Webhook] No app found for repository: ${payload.repository.id}`
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

    console.log(`[Bitbucket Webhook] Found app: ${app.name} (${app.id})`);

    // Best-effort: log current Kubernetes images (connectivity verification)
    KubernetesInfoService.logAppImages(app.name, `bitbucket-webhook-pre-build delivery=${deliveryId || 'n/a'}`)
      .catch(() => undefined);

    // 8. Validate webhook signature (best-effort)
    const validSignature = BitbucketWebhookHandler.validateSignature(
      rawBody,
      signature,
      app.webhook_secret
    );

    if (!validSignature) {
      console.error(`[Bitbucket Webhook] Invalid signature for app: ${app.name}`);

      await Platform_App_Webhooks.record_trigger(app.webhook_id, 'Invalid signature');

      return NextResponse.json(
        {
          success: false,
          action: 'error',
          message: 'Invalid webhook signature',
        },
        { status: 401 }
      );
    }

    // 9. Check if auto-deploy is enabled
    if (!app.auto_deploy_enabled) {
      console.log(`[Bitbucket Webhook] Auto-deploy disabled for app: ${app.name}`);
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
        `[Bitbucket Webhook] Branch mismatch: pushed to ${payload.branch}, deploy branch is ${targetBranch}`
      );
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: `Push to ${payload.branch} ignored, deploy branch is ${targetBranch}`,
        app_name: app.name,
        branch: payload.branch,
      });
    }

    // 11. Trigger deployment via AutoDeployService (handles token refresh)
    console.log(`[Bitbucket Webhook] Triggering deployment for ${app.name}...`);

    const deployResult = await AutoDeployService.deploy({
      appId: app.id,
      appName: app.name,
      userId: app.user_id,
      gitProvider: 'bitbucket',
      repositoryUrl: app.repository_url,
      branch: payload.branch,
      framework: app.framework,
      size: app.size || 'small',
      commitSha: payload.commit.sha,
      deliveryId: deliveryId || undefined,
    });

    if (!deployResult.success) {
      console.error('[Bitbucket Webhook] Failed to trigger build:', deployResult.error);

      await Platform_App_Webhooks.record_trigger(app.webhook_id, deployResult.error);

      return NextResponse.json(
        {
          success: false,
          action: 'error',
          message: `Failed to trigger build: ${deployResult.error}`,
          app_name: app.name,
        },
        { status: 500 }
      );
    }

    // 12. Record successful trigger
    await Platform_App_Webhooks.record_trigger(app.webhook_id);

    const duration = Date.now() - startTime;
    console.log(
      `[Bitbucket Webhook] Deployment triggered for ${app.name} (${duration}ms)`
    );
    console.log(
      `[Bitbucket Webhook] Build #${deployResult.buildNumber} - Commit: ${payload.commit.sha.substring(
        0,
        7
      )}`
    );

    // Audit log: webhook received and deployment triggered
    const auditContext = getAuditContext(req);
    await AuditLogService.create({
      user_id: app.user_id,
      user_role: 'system',
      action: 'webhook_received',
      service_type: 'git_webhook',
      service_id: app.id,
      service_name: `Bitbucket Webhook - ${app.name}`,
      metadata: {
        provider: 'bitbucket',
        event: 'push',
        delivery_id: deliveryId,
        repository: payload.repository.full_name,
        branch: payload.branch,
        commit_sha: payload.commit.sha,
        commit_message: payload.commit.message.split('\n')[0],
        build_number: deployResult.buildNumber,
        duration_ms: duration,
        result: 'triggered',
      },
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
    });

    return NextResponse.json({
      success: true,
      action: 'triggered',
      message: `Deployment triggered for ${app.name}`,
      app_name: app.name,
      branch: payload.branch,
      commit_sha: payload.commit.sha,
      build_number: deployResult.buildNumber,
    });
  } catch (error: unknown) {
    logError('POST /api/webhooks/git/bitbucket', error);
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

// Bitbucket may send HEAD/GET for verification; respond with 200
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
