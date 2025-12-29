import { NextRequest, NextResponse } from 'next/server';
import { Platform_App_Deployments, Platform_Apps } from '@/lib/supabase/queries';
import { createServiceClient } from '@/lib/supabase/server';

type DeploymentRecordPayload = {
  app_id: string;
  build_number?: number | string | null;
  commit_sha?: string | null;
  image_tag?: string | null;
  image_digest?: string | null;
  status: 'success' | 'failed';
  trigger: 'manual' | 'webhook' | 'rollback';
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
  try {
   

    const body = (await req.json()) as Partial<DeploymentRecordPayload>;

    if (!body.app_id || !body.status || !body.trigger) {
      return NextResponse.json(
        { error: 'Missing required fields: app_id, status, trigger' },
        { status: 400 }
      );
    }

    if (body.status !== 'success' && body.status !== 'failed') {
      return NextResponse.json({ error: `Invalid status: ${String(body.status)}` }, { status: 400 });
    }

    if (body.trigger !== 'manual' && body.trigger !== 'webhook' && body.trigger !== 'rollback') {
      return NextResponse.json({ error: `Invalid trigger: ${String(body.trigger)}` }, { status: 400 });
    }

    const buildNumber = normalizeInt(body.build_number);

    // Record should include at least one stable image identity.
    const image_tag = body.image_tag ?? null;
    const image_digest = body.image_digest ?? null;
    if (!image_tag && !image_digest) {
      return NextResponse.json(
        { error: 'Missing required fields: image_tag or image_digest' },
        { status: 400 }
      );
    }

    const insert = await Platform_App_Deployments.create({
      app_id: body.app_id,
      build_number: buildNumber,
      commit_sha: body.commit_sha ?? null,
      image_tag,
      image_digest,
      status: body.status,
      trigger: body.trigger,
    });

    // Handle idempotency: Jenkins/webhook retries can repeat the same build_number.
    let deployment = insert.success ? insert.data : null;

    if (!deployment && insert.error && buildNumber !== null) {
      const msg = String(insert.error);
      const looksLikeDuplicate =
        msg.includes('duplicate') ||
        msg.includes('uq_platform_app_deployments_app_build_number') ||
        msg.includes('unique') ||
        msg.includes('23505');

      if (looksLikeDuplicate) {
        const supabase = await createServiceClient();
        const { data } = await supabase
          .from('platform_app_deployments')
          .select('*')
          .eq('app_id', body.app_id)
          .eq('build_number', buildNumber)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        deployment = data || null;
      }
    }

    if (!deployment) {
      return NextResponse.json(
        { error: insert.error || 'Failed to create deployment record' },
        { status: 500 }
      );
    }

    // Mark as active + update app status on successful deploy
    if (body.status === 'success') {
      await Platform_App_Deployments.set_active_for_app(body.app_id, deployment.id);
      await Platform_Apps.update(body.app_id, {
        status: 'running',
        last_deploy_trigger: body.trigger,
        last_deploy_commit: body.commit_sha ?? null,
      });
    }

    return NextResponse.json({
      success: true,
      deployment,
    });
  } catch (error: unknown) {
    console.error('[DeploymentRecordWebhook] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
