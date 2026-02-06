'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { createClient } from '@/lib/supabase/client';
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

  const supabase = createClient();

  const loadKnowledgeBases = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch('/api/knowledge-bases', {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async () => {
    if (!deleteKb) return;

    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(`/api/knowledge-bases/${deleteKb.id}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Knowledge Bases</h1>
          <p className="text-slate-400 mt-2">
            Manage document collections for your AI agents
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadKnowledgeBases} variant="outline" disabled={loading}>
            <RotateCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/services/ai-agents/knowledge-bases/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Knowledge Base
            </Link>
          </Button>
        </div>
      </div>

      {/* Knowledge Bases List */}
      <div className="space-y-4">
        {loading ? (
          <Card className="bg-slate-900/30 border-slate-800">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-slate-400">Loading knowledge bases...</div>
            </CardContent>
          </Card>
        ) : knowledgeBases.length > 0 ? (
          knowledgeBases.map((kb) => (
            <Card
              key={kb.id}
              className="bg-slate-900/30 border-slate-800 hover:border-slate-700 transition-colors"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
                      <Database className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-white">{kb.name}</h3>
                      {kb.description && (
                        <p className="text-sm text-slate-400">{kb.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {kb.document_count} documents
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {kb.chunk_count} chunks
                        </Badge>
                        <span className="text-xs text-slate-500">
                          Created {new Date(kb.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/services/ai-agents/knowledge-bases/${kb.id}`}>
                        <FileText className="h-4 w-4 mr-2" />
                        Documents
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/services/ai-agents/knowledge-bases/${kb.id}`}>
                            <Settings className="h-4 w-4 mr-2" />
                            Manage
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400 focus:text-red-400"
                          onClick={() => setDeleteKb(kb)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="bg-slate-900/30 border-slate-800">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="h-12 w-12 text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">No knowledge bases yet</h3>
              <p className="text-slate-400 mb-4 max-w-md">
                Create a knowledge base to store documents that your AI agents can search and
                reference.
              </p>
              <Button asChild>
                <Link href="/dashboard/services/ai-agents/knowledge-bases/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Knowledge Base
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteKb} onOpenChange={() => setDeleteKb(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Base</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteKb?.name}&quot;? This will delete all
              documents and embeddings. Agents using this knowledge base will lose access to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
