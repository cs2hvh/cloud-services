import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { CoreV1Api } from '@kubernetes/client-node';
import kubeConfig from '@/lib/kubernetes';

type RouteCtx = { params: Promise<{ id: string; name: string }> };

export async function GET(req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id, name } = await params;
  const tail = Math.min(parseInt(req.nextUrl.searchParams.get('tail') ?? '200', 10), 1000);
  const db = await createServiceClient();

  const { data: project } = await db
    .from('stacks')
    .select('id, namespace, services(id, spec_service_id, name, status)')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  const service = (project?.services as Array<{ id: string; spec_service_id: string; name: string; status: string }> | undefined)
    ?.find(item => item.name === name || item.spec_service_id === name);

  if (!project || !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  }

  const namespace = project.namespace as string;
  const core = kubeConfig.makeApiClient(CoreV1Api);

  try {
    // Find the most recent running pod for this service
    const { items: pods } = await core.listNamespacedPod({
      namespace,
      labelSelector: `app=${service.name}`,
    });

    if (!pods || pods.length === 0) {
      return NextResponse.json({ logs: '', podName: null, message: 'No pods found — service may still be starting.' });
    }

    // Prefer Running pods; fall back to the most recently created one
    const sorted = pods.sort((a, b) => {
      const aRunning = a.status?.phase === 'Running' ? 1 : 0;
      const bRunning = b.status?.phase === 'Running' ? 1 : 0;
      if (aRunning !== bRunning) return bRunning - aRunning;
      const aTime = new Date(a.metadata?.creationTimestamp ?? 0).getTime();
      const bTime = new Date(b.metadata?.creationTimestamp ?? 0).getTime();
      return bTime - aTime;
    });

    const pod = sorted[0];
    const podName = pod.metadata?.name ?? '';

    const logs = await core.readNamespacedPodLog({
      name: podName,
      namespace,
      tailLines: tail,
      timestamps: false,
    });

    return NextResponse.json({ logs: typeof logs === 'string' ? logs : '', podName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 404 from K8s means the pod is gone — return empty rather than an error
    if (message.includes('404') || message.includes('not found')) {
      return NextResponse.json({ logs: '', podName: null, message: 'Pod not found — service may be restarting.' });
    }
    return NextResponse.json({ logs: '', podName: null, message: `Failed to fetch logs: ${message}` });
  }
}
