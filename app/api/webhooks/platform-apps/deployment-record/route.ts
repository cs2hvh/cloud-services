import { NextRequest, NextResponse } from 'next/server';
import { Platform_Apps } from '@/lib/supabase/queries';
import * as crypto from 'crypto';
import { AppOperationFinalizer } from '@/lib/app-operations';

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

    const image_tag = body.image_tag ?? null;
    const image_digest = body.image_digest ?? null;
    const failure_reason = body.failure_reason ?? null;
    if (body.status === 'success' && !image_tag && !image_digest) {
      return NextResponse.json(
        { error: 'Missing required fields: image_tag or image_digest' },
        { status: 400 }
      );
    }

    const finalizer = new AppOperationFinalizer();
    const appLookup = await Platform_Apps.get(body.app_id);
    const appName =
      appLookup.success && appLookup.data?.name
        ? appLookup.data.name
        : image_tag?.split("/").pop()?.split(":")[0] || body.app_id;
    const finalization = await finalizer.finalizeBuildOperation({
      appId: body.app_id,
      appName,
      buildNumber,
      trigger: body.trigger,
      status: body.status,
      failureReason: body.status === 'failed' ? failure_reason : null,
      imageTag: image_tag,
      imageDigest: image_digest,
      commitSha: body.commit_sha ?? null,
      allowedCurrentStatuses: ['building'],
      allowLegacyCreate: false,
    });

    const deployment = finalization.record;

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
