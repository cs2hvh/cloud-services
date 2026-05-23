import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { deployFromTemplate } from '@/lib/templates/services/deployment-service';
import { z } from 'zod';

const DeployTemplateSchema = z.object({
  slug: z.string().min(1),
  projectName: z.string().min(1).max(120),
  idempotencyKey: z.string().min(8).max(200).optional(),
  inputValues: z.record(z.string()).optional(),
  serviceInputs: z.record(z.record(z.string())).optional(),
  serviceOverrides: z.record(z.object({
    name: z.string().min(1).optional(),
    image: z.string().min(1).optional(),
  })).optional(),
});

const DEPLOY_RATE_LIMIT = parseInt(process.env.DEPLOY_RATE_LIMIT_PER_MINUTE ?? '5', 10);

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = DeployTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid deployment request', details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Rate limit: max N create_project operations per user per minute
  try {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const db = await createServiceClient();
    const { data: rateData } = await db.rpc('count_recent_deploys', {
      p_user_id: auth.user!.id,
      window_seconds: 60,
    });
    const recentDeployCount = Number(rateData ?? 0);
    if (Number.isFinite(recentDeployCount) && recentDeployCount >= DEPLOY_RATE_LIMIT) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Maximum ${DEPLOY_RATE_LIMIT} deployments per minute.` },
        { status: 429 },
      );
    }
  } catch {
    // Rate limit check failure is non-fatal — let the deploy proceed
  }

  try {
    const result = await deployFromTemplate({
      slug: parsed.data.slug,
      projectName: parsed.data.projectName,
      userId: auth.user!.id,
      idempotencyKey: parsed.data.idempotencyKey,
      serviceOverrides: parsed.data.serviceOverrides,
      inputValues: parsed.data.inputValues,
      serviceInputs: parsed.data.serviceInputs,
    });

    return NextResponse.json({
      deploymentId: result.deploymentId,
      instanceId: result.deploymentId,
      operationId: result.operationId,
      runId: result.operationId,
      namespace: result.namespace,
      status: 'queued',
    }, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create deployment operation' },
      { status: 500 }
    );
  }
}
