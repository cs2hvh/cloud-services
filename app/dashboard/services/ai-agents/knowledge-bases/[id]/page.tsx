'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Loader2,
  Upload,
  FileText,
  Trash2,
  Save,
  File,
  CheckCircle,
  XCircle,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import { fetchAuthenticatedApi } from '@/lib/ai/client-api';
import { toast } from 'sonner';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  chunk_count: number;
  embedding_model: string;
  created_at: string;
}

interface Document {
  id: string;
  name: string;
  content_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  chunk_count: number;
  status: 'pending' | 'processing' | 'indexed' | 'error';
  error_message: string | null;
  created_at: string;
}

export default function KnowledgeBaseDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadKnowledgeBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadKnowledgeBase = async () => {
    setLoading(true);
    try {
      const [kbRes, docsRes] = await Promise.all([
        fetchAuthenticatedApi(`/api/knowledge-bases/${id}`),
        fetchAuthenticatedApi(`/api/knowledge-bases/${id}/documents`),
      ]);

      if (!kbRes.ok) {
        if (kbRes.status === 404) {
          toast.error('Knowledge base not found');
          router.push('/dashboard/services/ai-agents/knowledge-bases');
          return;
        }
        throw new Error('Failed to load');
      }

      const kbData = await kbRes.json();
      setKnowledgeBase(kbData.data);
      setName(kbData.data.name);
      setDescription(kbData.data.description || '');

      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setDocuments(docsData.data || []);
      }
    } catch (err) {
      console.error('Failed to load:', err);
      toast.error('Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetchAuthenticatedApi(`/api/knowledge-bases/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });

      if (!res.ok) throw new Error('Failed to save');

      toast.success('Knowledge base updated');
      await loadKnowledgeBase();
    } catch (err) {
      console.error('Failed to save:', err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetchAuthenticatedApi(`/api/knowledge-bases/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete');

      toast.success('Knowledge base deleted');
      router.push('/dashboard/services/ai-agents/knowledge-bases');
    } catch (err) {
      console.error('Failed to delete:', err);
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const totalFiles = files.length;
      let completed = 0;

      // Binary file types that need FormData upload
      const binaryExtensions = ['.pdf', '.docx', '.doc'];

      for (const file of Array.from(files)) {
        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        const isBinary = binaryExtensions.includes(ext);

        try {
          let res: Response;

          if (isBinary) {
            // Use FormData for binary files (PDF, DOCX)
            const formData = new FormData();
            formData.append('file', file);

            res = await fetchAuthenticatedApi(`/api/knowledge-bases/${id}/documents`, {
              method: 'POST',
              body: formData,
            });
          } else {
            // Use JSON for text-based files
            const content = await file.text();

            res = await fetchAuthenticatedApi(`/api/knowledge-bases/${id}/documents`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: file.name,
                source_type: 'file',
                content,
                content_type: file.type || 'text/plain',
              }),
            });
          }

          if (!res.ok) {
            const data = await res.json();
            toast.error(`Failed to upload ${file.name}: ${data.error || 'Unknown error'}`);
          } else {
            completed++;
            setUploadProgress((completed / totalFiles) * 100);
          }
        } catch (uploadErr) {
          console.error(`Error uploading ${file.name}:`, uploadErr);
          toast.error(`Failed to upload ${file.name}`);
        }
      }

      if (completed > 0) {
        toast.success(`Uploaded ${completed} of ${totalFiles} files`);
        await loadKnowledgeBase();
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'indexed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      default:
        return <File className="h-4 w-4 text-slate-400" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!knowledgeBase) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">Knowledge base not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/services/ai-agents/knowledge-bases">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">{knowledgeBase.name}</h1>
            <p className="text-slate-400 text-sm">
              {knowledgeBase.document_count} documents • {knowledgeBase.chunk_count} chunks
            </p>
          </div>
        </div>
      </div>

      {/* Settings */}
      <Card className="bg-slate-900/30 border-slate-800">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Update knowledge base details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-slate-800 border-slate-700 min-h-[80px]"
            />
          </div>

          <div className="flex justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Knowledge Base</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all documents and embeddings. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
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

            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload Documents */}
      <Card className="bg-slate-900/30 border-slate-800">
        <CardHeader>
          <CardTitle>Upload Documents</CardTitle>
          <CardDescription>
            Upload documents to add to the knowledge base. Supports PDF, Word, code files, and more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.pdf,.docx,.doc,.html,.htm,.json,.jsonl,.csv,.xml,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.hpp,.cs,.go,.rs,.rb,.php,.swift,.kt,.scala,.sql,.sh,.bash,.ps1,.yaml,.yml,.toml,.css,.scss,.vue,.svelte"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div
            className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-slate-600 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <div className="space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto" />
                <p className="text-slate-400">Uploading and processing...</p>
                <Progress value={uploadProgress} className="max-w-xs mx-auto" />
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-300 mb-2">Click to upload files</p>
                <p className="text-sm text-slate-500">
                  PDF, Word, Markdown, Code, JSON, CSV, HTML, and more (max 20MB for PDF, 5MB for others)
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card className="bg-slate-900/30 border-slate-800">
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            {documents.length} document{documents.length !== 1 ? 's' : ''} in this knowledge base
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(doc.status)}
                    <div>
                      <p className="text-white font-medium">{doc.name}</p>
                      <p className="text-sm text-slate-500">
                        {doc.file_size ? formatFileSize(doc.file_size) : 'Unknown size'} • {doc.chunk_count} chunks
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.storage_path && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-blue-400"
                        onClick={() => {
                          window.open(`/api/knowledge-bases/${id}/documents/${doc.id}/download`, '_blank');
                        }}
                        title="Download original file"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Badge
                      variant="outline"
                      className={
                        doc.status === 'indexed'
                          ? 'bg-green-500/10 text-green-400 border-green-500/30'
                          : doc.status === 'error'
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      }
                    >
                      {doc.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No documents yet</p>
              <p className="text-sm text-slate-500">Upload documents to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
