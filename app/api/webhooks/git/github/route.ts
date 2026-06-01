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
import { queueBuild } from '@/lib/build-job';
import { AuditLogService, getAuditContext } from '@/lib/audit';
import type { WebhookResult } from '@/lib/webhooks/types';
import { logError, sanitizeError } from '@/lib/api/error-sanitizer';

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

    // 8. Find ALL apps by repository ID and branch (includes webhook info)
    // This handles multiple apps from same repo - we'll validate signature against each
    const allApps = await Platform_App_Webhooks.find_all_by_repository(
      payload.repository.id,
      'github',
      payload.branch  // Pass the branch to filter apps
    );

    if (!allApps || allApps.length === 0) {
      console.warn(`[GitHub Webhook] No app found for repository: ${payload.repository.id} branch: ${payload.branch}`);
      return NextResponse.json({
        success: false,
        action: 'error',
        message: `No app configured for repository ${payload.repository.full_name} branch ${payload.branch}`,
      }, { status: 404 });
    }

    // 9. Find the app whose webhook secret matches the signature
    // This is necessary when multiple apps share the same repo but have different webhook secrets
    let app = null;
    for (const candidate of allApps) {
      if (candidate.webhook_secret && GitHubWebhookHandler.validateSignature(rawBody, signature, candidate.webhook_secret)) {
        app = candidate;
        console.log(`[GitHub Webhook] ✅ Signature matched for app: ${candidate.name} (${candidate.id})`);
        break;
      }
    }

    if (!app) {
      // Log which apps were tried
      const appNames = allApps.map(a => a.name).join(', ');
      console.error(`[GitHub Webhook] ❌ Invalid signature - tried apps: ${appNames}`);
      
      // Record failed attempt on first app (for tracking)
      if (allApps[0]?.webhook_id) {
        await Platform_App_Webhooks.record_trigger(allApps[0].webhook_id, 'Invalid signature');
      }
      
      return NextResponse.json({
        success: false,
        action: 'error',
        message: 'Invalid webhook signature',
      }, { status: 401 });
    }

    console.log(`[GitHub Webhook] Found app: ${app.name} (${app.id}) for branch: ${payload.branch}`);

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

    // 12. Queue the deployment — the build worker picks it up and calls AutoDeployService.
    // Responding quickly (< 10s) satisfies GitHub's webhook delivery requirement.
    console.log(`[GitHub Webhook] Queuing deployment for ${app.name} commit ${payload.commit.sha.substring(0, 7)}`);

    await queueBuild({
      appId: app.id,
      buildType: 'full',
      sourceHash: payload.commit.sha,
      branch: payload.branch,
      timestamp: Date.now(),
      deliveryId: deliveryId ?? undefined,
      webhookId: app.webhook_id,
    });

    // 13. Record the queued trigger immediately
    await Platform_App_Webhooks.record_trigger(app.webhook_id);

    const duration = Date.now() - startTime;
    console.log(`[GitHub Webhook] Deployment queued for ${app.name} (${duration}ms)`);

    // Audit log
    const auditContext = getAuditContext(req);
    await AuditLogService.create({
      user_id: app.user_id,
      user_role: 'system',
      action: 'webhook_received',
      service_type: 'git_webhook',
      service_id: app.id,
      service_name: `GitHub Webhook - ${app.name}`,
      metadata: {
        provider: 'github',
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
    logError('POST /api/webhooks/git/github', error);
    return NextResponse.json({
      success: false,
      action: 'error',
      message: sanitizeError(error),
    }, { status: 500 });
  }
}

// GitHub also sends HEAD requests to verify the endpoint
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
