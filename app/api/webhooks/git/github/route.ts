/**
 * GitHub Webhook Endpoint
 * Receives push events from GitHub and triggers deployments
 * 
 * URL: POST /api/webhooks/git/github
 */
import { NextRequest, NextResponse } from 'next/server';
import { GitHubWebhookHandler } from '@/lib/webhooks/github';
import { Platform_Apps, Platform_App_Webhooks } from '@/lib/supabase/queries';
import { JenkinsService } from '@/lib/services/jenkins';
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
    let body: any;
    try {
      body = JSON.parse(rawBody);
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
      const pingData = GitHubWebhookHandler.parsePingEvent(body, deliveryId);
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

    // 8. Find app by repository ID
    const app = await Platform_App_Webhooks.find_by_repository(
      payload.repository.id,
      'github'
    );

    if (!app) {
      console.warn(`[GitHub Webhook] No app found for repository: ${payload.repository.id}`);
      return NextResponse.json({
        success: false,
        action: 'error',
        message: `No app configured for repository ${payload.repository.full_name}`,
      }, { status: 404 });
    }

    console.log(`[GitHub Webhook] Found app: ${app.name} (${app.id})`);

    // 9. Validate webhook signature
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

    // 12. Trigger Jenkins build
    console.log(`[GitHub Webhook] 🚀 Triggering deployment for ${app.name}...`);
    
    let buildNumber: number;
    try {
      buildNumber = await JenkinsService.triggerBuild(app.name);
    } catch (error: any) {
      console.error(`[GitHub Webhook] ❌ Failed to trigger build:`, error.message);
      
      // Record error
      await Platform_App_Webhooks.record_trigger(app.webhook_id, error.message);
      
      return NextResponse.json({
        success: false,
        action: 'error',
        message: `Failed to trigger build: ${error.message}`,
        app_name: app.name,
      }, { status: 500 });
    }

    // 13. Update app status
    await Platform_Apps.update(app.id, {
      status: 'building',
      last_deploy_trigger: 'webhook',
      last_deploy_commit: payload.commit.sha,
    });

    // 14. Record successful trigger
    await Platform_App_Webhooks.record_trigger(app.webhook_id);

    const duration = Date.now() - startTime;
    console.log(`[GitHub Webhook] ✅ Deployment triggered for ${app.name} (${duration}ms)`);
    console.log(`[GitHub Webhook] Build #${buildNumber} - Commit: ${payload.commit.sha.substring(0, 7)}`);

    return NextResponse.json({
      success: true,
      action: 'triggered',
      message: `Deployment triggered for ${app.name}`,
      app_name: app.name,
      branch: payload.branch,
      commit_sha: payload.commit.sha,
      build_number: buildNumber,
    });

  } catch (error: any) {
    console.error('[GitHub Webhook] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      action: 'error',
      message: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

// GitHub also sends HEAD requests to verify the endpoint
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
