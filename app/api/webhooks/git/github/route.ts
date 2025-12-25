/**
 * GitHub Webhook Endpoint
 * Receives push events from GitHub and triggers deployments
 * 
 * URL: POST /api/webhooks/git/github
 * 
 * Best Practices Implemented:
 * - Responds within 10 seconds (GitHub requirement)
 * - Validates webhook signature (HMAC-SHA256)
 * - Uses X-GitHub-Delivery for idempotency
 * - Refreshes access tokens for private repos
 * - Updates Jenkins job config with fresh token
 * - Polls build status until completion
 */
import { NextRequest, NextResponse } from 'next/server';
import { GitHubWebhookHandler } from '@/lib/webhooks/github';
import { Platform_App_Webhooks } from '@/lib/supabase/queries';
import { AutoDeployService } from '@/lib/services/auto-deploy';
import type { WebhookResult } from '@/lib/webhooks/types';

export async function POST(req: NextRequest): Promise<NextResponse<WebhookResult>> {
  const startTime = Date.now();
  
  try {
    // 1. Get raw body for signature validation (must read before parsing)
    const rawBody = await req.text();
    
    if (!rawBody) {
      console.error('[GitHub Webhook] Empty request body');
      return NextResponse.json({
        success: false,
        action: 'error',
        message: 'Empty request body',
      }, { status: 400 });
    }

    // 2. Parse JSON
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      console.error('[GitHub Webhook] Invalid JSON payload');
      return NextResponse.json({
        success: false,
        action: 'error',
        message: 'Invalid JSON payload',
      }, { status: 400 });
    }

    // 3. Get GitHub headers
    const { signature, event, deliveryId } = GitHubWebhookHandler.getHeaders(req.headers);
    
    console.log(`[GitHub Webhook] Received event: ${event}, delivery: ${deliveryId}`);

    // 4. Handle ping event (webhook creation confirmation)
    if (GitHubWebhookHandler.isPingEvent(event)) {
      const pingData = GitHubWebhookHandler.parsePingEvent(body);
      console.log(`[GitHub Webhook] ✅ Ping received - Webhook ID: ${pingData.webhook_id}, Zen: "${pingData.zen}"`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: `Webhook configured successfully. Zen: ${pingData.zen}`,
      });
    }

    // 5. Only process push events
    if (!GitHubWebhookHandler.isPushEvent(event)) {
      console.log(`[GitHub Webhook] Ignoring event type: ${event}`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: `Ignoring event: ${event}`,
      });
    }

    // 6. Check for branch deletion
    if (GitHubWebhookHandler.isBranchDeletion(body)) {
      console.log(`[GitHub Webhook] Ignoring branch deletion event`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: 'Branch deletion - no deployment triggered',
      });
    }

    // 7. Parse push event
    const payload = GitHubWebhookHandler.parsePushEvent(body, deliveryId);
    
    console.log(`[GitHub Webhook] Push to ${payload.repository.full_name}:${payload.branch}`);
    console.log(`[GitHub Webhook] Commit: ${payload.commit.sha.substring(0, 7)} - ${payload.commit.message.split('\n')[0]}`);

    // 8. Find app by repository ID and branch (includes webhook info)
    // This handles multiple apps from same repo by matching on branch
    const app = await Platform_App_Webhooks.find_by_repository(
      payload.repository.id,
      'github',
      payload.branch  // Pass the branch to filter apps
    );

    if (!app) {
      console.warn(`[GitHub Webhook] No app found for repository: ${payload.repository.id} branch: ${payload.branch}`);
      return NextResponse.json({
        success: false,
        action: 'error',
        message: `No app configured for repository ${payload.repository.full_name} branch ${payload.branch}`,
      }, { status: 404 });
    }

    console.log(`[GitHub Webhook] Found app: ${app.name} (${app.id}) for branch: ${payload.branch}`);

    // 9. Validate webhook signature (HMAC-SHA256)
    if (!GitHubWebhookHandler.validateSignature(rawBody, signature, app.webhook_secret)) {
      console.error(`[GitHub Webhook] ❌ Invalid signature for app: ${app.name}`);
      
      // Record failed attempt
      await Platform_App_Webhooks.record_trigger(app.webhook_id, 'Invalid signature');
      
      return NextResponse.json({
        success: false,
        action: 'error',
        message: 'Invalid webhook signature',
      }, { status: 401 });
    }

    // 10. Check if auto-deploy is enabled
    if (!app.auto_deploy_enabled) {
      console.log(`[GitHub Webhook] Auto-deploy disabled for app: ${app.name}`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: 'Auto-deploy is disabled for this app',
        app_name: app.name,
      });
    }

    // 11. Check branch filter
    const targetBranch = app.deploy_branch || app.branch;
    if (payload.branch !== targetBranch) {
      console.log(`[GitHub Webhook] Branch mismatch: pushed to ${payload.branch}, deploy branch is ${targetBranch}`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: `Push to ${payload.branch} ignored, deploy branch is ${targetBranch}`,
        app_name: app.name,
        branch: payload.branch,
      });
    }

    // 12. Trigger auto-deploy with fresh token refresh
    // This is the key change - we now use AutoDeployService which:
    // - Gets fresh access token for the user
    // - Updates Jenkins job config with authenticated URL
    // - Triggers build and polls for status
    console.log(`[GitHub Webhook] 🚀 Triggering auto-deploy for ${app.name}...`);
    
    const deployResult = await AutoDeployService.deploy({
      appId: app.id,
      appName: app.name,
      userId: app.user_id,
      gitProvider: 'github',
      repositoryUrl: app.repository_url,
      branch: targetBranch,
      framework: app.framework,
      port: app.port || 3000,
      size: app.size || 'small',
      commitSha: payload.commit.sha,
      deliveryId: deliveryId,  // For idempotency
    });

    // 13. Handle deploy result
    if (deployResult.skipped) {
      console.log(`[GitHub Webhook] ⏭️ Deployment skipped: ${deployResult.skipReason}`);
      return NextResponse.json({
        success: true,
        action: 'skipped',
        message: deployResult.skipReason || 'Deployment skipped',
        app_name: app.name,
      });
    }

    if (!deployResult.success) {
      console.error(`[GitHub Webhook] ❌ Auto-deploy failed:`, deployResult.error);
      
      // Record error
      await Platform_App_Webhooks.record_trigger(app.webhook_id, deployResult.error);
      
      return NextResponse.json({
        success: false,
        action: 'error',
        message: `Failed to trigger deployment: ${deployResult.error}`,
        app_name: app.name,
      }, { status: 500 });
    }

    // 14. Record successful trigger
    await Platform_App_Webhooks.record_trigger(app.webhook_id);

    const duration = Date.now() - startTime;
    console.log(`[GitHub Webhook] ✅ Deployment triggered for ${app.name} (${duration}ms)`);
    console.log(`[GitHub Webhook] Build #${deployResult.buildNumber} - Commit: ${payload.commit.sha.substring(0, 7)}`);

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
    console.error('[GitHub Webhook] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({
      success: false,
      action: 'error',
      message: errorMessage,
    }, { status: 500 });
  }
}

// GitHub also sends HEAD requests to verify the endpoint
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
