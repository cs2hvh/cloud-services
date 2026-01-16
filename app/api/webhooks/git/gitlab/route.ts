/**
 * GitLab Webhook Endpoint
 * Receives push events from GitLab and triggers deployments.
 *
 * URL: POST /api/webhooks/git/gitlab
 */
import { NextRequest, NextResponse } from 'next/server';
import { GitLabWebhookHandler } from '@/lib/webhooks/gitlab';
import { Platform_App_Webhooks } from '@/lib/supabase/queries';
import { AutoDeployService } from '@/lib/services/auto-deploy';
import { KubernetesInfoService } from '@/lib/services/kubernetes-info';
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

    // 7. Find app by repository ID (GitLab project ID)
    const app = await Platform_App_Webhooks.find_by_repository(
      payload.repository.id,
      'gitlab'
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

    // 11. Trigger deployment via AutoDeployService (handles token refresh)
    console.log(`[GitLab Webhook] Triggering deployment for ${app.name}...`);

    const deployResult = await AutoDeployService.deploy({
      appId: app.id,
      appName: app.name,
      userId: app.user_id,
      gitProvider: 'gitlab',
      repositoryUrl: app.repository_url,
      branch: payload.branch,
      framework: app.framework,
      size: app.size || 'small',
      commitSha: payload.commit.sha,
      deliveryId: deliveryId || undefined,
    });

    if (!deployResult.success) {
      console.error('[GitLab Webhook] Failed to trigger build:', deployResult.error);

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
      `[GitLab Webhook] Deployment triggered for ${app.name} (${duration}ms)`
    );
    console.log(
      `[GitLab Webhook] Build #${deployResult.buildNumber} - Commit: ${payload.commit.sha.substring(
        0,
        7
      )}`
    );

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
    console.error('[GitLab Webhook] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        success: false,
        action: 'error',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// GitLab may send HEAD/GET for verification; respond with 200
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
