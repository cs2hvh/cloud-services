'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { TemplateBuilder, type BuilderData } from '@/components/templates/template-builder';
import type { TemplateServiceSpec } from '@/lib/templates/domain/spec-schema';

type RawService = {
  service_name: string;
  service_type: string;
  engine: string;
  image: string;
  volumes: { name: string; mountPath: string; sizeGb: number; backupPolicy?: 'none' | 'daily' | 'weekly' }[] | null;
  ports?: { internal: number; public?: boolean; protocol?: 'tcp' | 'udp' | 'http'; name?: string }[] | null;
  config: { dependsOn?: string[]; healthCheck?: TemplateServiceSpec['healthCheck']; scaling?: TemplateServiceSpec['scaling'] } | null;
};

function toSpecService(raw: RawService): TemplateServiceSpec {
  const type = raw.service_type as TemplateServiceSpec['type'];
  const engine = raw.engine as TemplateServiceSpec['engine'];
  const ports = raw.ports?.length ? raw.ports : defaultPorts(type, engine);
  return {
    id: raw.service_name,
    name: raw.service_name,
    type,
    engine,
    source: { kind: 'image', image: raw.image, pinDigest: true },
    dependsOn: raw.config?.dependsOn ?? [],
    env: {},
    ports,
    volumes: (raw.volumes ?? []).map(v => ({ ...v, backupPolicy: v.backupPolicy ?? 'none' })),
    healthCheck: raw.config?.healthCheck ?? {
      type: type === 'web' ? 'http' : 'tcp',
      port: ports[0]?.internal ?? 3000,
      path: type === 'web' ? '/' : undefined,
    },
    scaling: raw.config?.scaling,
    resources: {},
  };
}

function defaultPorts(type: TemplateServiceSpec['type'], engine: TemplateServiceSpec['engine']) {
  if (engine === 'postgres') return [{ internal: 5432, public: false, protocol: 'tcp' as const }];
  if (engine === 'mysql') return [{ internal: 3306, public: false, protocol: 'tcp' as const }];
  if (engine === 'mongodb') return [{ internal: 27017, public: false, protocol: 'tcp' as const }];
  if (engine === 'redis' || engine === 'valkey') return [{ internal: 6379, public: false, protocol: 'tcp' as const }];
  if (engine === 'rabbitmq') return [{ internal: 5672, public: false, protocol: 'tcp' as const }];
  return [{ internal: type === 'worker' ? 8080 : 3000, public: type === 'web', protocol: type === 'web' ? 'http' as const : 'tcp' as const }];
}

function NewTemplateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromProject = searchParams.get('fromProject');

  const [prefill, setPrefill] = useState<Partial<BuilderData> | null>(null);
  const [loading, setLoading] = useState(!!fromProject);

  useEffect(() => {
    if (!fromProject) { setPrefill({}); return; }
    fetch(`/api/instances/${fromProject}`)
      .then(r => r.json())
      .then(({ instance }) => {
        if (!instance) { setPrefill({}); return; }
        const svcs: RawService[] = instance.template_instance_services ?? [];
        setPrefill({
          name: instance.project_name,
          description: `${instance.project_name} stack`,
          tags: [],
          spec: {
            schemaVersion: 1,
            kind: svcs.length > 1 ? 'multi' : 'single',
            services: svcs.map(toSpecService),
            inputs: {},
          },
        });
      })
      .catch(() => setPrefill({}))
      .finally(() => setLoading(false));
  }, [fromProject]);

  async function handleSave(data: BuilderData & { publish: boolean }) {
    const res = await fetch('/api/developer/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: data.slug,
        name: data.name,
        description: data.description,
        readme: data.readme,
        category: data.category,
        tags: data.tags,
        spec: data.spec,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Failed to create template');
    }

    const { id } = await res.json();
    if (data.publish) {
      const pubRes = await fetch(`/api/developer/templates/${id}/publish`, { method: 'POST' });
      if (!pubRes.ok) {
        const pubErr = await pubRes.json().catch(() => ({}));
        throw new Error(pubErr.error ?? 'Template created but publish failed — run a test first');
      }
    }
    router.push('/dashboard/templates?tab=mine');
  }

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  return (
    <TemplateBuilder
      mode="create"
      initialData={prefill ?? undefined}
      onSave={handleSave}
      onCancel={() => router.push('/dashboard/templates?tab=mine')}
    />
  );
}

export default function NewTemplatePage() {
  return (
    <Suspense fallback={
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    }>
      <NewTemplateInner />
    </Suspense>
  );
}
