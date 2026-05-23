import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { runId } = await params;
  const db = await createServiceClient();

  const { data: operation, error } = await db
    .from('operations')
    .select(`
      id, type, status, current_stage, progress_pct, error_code, error_message, attempt,
      started_at, finished_at, created_at,
      projects (
        id, name, namespace, status,
        services ( id, spec_service_id, name, type, engine, status, networking )
      )
    `)
    .eq('id', runId)
    .eq('user_id', auth.user!.id)
    .single();

  if (error || !operation) {
    return NextResponse.json({ error: 'Deployment operation not found' }, { status: 404 });
  }

  return NextResponse.json({ run: operation, operation });
}
