'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Image from 'next/image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  // Key,
  Plus,
  Trash2,
  Loader2,
  // CheckCircle,
  XCircle,
  // ArrowLeft,
  Eye,
  EyeOff,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchAIAgentApi } from '@/lib/ai/client-api';
import { toast } from 'sonner';

interface ModelKey {
  id: string;
  provider: string;
  name: string;
  api_key_preview: string;
  is_valid: boolean;
  created_at: string;
}

interface AgentApiKey {
  id: string;
  name: string;
  key_prefix: string;
  agent_id: string | null;
  is_active: boolean;
  request_count: number;
  last_used_at: string | null;
  created_at: string;
}

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', description: 'GPT-4, GPT-4o, Embeddings' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude 3 models' },
  { id: 'openrouter', name: 'OpenRouter', description: 'Access all models via one API' },
  { id: 'google', name: 'Google', description: 'Gemini models' },
  { id: 'mistral', name: 'Mistral AI', description: 'Mistral models' },
];

export default function AIAgentsSettingsPage() {
  const supabase = createClient();
  const [keys, setKeys] = useState<ModelKey[]>([]);
  const [agentApiKeys, setAgentApiKeys] = useState<AgentApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAgentKeys, setLoadingAgentKeys] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteKey, setDeleteKey] = useState<ModelKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  // New key form (Model Keys)
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState('openai');
  const [newKeyName, setNewKeyName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Agent API Keys
  const [showAddAgentKeyForm, setShowAddAgentKeyForm] = useState(false);
  const [newAgentKeyName, setNewAgentKeyName] = useState('');
  const [savingAgentKey, setSavingAgentKey] = useState(false);
  const [deleteAgentKey, setDeleteAgentKey] = useState<AgentApiKey | null>(null);
  const [deletingAgentKey, setDeletingAgentKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);

  useEffect(() => {
    loadKeys();
    loadAgentApiKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch('/api/ai-model-keys', {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (!res.ok) throw new Error('Failed to load keys');

      const data = await res.json();
      setKeys(data.data || []);
    } catch (err) {
      console.error('Failed to load keys:', err);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const loadAgentApiKeys = async () => {
    setLoadingAgentKeys(true);
    try {
      const res = await fetchAIAgentApi('/api/ai-agents/api-keys');

      if (!res.ok) throw new Error('Failed to load agent API keys');

      const data = await res.json();
      setAgentApiKeys(data.data || []);
    } catch (err) {
      console.error('Failed to load agent API keys:', err);
      toast.error('Failed to load agent API keys');
    } finally {
      setLoadingAgentKeys(false);
    }
  };

  const handleAddKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for this key');
      return;
    }
    if (!newApiKey.trim()) {
      toast.error('Please enter the API key');
      return;
    }

    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch('/api/ai-model-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          provider: newProvider,
          name: newKeyName.trim(),
          api_key: newApiKey.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add key');
      }

      toast.success('API key added successfully');
      setShowAddForm(false);
      setNewKeyName('');
      setNewApiKey('');
      await loadKeys();
    } catch (err) {
      console.error('Failed to add key:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to add key');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!deleteKey) return;

    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(`/api/ai-model-keys/${deleteKey.id}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (!res.ok) throw new Error('Failed to delete');

      toast.success('API key deleted');
      setDeleteKey(null);
      await loadKeys();
    } catch (err) {
      console.error('Failed to delete:', err);
      toast.error('Failed to delete key');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddAgentKey = async () => {
    if (!newAgentKeyName.trim()) {
      toast.error('Please enter a name for this key');
      return;
    }

    setSavingAgentKey(true);
    try {
      const res = await fetchAIAgentApi('/api/ai-agents/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newAgentKeyName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create key');
      }

      // Show the key to the user - this is the only time they'll see it!
      setNewlyCreatedKey(data.data.rawKey);
      setShowNewKeyDialog(true);
      setShowAddAgentKeyForm(false);
      setNewAgentKeyName('');
      await loadAgentApiKeys();
    } catch (err) {
      console.error('Failed to create agent API key:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setSavingAgentKey(false);
    }
  };

  const handleDeleteAgentKey = async () => {
    if (!deleteAgentKey) return;

    setDeletingAgentKey(true);
    try {
      const res = await fetchAIAgentApi(`/api/ai-agents/api-keys/${deleteAgentKey.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete');

      toast.success('Agent API key deleted');
      setDeleteAgentKey(null);
      await loadAgentApiKeys();
    } catch (err) {
      console.error('Failed to delete:', err);
      toast.error('Failed to delete key');
    } finally {
      setDeletingAgentKey(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const getProviderName = (providerId: string) => {
    return PROVIDERS.find((p) => p.id === providerId)?.name || providerId;
  };

  const validModelKeys = keys.filter((key) => key.is_valid).length;
  const activeAgentKeys = agentApiKeys.filter((key) => key.is_active).length;
  const totalAgentRequests = agentApiKeys.reduce((sum, key) => sum + key.request_count, 0);

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <div className="glass-panel overflow-hidden">
        <div className="h-px bg-gradient-to-r from-cyan-400/40 via-cyan-300/10 to-transparent" />
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/70">AI Services</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">AI agent access, provider keys, and API controls.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">Manage model provider credentials, issue endpoint keys, and share implementation guidance from a more operational settings surface.</p>
          </div>
          <div className="flex items-center gap-5">
            <Image src="/dashboard-services-icons/da ai aniamtion.png" alt="" width={72} height={72} className="shrink-0 opacity-80 hidden lg:block" />
            <Button variant="outline" asChild className="rounded-none border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]">
              <Link href="/dashboard/services/ai-agents">
                <Image src="/dashboard icons/settings _1.png" alt="" width={14} height={14} className="mr-2 opacity-70" />
                Back to agents
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="glass-panel p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Model Keys</p><p className="mt-3 text-2xl font-semibold text-white">{keys.length}</p><p className="mt-1 text-sm text-white/45">Saved provider credentials</p></div><Image src="/dashboard icons/model keys .png" alt="Model Keys" width={36} height={36} className="shrink-0 opacity-80" /></div></div>
        <div className="glass-panel p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Valid Keys</p><p className="mt-3 text-2xl font-semibold text-white">{validModelKeys}</p><p className="mt-1 text-sm text-white/45">Providers ready for agent deployment</p></div><Image src="/dashboard icons/valid keys .png" alt="Valid Keys" width={36} height={36} className="shrink-0 opacity-80" /></div></div>
        <div className="glass-panel p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Agent API Keys</p><p className="mt-3 text-2xl font-semibold text-white">{activeAgentKeys}</p><p className="mt-1 text-sm text-white/45">Active endpoint credentials - {totalAgentRequests} requests</p></div><Image src="/dashboard icons/agent api keys .png" alt="Agent API Keys" width={36} height={36} className="shrink-0 opacity-80" /></div></div>
      </div>

      {/* New Key Created Dialog */}
      <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
        <DialogContent className="glass-panel overflow-hidden border border-white/[0.08] bg-[#050816] text-white sm:max-w-md [&>button]:rounded-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image src="/dashboard icons/valid keys .png" alt="" width={18} height={18} className="opacity-90" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy your API key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border border-amber-500/20 bg-amber-500/10 p-3">
              <p className="text-sm text-yellow-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                This key will only be shown once. Store it securely.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={newlyCreatedKey || ''}
                className="rounded-none font-mono text-sm bg-white/[0.04] border-white/[0.1] text-white placeholder:text-white/35"
              />
              <Button
                variant="outline"
                size="icon"
                className="rounded-none shrink-0"
                onClick={() => newlyCreatedKey && copyToClipboard(newlyCreatedKey)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="w-full rounded-none border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
              onClick={() => {
                setShowNewKeyDialog(false);
                setNewlyCreatedKey(null);
              }}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="model-keys" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 rounded-none border border-white/[0.08] bg-white/[0.04] p-1 sm:w-fit">
          <TabsTrigger value="model-keys" className="rounded-none text-white/60 data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">
            <Image src="/dashboard icons/model keys .png" alt="" width={14} height={14} className="mr-1.5 opacity-70" />
            Model API Keys
          </TabsTrigger>
          <TabsTrigger value="agent-api-keys" className="rounded-none text-white/60 data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">
            <Image src="/dashboard icons/agent api keys .png" alt="" width={14} height={14} className="mr-1.5 opacity-70" />
            Agent API Keys
          </TabsTrigger>
        </TabsList>

        {/* Model API Keys Tab */}
        <TabsContent value="model-keys" className="space-y-6">
          <div className="glass-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Image src="/dashboard icons/model keys .png" alt="" width={18} height={18} className="opacity-80" />
                  Model API Keys
                </h3>
                <p className="mt-1 text-sm text-white/45">
                  Add API keys for different AI providers (OpenAI, Anthropic, etc.). Keys are encrypted at rest.
                </p>
              </div>
              {!showAddForm && (
                <Button onClick={() => setShowAddForm(true)} className="rounded-none border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Key
                </Button>
              )}
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              {/* Add Key Form */}
              {showAddForm && (
                <div className="border border-white/[0.08] bg-white/[0.03] p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Provider</Label>
                        <Select value={newProvider} onValueChange={setNewProvider}>
                          <SelectTrigger className="bg-white/[0.04] border-white/[0.1] text-white placeholder:text-white/35">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROVIDERS.map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="keyName">Key Name</Label>
                        <Input
                          id="keyName"
                          placeholder="e.g., Production Key"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          className="bg-white/[0.04] border-white/[0.1] text-white placeholder:text-white/35"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="apiKey">API Key</Label>
                      <div className="relative">
                        <Input
                          id="apiKey"
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="sk-..."
                          value={newApiKey}
                          onChange={(e) => setNewApiKey(e.target.value)}
                          className="bg-white/[0.04] border-white/[0.1] text-white placeholder:text-white/35 pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="rounded-none"
                        onClick={() => {
                          setShowAddForm(false);
                          setNewKeyName('');
                          setNewApiKey('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddKey} disabled={saving} className="rounded-none border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Image src="/dashboard icons/valid keys .png" alt="" width={14} height={14} className="mr-2 opacity-80" />
                            Add Key
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
              )}

              {/* Keys List */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-white/55" />
                </div>
              ) : keys.length > 0 ? (
                <div className="space-y-2">
                  {keys.map((key) => (
                    <div
                      key={key.id}
                      className="relative flex items-center justify-between p-4 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
                    >
                      <div className={`absolute left-0 top-0 h-full w-0.5 ${key.is_valid ? 'bg-emerald-500/50' : 'bg-red-500/40'}`} />
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/[0.06] border border-white/[0.08]">
                          <Image src="/dashboard icons/valid keys .png" alt="" width={16} height={16} className="opacity-75" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-medium">{key.name}</p>
                            <Badge variant="outline" className="rounded-none text-xs">
                              {getProviderName(key.provider)}
                            </Badge>
                          </div>
                          <p className="text-sm text-white/40 font-mono">{key.api_key_preview}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {key.is_valid ? (
                          <Badge className="rounded-none bg-green-500/20 text-green-400 border-green-500/30">
                            <Image src="/dashboard icons/healthy .png" alt="" width={10} height={10} className="mr-1 opacity-90" />
                            Valid
                          </Badge>
                        ) : (
                          <Badge className="rounded-none bg-red-500/20 text-red-400 border-red-500/30">
                            <XCircle className="h-3 w-3 mr-1" />
                            Invalid
                          </Badge>
                        )}

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-none text-red-400 hover:text-red-300"
                              onClick={() => setDeleteKey(key)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="[&>button]:rounded-none">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete &quot;{key.name}&quot;? Agents
                                using this key will no longer be able to access the {getProviderName(key.provider)} API.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-none">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDeleteKey}
                                disabled={deleting}
                                className="rounded-none bg-red-600 hover:bg-red-700 text-white"
                              >
                                {deleting ? 'Deleting...' : 'Delete'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Image src="/dashboard icons/model keys .png" alt="No keys" width={48} height={48} className="opacity-25 mx-auto mb-4" />
                  <p className="text-white/55 mb-2">No API keys configured</p>
                  <p className="text-sm text-white/40 mb-4">
                    Add an API key to start using AI models
                  </p>
                  {!showAddForm && (
                    <Button onClick={() => setShowAddForm(true)} className="rounded-none border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Key
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Image src="/dashboard icons/model.png" alt="" width={18} height={18} className="opacity-80" />
                Supported Providers
              </h3>
              <p className="mt-1 text-sm text-white/45">Get API keys from these providers to use their models</p>
            </div>
            <div className="p-5 sm:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                {PROVIDERS.map((provider) => (
                  <div key={provider.id} className="p-4 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                    <h3 className="font-medium text-white">{provider.name}</h3>
                    <p className="text-sm text-white/55 mt-1">{provider.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="agent-api-keys" className="space-y-5">
          <div className="glass-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Image src="/dashboard icons/agent api keys .png" alt="" width={20} height={20} className="opacity-80" />
                  Agent API Keys
                </h3>
                <p className="mt-1 text-sm text-white/45">
                  Create API keys to authenticate requests to your agent endpoints.
                  Use these when your agents require authentication.
                </p>
              </div>
              {!showAddAgentKeyForm && (
                <Button onClick={() => setShowAddAgentKeyForm(true)} className="rounded-none border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Key
                </Button>
              )}
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              {/* Info Box */}
              <div className="border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="text-sm text-blue-400">
                  Note: Agent API Keys are used in the <code className="bg-white/[0.08] px-1">x-api-key</code> header
                  when calling your agent&apos;s public endpoint. Enable &quot;Require API Key&quot; in your agent&apos;s
                  Access Control settings to require authentication.
                </p>
              </div>

              {/* Add Key Form */}
              {showAddAgentKeyForm && (
                <div className="border border-white/[0.08] bg-white/[0.03] p-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="agentKeyName">Key Name</Label>
                      <Input
                        id="agentKeyName"
                        placeholder="e.g., Production API Key, Mobile App Key"
                        value={newAgentKeyName}
                        onChange={(e) => setNewAgentKeyName(e.target.value)}
                        className="bg-white/[0.04] border-white/[0.1] text-white placeholder:text-white/35"
                      />
                      <p className="text-xs text-white/40">
                        Give this key a descriptive name so you can identify it later.
                      </p>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="rounded-none"
                        onClick={() => {
                          setShowAddAgentKeyForm(false);
                          setNewAgentKeyName('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddAgentKey} disabled={savingAgentKey} className="rounded-none border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
                        {savingAgentKey ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Image src="/dashboard icons/agent api keys .png" alt="" width={14} height={14} className="mr-2 opacity-80" />
                            Create Key
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
              )}

              {/* Keys List */}
              {loadingAgentKeys ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-white/55" />
                </div>
              ) : agentApiKeys.length > 0 ? (
                <div className="space-y-2">
                  {agentApiKeys.map((key) => (
                    <div
                      key={key.id}
                      className="relative flex items-center justify-between p-4 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
                    >
                      <div className={`absolute left-0 top-0 h-full w-0.5 ${key.is_active ? 'bg-emerald-500/50' : 'bg-red-500/40'}`} />
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/[0.06] border border-white/[0.08]">
                          <Image src="/dashboard icons/agent api keys .png" alt="" width={16} height={16} className="opacity-75" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-medium">{key.name}</p>
                            {key.is_active ? (
                              <Badge className="rounded-none bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                                Active
                              </Badge>
                            ) : (
                              <Badge className="rounded-none bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-white/40">
                            <span className="font-mono">{key.key_prefix}...</span>
                            <span>-</span>
                            <span>{key.request_count.toLocaleString()} requests</span>
                            {key.last_used_at && (
                              <>
                                <span>-</span>
                                <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-none text-red-400 hover:text-red-300"
                            onClick={() => setDeleteAgentKey(key)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="[&>button]:rounded-none">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &quot;{key.name}&quot;?
                              Any applications using this key will no longer be able to access your agents.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-none">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDeleteAgentKey}
                              disabled={deletingAgentKey}
                              className="rounded-none bg-red-600 hover:bg-red-700 text-white"
                            >
                              {deletingAgentKey ? 'Deleting...' : 'Delete'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Image src="/dashboard icons/agent api keys .png" alt="No keys" width={48} height={48} className="opacity-25 mx-auto mb-4" />
                  <p className="text-white/55 mb-2">No agent API keys</p>
                  <p className="text-sm text-white/40 mb-4">
                    Create an API key to authenticate requests to your agent endpoints
                  </p>
                  {!showAddAgentKeyForm && (
                    <Button onClick={() => setShowAddAgentKeyForm(true)} className="rounded-none border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Key
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* API Documentation */}
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Image src="/dashboard icons/configure.png" alt="" width={18} height={18} className="opacity-80" />
                API Documentation
              </h3>
              <p className="mt-1 text-sm text-white/45">Complete guide to using your agent&apos;s public API endpoint</p>
            </div>
            <div className="space-y-6 p-5 sm:p-6">
              {/* Endpoint URL */}
              <div>
                <h4 className="text-white font-medium mb-2">Endpoint URL</h4>
                <pre className="p-3 border border-white/[0.08] bg-black/30 text-sm overflow-x-auto">
                  <code className="text-blue-400">POST /api/v1/agents/&#123;endpoint_id&#125;/chat</code>
                </pre>
              </div>

              {/* Headers */}
              <div>
                <h4 className="text-white font-medium mb-2">Headers</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08]">
                        <th className="text-left py-2 text-white/55">Header</th>
                        <th className="text-left py-2 text-white/55">Required</th>
                        <th className="text-left py-2 text-white/55">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/75">
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-green-400">Content-Type</td>
                        <td className="py-2">Yes</td>
                        <td className="py-2">Must be <code className="bg-white/[0.08] px-1">application/json</code></td>
                      </tr>
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-green-400">x-api-key</td>
                        <td className="py-2">If auth required</td>
                        <td className="py-2">Your agent API key (starts with <code className="bg-white/[0.08] px-1">ak_</code>)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Request Body */}
              <div>
                <h4 className="text-white font-medium mb-2">Request Body</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08]">
                        <th className="text-left py-2 text-white/55">Field</th>
                        <th className="text-left py-2 text-white/55">Type</th>
                        <th className="text-left py-2 text-white/55">Required</th>
                        <th className="text-left py-2 text-white/55">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/75">
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-yellow-400">message</td>
                        <td className="py-2">string</td>
                        <td className="py-2">Yes</td>
                        <td className="py-2">User message (max 32KB)</td>
                      </tr>
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-yellow-400">conversation_id</td>
                        <td className="py-2">string</td>
                        <td className="py-2">No</td>
                        <td className="py-2">UUID to continue an existing conversation</td>
                      </tr>
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-yellow-400">stream</td>
                        <td className="py-2">boolean</td>
                        <td className="py-2">No</td>
                        <td className="py-2">Enable real-time streaming (default: false)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Standard vs Streaming */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Standard Response */}
                <div className="border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 bg-blue-500"></div>
                    <h5 className="text-white font-medium">Standard Response</h5>
                  </div>
                  <p className="text-sm text-white/55 mb-3">
                    Best for: Simple integrations, backend services, or when you need the complete response at once.
                  </p>
                  <pre className="p-3 border border-white/[0.08] bg-black/40 text-xs overflow-x-auto">
                    <code className="text-green-400">
{`// Request
{
  "message": "Hello!",
  "stream": false
}

// Response (JSON)
{
  "id": "conv-uuid",
  "conversation_id": "conv-uuid",
  "message": {
    "role": "assistant",
    "content": "Hi! How can I help?"
  },
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 10,
    "total_tokens": 60
  }
}`}
                    </code>
                  </pre>
                </div>

                {/* Streaming Response */}
                <div className="border border-purple-500/20 bg-purple-500/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 bg-purple-500 animate-pulse"></div>
                    <h5 className="text-white font-medium">Streaming Response</h5>
                    <Badge className="rounded-none bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                      Real-time
                    </Badge>
                  </div>
                  <p className="text-sm text-white/55 mb-3">
                    Best for: Chat UIs, real-time apps. Words appear as they&apos;re generated for better UX.
                  </p>
                  <pre className="p-3 border border-white/[0.08] bg-black/40 text-xs overflow-x-auto">
                    <code className="text-purple-400">
{`// Request
{
  "message": "Hello!",
  "stream": true
}

// Response (SSE Events)
data: {"type":"start","conversation_id":"uuid"}

data: {"type":"content","content":"Hi"}

data: {"type":"content","content":"!"}

data: {"type":"content","content":" How"}

data: {"type":"done","usage":{...}}`}
                    </code>
                  </pre>
                </div>
              </div>

              {/* Code Examples */}
              <div>
                <h4 className="text-white font-medium mb-3">Code Examples</h4>
                <Tabs defaultValue="curl" className="w-full">
                  <TabsList className="rounded-none border border-white/[0.08] bg-white/[0.04] p-1">
                    <TabsTrigger value="curl" className="rounded-none text-white/60 data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">cURL</TabsTrigger>
                    <TabsTrigger value="javascript" className="rounded-none text-white/60 data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">JavaScript</TabsTrigger>
                    <TabsTrigger value="python" className="rounded-none text-white/60 data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">Python</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="curl" className="mt-3">
                    <pre className="p-4 border border-white/[0.08] bg-black/30 text-sm overflow-x-auto">
                      <code className="text-green-400">
{`# Standard request
curl -X POST \\
  "https://your-domain.com/api/v1/agents/{endpoint_id}/chat" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ak_your_key_here" \\
  -d '{"message": "Hello!"}'

# Streaming request
curl -N -X POST \\
  "https://your-domain.com/api/v1/agents/{endpoint_id}/chat" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ak_your_key_here" \\
  -d '{"message": "Hello!", "stream": true}'`}
                      </code>
                    </pre>
                  </TabsContent>
                  
                  <TabsContent value="javascript" className="mt-3">
                    <pre className="p-4 border border-white/[0.08] bg-black/30 text-sm overflow-x-auto">
                      <code className="text-yellow-400">
{`// Standard request
const response = await fetch(
  '/api/v1/agents/{endpoint_id}/chat',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'ak_your_key_here'
    },
    body: JSON.stringify({ message: 'Hello!' })
  }
);
const data = await response.json();
console.log(data.message.content);

// Streaming request
const response = await fetch(
  '/api/v1/agents/{endpoint_id}/chat',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'ak_your_key_here'
    },
    body: JSON.stringify({ 
      message: 'Hello!', 
      stream: true 
    })
  }
);

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  const lines = text.split('\\n\\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      if (event.type === 'content') {
        process.stdout.write(event.content);
      }
    }
  }
}`}
                      </code>
                    </pre>
                  </TabsContent>
                  
                  <TabsContent value="python" className="mt-3">
                    <pre className="p-4 border border-white/[0.08] bg-black/30 text-sm overflow-x-auto">
                      <code className="text-blue-400">
{`import requests
import json

API_URL = "https://your-domain.com/api/v1/agents/{endpoint_id}/chat"
API_KEY = "ak_your_key_here"

# Standard request
response = requests.post(
    API_URL,
    headers={
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    },
    json={"message": "Hello!"}
)
data = response.json()
print(data["message"]["content"])

# Streaming request
response = requests.post(
    API_URL,
    headers={
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    },
    json={"message": "Hello!", "stream": True},
    stream=True
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            event = json.loads(line[6:])
            if event["type"] == "content":
                print(event["content"], end="", flush=True)`}
                      </code>
                    </pre>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Streaming Events Reference */}
              <div>
                <h4 className="text-white font-medium mb-2">Streaming Event Types</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08]">
                        <th className="text-left py-2 text-white/55">Event Type</th>
                        <th className="text-left py-2 text-white/55">Description</th>
                        <th className="text-left py-2 text-white/55">Fields</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/75">
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-green-400">start</td>
                        <td className="py-2">Stream initialized</td>
                        <td className="py-2"><code className="bg-white/[0.08] px-1 rounded">conversation_id</code></td>
                      </tr>
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-purple-400">content</td>
                        <td className="py-2">Text chunk received</td>
                        <td className="py-2"><code className="bg-white/[0.08] px-1 rounded">content</code> (string)</td>
                      </tr>
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-red-400">error</td>
                        <td className="py-2">Error occurred</td>
                        <td className="py-2"><code className="bg-white/[0.08] px-1 rounded">error</code> (message)</td>
                      </tr>
                      <tr className="border-b border-white/[0.08]">
                        <td className="py-2 font-mono text-blue-400">done</td>
                        <td className="py-2">Stream complete</td>
                        <td className="py-2"><code className="bg-white/[0.08] px-1 rounded">conversation_id</code>, <code className="bg-white/[0.08] px-1 rounded">usage</code></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
