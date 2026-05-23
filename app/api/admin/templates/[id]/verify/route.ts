import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const approve = body?.status === 'verified' || body?.approve === true;
  const notes = typeof body?.notes === 'string' ? body.notes : null;
  const db = await createServiceClient();

  const { data: template } = await db
    .from('templates')
    .select('id, latest_published_version_id')
    .eq('id', id)
    .single();

  if (!template?.latest_published_version_id) {
    return NextResponse.json({ error: 'Published template not found' }, { status: 404 });
  }

  const status = approve ? 'verified' : 'rejected';
  const reviewStatus = approve ? 'approved' : 'rejected';
  const now = new Date().toISOString();

  await db.from('templates').update({ verification_status: status }).eq('id', id);
  await db.from('template_review_requests').upsert({
    template_id: id,
    template_version_id: template.latest_published_version_id,
    reviewer_id: admin.userId,
    status: reviewStatus,
    notes,
    reviewed_at: now,
  }, { onConflict: 'template_version_id' });

  return NextResponse.json({ verificationStatus: status });
}

async function requireAdmin() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return { ok: false as const, response: auth.response };

  const db = await createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('roles')
    .eq('id', auth.user!.id)
    .single();

  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  if (!roles.includes('admin')) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const, userId: auth.user!.id };
}
