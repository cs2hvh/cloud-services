import { NextRequest, NextResponse } from 'next/server';
import { Platform_App_Deployments, Platform_Apps } from '@/lib/supabase/queries';
import * as crypto from 'crypto';

type DeploymentRecordPayload = {
  app_id: string;
  build_number?: number | string | null;
  commit_sha?: string | null;
  image_tag?: string | null;
  image_digest?: string | null;
  failure_reason?: string | null;
  status: 'success' | 'failed';
  trigger: 'manual' | 'webhook' | 'rollback' | 'resize';
};

function normalizeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Jenkins Deployment Record Webhook
 *
 * POST /api/webhooks/platform-apps/deployment-record
 *
 * Auth:
 * - Requires header: x-deployment-record-secret: <JENKINS_DEPLOYMENT_RECORD_SECRET>
 *
 * Purpose:
 * - Store immutable deployment history for rollback (no rebuild)
 * - Optionally mark the new deployment as active on success
 */
export async function POST(req: NextRequest) {
  // Validate webhook shared secret
  const expectedSecret = process.env.JENKINS_DEPLOYMENT_RECORD_SECRET;
  if (!expectedSecret) {
    console.error('[DeploymentRecordWebhook] JENKINS_DEPLOYMENT_RECORD_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 503 }
    );
  }

  const providedSecret = req.headers.get('x-deployment-record-secret');
  const expectedBuf = Buffer.from(expectedSecret);
  const providedBuf = providedSecret ? Buffer.from(providedSecret) : Buffer.alloc(0);
  if (
    !providedSecret ||
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as Partial<DeploymentRecordPayload>;

    if (!body.app_id || !body.status || !body.trigger) {
      console.error('[DeploymentRecordWebhook] Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: app_id, status, trigger' },
        { status: 400 }
      );
    }

    if (body.status !== 'success' && body.status !== 'failed') {
      return NextResponse.json({ error: `Invalid status: ${String(body.status)}` }, { status: 400 });
    }

    if (body.trigger !== 'manual' && body.trigger !== 'webhook' && body.trigger !== 'rollback' && body.trigger !== 'resize') {
      return NextResponse.json({ error: `Invalid trigger: ${String(body.trigger)}` }, { status: 400 });
    }

    const buildNumber = normalizeInt(body.build_number);

    if (buildNumber === null) {
      return NextResponse.json(
        { error: 'Missing required field: build_number' },
        { status: 400 }
      );
    }

    // Record should include at least one stable image identity.
    const image_tag = body.image_tag ?? null;
    const image_digest = body.image_digest ?? null;
    const failure_reason = body.failure_reason ?? null;
    if (!image_tag && !image_digest) {
      return NextResponse.json(
        { error: 'Missing required fields: image_tag or image_digest' },
        { status: 400 }
      );
    }

    const finalized = await Platform_App_Deployments.complete_build({
      app_id: body.app_id,
      status: body.status,
      build_number: buildNumber,
      image_tag,
      image_digest,
      failure_reason: body.status === 'failed' ? failure_reason : null,
      allowed_current_statuses: ['building'],
      create_if_missing: true,
      trigger: body.trigger,
      commit_sha: body.commit_sha ?? null,
    });

    if (!finalized.success || !finalized.data) {
      console.error('[DeploymentRecordWebhook] Failed to finalize deployment record:', finalized.error);
      return NextResponse.json(
        { error: finalized.error || 'Failed to finalize deployment record' },
        { status: 500 }
      );
    }

    const deployment = finalized.data;

    const finalStatus = deployment.status;

    // Update app status and mark active deployment based on the finalized deployment row.
    // This avoids late webhook deliveries flipping app state when complete_build()
    // intentionally kept an existing terminal failure.
    if (finalStatus === 'success') {
      if (finalized.updated || finalized.created) {
        console.log('[DeploymentRecordWebhook] Setting deployment as active:', deployment.id);
        await Platform_App_Deployments.set_active_for_app(body.app_id, deployment.id);
      }
      await Platform_Apps.update(body.app_id, {
        status: 'running',
        last_deploy_trigger: body.trigger,
        last_deploy_commit: body.commit_sha ?? null,
        last_failure_reason: null,
      });
    } else {
      await Platform_Apps.update(body.app_id, {
        status: 'failed',
        last_deploy_trigger: body.trigger,
        last_deploy_commit: body.commit_sha ?? null,
        last_failure_reason: deployment.failure_reason ?? failure_reason,
      });
    }

    console.log('[DeploymentRecordWebhook] ✅ Deployment record finalized:', deployment.id);

    return NextResponse.json({
      success: true,
      deployment,
    });
  } catch (error: unknown) {
    console.error('[DeploymentRecordWebhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
