'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TemplateBuilder, type BuilderData } from '@/components/templates/template-builder';
import type { TemplateSpec } from '@/lib/templates/domain/spec-schema';

type DbTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  schema: TemplateSpec;
  active: boolean;
};

export default function EditTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<DbTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/developer/templates/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => { if (d) setTemplate(d.template ?? null); })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(data: BuilderData & { publish: boolean }) {
    const res = await fetch(`/api/developer/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        tags: data.tags,
        spec: data.spec,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Failed to save template');
    }

    if (data.publish && template && !template.active) {
      const pubRes = await fetch(`/api/developer/templates/${id}/publish`, { method: 'POST' });
      if (!pubRes.ok) {
        const pubErr = await pubRes.json().catch(() => ({}));
        throw new Error(pubErr.error ?? 'Template saved but could not be published — run a test first');
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

  if (notFound || !template) {
    return (
      <div className="flex-1 bg-black min-h-screen flex flex-col items-center justify-center gap-4 text-white">
        <p className="text-white/50">Template not found or you don&apos;t have access.</p>
        <button
          onClick={() => router.push('/dashboard/templates?tab=mine')}
          className="text-xs text-white/40 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
        >
          ← Back to My Templates
        </button>
      </div>
    );
  }

  return (
    <TemplateBuilder
      mode="edit"
      initialData={{
        slug: template.slug,
        name: template.name,
        description: template.description,
        tags: template.tags,
        spec: template.schema,
      }}
      onSave={handleSave}
      onCancel={() => router.push('/dashboard/templates?tab=mine')}
    />
  );
}
