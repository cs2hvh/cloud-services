'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Loader2,
  Lock,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchAuthenticatedApi } from '@/lib/ai/client-api';
import { toast } from 'sonner';

const workflowStages = [
  {
    id: '01',
    title: 'Create source',
    description: 'Define the retrieval workspace and initial metadata.',
  },
  {
    id: '02',
    title: 'Upload content',
    description: 'Add product docs, SOPs, PDFs, and reference material.',
  },
  {
    id: '03',
    title: 'Attach to agents',
    description: 'Enable grounded responses in one or more deployed agents.',
  },
] as const;

export default function NewKnowledgeBasePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const descriptionPreview =
    trimmedDescription.length > 120 ? `${trimmedDescription.slice(0, 117)}...` : trimmedDescription;

  const handleCreate = async () => {
    if (!trimmedName) {
      toast.error('Please enter a name');
      return;
    }

    setCreating(true);
    try {
      const res = await fetchAuthenticatedApi('/api/knowledge-bases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create');
      }

      toast.success('Knowledge base created!');
      router.push(`/dashboard/services/ai-agents/knowledge-bases/${data.data.id}`);
    } catch (err) {
      console.error('Failed to create:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create knowledge base');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link
              href="/dashboard/services/ai-agents/knowledge-bases"
              className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to knowledge base inventory
            </Link>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              AI Retrieval
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Create a knowledge base for grounded agent responses.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Start with a reusable name and purpose. Documents, embeddings, and agent assignments can be added immediately after creation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Setup
              </div>
              <div className="mt-1.5 text-lg font-semibold text-white">Single-step</div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Visibility
              </div>
              <div className="mt-1.5 text-lg font-semibold text-white">Workspace private</div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {workflowStages.map((stage, index) => {
              const isCurrent = index === 0;
              return (
                <div
                  key={stage.id}
                  className={
                    (isCurrent
                      ? 'border border-blue-400/30 bg-blue-500/10 '
                      : 'border border-white/[0.08] bg-white/[0.03] ') +
                    'px-3 py-3'
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={
                        'flex h-8 w-8 items-center justify-center border bg-white/[0.05] text-sm font-semibold ' +
                        (isCurrent
                          ? 'border-blue-400/30 text-blue-300'
                          : 'border-white/[0.10] text-white/78')
                      }
                    >
                      {isCurrent ? <span className="h-2 w-2 rounded-full bg-emerald-400" /> : stage.id}
                    </div>
                    <span className="text-xs font-semibold text-white/32">{stage.id}</span>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-white">{stage.title}</div>
                  <p className="mt-1 text-xs leading-5 text-white/40">{stage.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="glass-panel overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
                Base Details
              </p>
              <h3 className="text-xl font-semibold tracking-tight text-white">
                Knowledge Base Details
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-white/55">
                Define the retrieval source your agents will search when they need grounded context from documents and reference material.
              </p>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-6">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="name" className="text-sm font-medium text-white">
                      Name
                    </Label>
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-white/35">
                      Required
                    </span>
                  </div>
                  <Input
                    id="name"
                    placeholder="e.g., Product Documentation"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 border-white/[0.12] bg-white/[0.04] text-white placeholder:text-white/34 focus:border-blue-400/40 focus:ring-0"
                  />
                  <p className="text-xs leading-5 text-white/42">
                    Use a durable name that maps to the document set, not a single agent or model version.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="description" className="text-sm font-medium text-white">
                      Description
                    </Label>
                    <span className="text-xs font-medium text-white/35">{description.length} characters</span>
                  </div>
                  <Textarea
                    id="description"
                    placeholder="Summarize the documents, owners, or business domain this knowledge base will cover."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[140px] border-white/[0.12] bg-white/[0.04] text-white placeholder:text-white/34 focus:border-blue-400/40 focus:ring-0"
                  />
                  <p className="text-xs leading-5 text-white/42">
                    This description helps operators quickly understand what content belongs here before attaching it to agents.
                  </p>
                </div>
              </div>

              <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                  Recommended
                </div>
                <h3 className="mt-3 text-sm font-semibold text-white">Structure this source for reuse</h3>
                <p className="mt-2 text-sm leading-6 text-white/46">
                  A well-named knowledge base can support multiple agents, teams, and document upload cycles without needing to be recreated.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center border border-white/[0.08] bg-white/[0.04]">
                      <Image src="/dashboard icons/documents .png" alt="" width={16} height={16} className="opacity-75" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Upload documents after creation</div>
                      <p className="mt-1 text-xs leading-5 text-white/42">
                        Add PDFs, product docs, runbooks, and reference files once the base is provisioned.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center border border-white/[0.08] bg-white/[0.04]">
                      <Image src="/dashboard icons/agents .png" alt="" width={16} height={16} className="opacity-75" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Attach to one or more agents</div>
                      <p className="mt-1 text-xs leading-5 text-white/42">
                        Retrieval stays optional and can be enabled only where grounded responses are required.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center border border-white/[0.08] bg-white/[0.04] text-blue-300">
                      <Lock className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Keep ownership clear</div>
                      <p className="mt-1 text-xs leading-5 text-white/42">
                        Treat this as a managed workspace asset that remains private to your environment by default.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between border-t border-white/[0.06] px-5 py-4 sm:px-6">
            <Button
              variant="outline"
              asChild
              className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
            >
              <Link href="/dashboard/services/ai-agents/knowledge-bases">Cancel</Link>
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !trimmedName}
              className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Image src="/dashboard icons/knowledge base .png" alt="" width={16} height={16} className="opacity-80 mr-2" />
                  Create Knowledge Base
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-none border border-white/[0.1] bg-[linear-gradient(180deg,rgba(18,24,37,0.98),rgba(8,11,18,0.98))] shadow-[0_24px_56px_rgba(2,6,20,0.38)] backdrop-blur-2xl xl:sticky xl:top-8">
          <div className="rounded-none border-b border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Creation Summary
            </div>
          </div>
          <div className="space-y-3 overflow-y-auto px-4 py-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0))]">
            {trimmedName && (
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-2.5">
                <div className="text-sm font-medium text-white/50">Name</div>
                <div className="max-w-[62%] text-right text-sm font-semibold text-white">{trimmedName}</div>
              </div>
            )}

            {trimmedDescription && (
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-2.5">
                <div className="text-sm font-medium text-white/50">Description</div>
                <div className="max-w-[62%] text-right text-sm font-semibold text-white">{descriptionPreview}</div>
              </div>
            )}

            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-2.5">
              <div className="text-sm font-medium text-white/50">Document uploads</div>
              <div className="text-right text-sm font-semibold text-white">After creation</div>
            </div>

            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-2.5">
              <div className="text-sm font-medium text-white/50">Agent attachment</div>
              <div className="text-right text-sm font-semibold text-white">Optional</div>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="text-sm font-medium text-white/50">Access scope</div>
              <div className="text-right text-sm font-semibold text-white">Workspace private</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


