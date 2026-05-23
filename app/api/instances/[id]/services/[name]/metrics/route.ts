import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { CoreV1Api, CustomObjectsApi } from '@kubernetes/client-node';
import kubeConfig from '@/lib/kubernetes';

type RouteCtx = { params: Promise<{ id: string; name: string }> };

type PodMetrics = {
  cpuMillicores: number;
  memoryMiB: number;
  podName: string;
};

function parseCpu(cpuStr: string): number {
  if (cpuStr.endsWith('n')) return parseInt(cpuStr) / 1_000_000;
  if (cpuStr.endsWith('u')) return parseInt(cpuStr) / 1_000;
  if (cpuStr.endsWith('m')) return parseInt(cpuStr);
  return parseFloat(cpuStr) * 1000;
}

function parseMemory(memStr: string): number {
  if (memStr.endsWith('Ki')) return parseInt(memStr) / 1024;
  if (memStr.endsWith('Mi')) return parseInt(memStr);
  if (memStr.endsWith('Gi')) return parseFloat(memStr) * 1024;
  if (memStr.endsWith('k') || memStr.endsWith('K')) return parseInt(memStr) / 1024;
  return parseInt(memStr) / (1024 * 1024);
}

export async function GET(_req: Request, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id, name } = await params;
  const db = await createServiceClient();

  const { data: project } = await db
    .from('projects')
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
  const customObjects = kubeConfig.makeApiClient(CustomObjectsApi);

  try {
    // List pods for the service
    const { items: pods } = await core.listNamespacedPod({
      namespace,
      labelSelector: `app=${service.name}`,
    });

    if (!pods || pods.length === 0) {
      return NextResponse.json({ metrics: null, replicas: 0, message: 'No pods found' });
    }

    // Aggregate metrics across all pods
    const podMetrics: PodMetrics[] = [];

    await Promise.all(pods.map(async pod => {
      const podName = pod.metadata?.name;
      if (!podName) return;
      try {
        const metrics = await customObjects.getNamespacedCustomObject({
          group: 'metrics.k8s.io',
          version: 'v1beta1',
          namespace,
          plural: 'pods',
          name: podName,
        });
        const body = metrics as { containers?: Array<{ usage?: { cpu?: string; memory?: string } }> };
        let cpuTotal = 0, memTotal = 0;
        for (const container of body.containers ?? []) {
          if (container.usage?.cpu) cpuTotal += parseCpu(container.usage.cpu);
          if (container.usage?.memory) memTotal += parseMemory(container.usage.memory);
        }
        podMetrics.push({ cpuMillicores: cpuTotal, memoryMiB: memTotal, podName });
      } catch {
        // metrics-server may not be installed; return null gracefully
      }
    }));

    const totalCpu = podMetrics.reduce((sum, m) => sum + m.cpuMillicores, 0);
    const totalMem = podMetrics.reduce((sum, m) => sum + m.memoryMiB, 0);

    return NextResponse.json({
      metrics: podMetrics.length > 0
        ? { cpuMillicores: Math.round(totalCpu), memoryMiB: Math.round(totalMem * 10) / 10 }
        : null,
      replicas: pods.length,
      podNames: pods.map(p => p.metadata?.name).filter(Boolean),
      message: podMetrics.length === 0 ? 'Metrics server not available' : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ metrics: null, replicas: 0, message: `Failed to fetch metrics: ${message}` });
  }
}
