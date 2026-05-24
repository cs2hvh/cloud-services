import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const db = await createServiceClient();
  const { data, error } = await db
    .from('stacks')
    .select(`
      id, name, namespace, status, created_at, ready_at,
      template_id, template_version_id,
      services ( id, name, type, engine, status, networking, source ),
      templates!template_id ( id, latest_published_version_id )
    `)
    .eq('user_id', auth.user!.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    instances: (data ?? []).map(deploymentToLegacyInstance),
    projects: data ?? [],
  });
}

function deploymentToLegacyInstance(deployment: {
  id: string;
  name: string;
  namespace: string;
  status: string;
  created_at: string;
  ready_at: string | null;
  template_id?: string | null;
  template_version_id?: string | null;
  templates?: { id: string; latest_published_version_id: string | null }[] | { id: string; latest_published_version_id: string | null } | null;
  services?: Array<{
    name: string;
    type: string;
    engine: string | null;
    status: string;
    networking: { publicUrl?: string; publicPorts?: unknown[] } | null;
  }>;
}) {
  const template = Array.isArray(deployment.templates) ? deployment.templates[0] : deployment.templates;
  const hasTemplateUpdate =
    !!deployment.template_id &&
    !!deployment.template_version_id &&
    !!template?.latest_published_version_id &&
    deployment.template_version_id !== template.latest_published_version_id;

  return {
    id: deployment.id,
    project_name: deployment.name,
    namespace: deployment.namespace,
    status: deployment.status,
    created_at: deployment.created_at,
    ready_at: deployment.ready_at,
    hasTemplateUpdate,
    template_instance_services: (deployment.services ?? []).map(service => ({
      service_name: service.name,
      service_type: service.type,
      engine:       service.engine ?? 'generic',
      status:       service.status === 'healthy' ? 'healthy' : service.status,
      public_domain: service.networking?.publicUrl ?? null,
    })),
  };
}
