'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Database,
  Plus,
  RotateCw,
  MoreVertical,
  Trash2,
  FileText,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { fetchAuthenticatedApi } from '@/lib/ai/client-api';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  chunk_count: number;
  embedding_model: string;
  created_at: string;
}

export default function KnowledgeBasesPage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteKb, setDeleteKb] = useState<KnowledgeBase | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadKnowledgeBases = async () => {
    setLoading(true);
    try {
      const res = await fetchAuthenticatedApi('/api/knowledge-bases');

      if (!res.ok) {
        throw new Error('Failed to load knowledge bases');
      }

      const data = await res.json();
      setKnowledgeBases(data.data || []);
    } catch (err) {
      console.error('Failed to load knowledge bases:', err);
      toast.error('Failed to load knowledge bases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKnowledgeBases();
  }, []);

  const handleDelete = async () => {
    if (!deleteKb) return;

    setDeleting(true);
    try {
      const res = await fetchAuthenticatedApi(`/api/knowledge-bases/${deleteKb.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete');

      toast.success('Knowledge base deleted');
      setDeleteKb(null);
      await loadKnowledgeBases();
    } catch (err) {
      console.error('Failed to delete:', err);
      toast.error('Failed to delete knowledge base');
    } finally {
      setDeleting(false);
    }
  };
  const totalDocuments = knowledgeBases.reduce((sum, kb) => sum + kb.document_count, 0);
  const totalChunks = knowledgeBases.reduce((sum, kb) => sum + kb.chunk_count, 0);

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">AI Services</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Knowledge bases for grounded AI agent responses.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">Organize document collections, monitor chunk volume, and manage retrieval sources from a cleaner enterprise surface.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={loadKnowledgeBases} variant="outline" disabled={loading} className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]">
              <RotateCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button asChild className="border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
              <Link href="/dashboard/services/ai-agents/knowledge-bases/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Knowledge Base
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="glass-panel overflow-hidden"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Knowledge Bases</p><p className="mt-3 text-2xl font-semibold text-white">{knowledgeBases.length}</p><p className="mt-1 text-sm text-white/45">Provisioned retrieval sources</p></div><div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.05] text-blue-300"><Database className="h-4 w-4" /></div></div></CardContent></Card>
        <Card className="glass-panel overflow-hidden"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Documents</p><p className="mt-3 text-2xl font-semibold text-white">{totalDocuments}</p><p className="mt-1 text-sm text-white/45">Indexed source documents</p></div><div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.05] text-white/70"><FileText className="h-4 w-4" /></div></div></CardContent></Card>
        <Card className="glass-panel overflow-hidden"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Chunks</p><p className="mt-3 text-2xl font-semibold text-white">{totalChunks}</p><p className="mt-1 text-sm text-white/45">Retrieval-ready embeddings</p></div><div className="flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.05] text-purple-300"><Settings className="h-4 w-4" /></div></div></CardContent></Card>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-white">Knowledge Base Inventory</h2>
          <p className="text-sm text-white/45">Review document volume, chunking footprint, and management actions.</p>
        </div>
        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center border border-white/[0.08] bg-white/[0.03] py-16 text-sm text-white/45">Loading knowledge bases...</div>
          ) : knowledgeBases.length > 0 ? (
            <div className="space-y-4">
              {knowledgeBases.map((kb) => (
                <div key={kb.id} className="border border-white/[0.08] bg-white/[0.03] p-5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-purple-500/20 bg-purple-500/10 text-purple-300"><Database className="h-5 w-5" /></div>
                      <div className="min-w-0 space-y-3">
                        <h3 className="text-lg font-semibold text-white">{kb.name}</h3>
                        {kb.description && <p className="max-w-3xl text-sm leading-6 text-white/50">{kb.description}</p>}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">{kb.document_count} documents</span>
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">{kb.chunk_count} chunks</span>
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">Created {new Date(kb.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <Button variant="outline" size="sm" asChild className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]">
                        <Link href={`/dashboard/services/ai-agents/knowledge-bases/${kb.id}`}>
                          <FileText className="mr-2 h-4 w-4" />
                          Documents
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-white/60 hover:bg-white/[0.08] hover:text-white">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/services/ai-agents/knowledge-bases/${kb.id}`}>
                              <Settings className="mr-2 h-4 w-4" />
                              Manage
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={() => setDeleteKb(kb)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-16 text-center">
              <Database className="h-12 w-12 text-white/22" />
              <h3 className="mt-5 text-lg font-semibold text-white">No knowledge bases yet</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/45">Create a knowledge base to store documents that your agents can search, ground, and reference during conversations.</p>
              <Button asChild className="mt-6 border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
                <Link href="/dashboard/services/ai-agents/knowledge-bases/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Knowledge Base
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteKb} onOpenChange={() => setDeleteKb(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Base</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteKb?.name}&quot;? This will delete all documents and embeddings. Agents using this knowledge base will lose access to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
