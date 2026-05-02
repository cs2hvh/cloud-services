'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  Save,
  Loader2,
  Copy,
  Trash2,
  ArrowLeft,
  MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchAIAgentApi, fetchAuthenticatedApi } from '@/lib/ai/client-api';
import { toast } from 'sonner';

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model_id: string;
  model_key_id: string | null;
  system_prompt: string;
  status: 'active' | 'paused' | 'deleted';
  endpoint_id: string;
  knowledge_base_ids: string[];
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

interface UsageStats {
  total_messages: number;
  total_conversations: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
}

interface ModelKey {
  id: string;
  name: string;
  provider: string;
  is_valid: boolean;
}

// Platform Model type from API
interface PlatformModel {
  id: string;
  name: string;
  provider: string;
  description: string | null;
  pricing: {
    input: number;
    output: number;
    inputFormatted: string;
    outputFormatted: string;
  };
  contextWindow: number;
  capabilities: {
    vision: boolean;
    functionCalling: boolean;
    streaming: boolean;
  };
  isFree: boolean;
}

export default function AgentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [modelKeys, setModelKeys] = useState<ModelKey[]>([]);
  const [platformModels, setPlatformModels] = useState<PlatformModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('');
  const [modelKeyId, setModelKeyId] = useState<string | null>(null);
  const [usePlatformBilling, setUsePlatformBilling] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | null>(null);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  
  // Access control
  const [isPublic, setIsPublic] = useState(true);
  const [requireAuth, setRequireAuth] = useState(false);
  const [allowedOrigins, setAllowedOrigins] = useState('');
  const [rateLimitRpm, setRateLimitRpm] = useState(60);

  useEffect(() => {
    loadAgent();
    loadKnowledgeBases();
    loadModelKeys();
    loadPlatformModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadAgent = async () => {
    setLoading(true);
    try {
      const [agentRes, statsRes] = await Promise.all([
        fetchAIAgentApi(`/api/ai-agents/${id}`),
        fetchAIAgentApi(`/api/ai-agents/${id}/stats`),
      ]);

      if (!agentRes.ok) {
        if (agentRes.status === 404) {
          toast.error('Agent not found');
          router.push('/dashboard/services/ai-agents');
          return;
        }
        throw new Error('Failed to load agent');
      }

      const agentData = await agentRes.json();
      const agentInfo = agentData.data;
      setAgent(agentInfo);

      // Populate form
      setName(agentInfo.name);
      setDescription(agentInfo.description || '');
      setModel(agentInfo.model_id);
      setSystemPrompt(agentInfo.system_prompt);
      setIsActive(agentInfo.status === 'active');
      setKnowledgeBaseId(agentInfo.knowledge_base_ids?.[0] || null);
      setRagEnabled(agentInfo.rag_enabled || false);
      setModelKeyId(agentInfo.model_key_id || null);
      setUsePlatformBilling(agentInfo.use_platform_billing ?? true);
      setTemperature(agentInfo.temperature);
      setMaxTokens(agentInfo.max_tokens);
      
      // Access control
      setIsPublic(agentInfo.is_public ?? true);
      setRequireAuth(agentInfo.require_auth ?? false);
      setAllowedOrigins((agentInfo.allowed_origins || []).join(', '));
      setRateLimitRpm(agentInfo.rate_limit_rpm || 60);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        // Map API response to UsageStats interface
        const totals = statsData.data?.totals;
        if (totals) {
          setStats({
            total_messages: totals.requests || 0,
            total_conversations: totals.conversations || 0,
            total_input_tokens: totals.prompt_tokens || 0,
            total_output_tokens: totals.completion_tokens || 0,
            total_cost: parseFloat(totals.estimated_cost || '0'),
          });
        }
      }
    } catch (err) {
      console.error('Failed to load agent:', err);
      toast.error('Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  const loadKnowledgeBases = async () => {
    try {
      const res = await fetchAuthenticatedApi('/api/knowledge-bases');
      if (res.ok) {
        const data = await res.json();
        setKnowledgeBases(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load knowledge bases:', err);
    }
  };

  const loadModelKeys = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const headers: HeadersInit = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch('/api/ai-model-keys', { headers });
      if (res.ok) {
        const data = await res.json();
        setModelKeys(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load model keys:', err);
    }
  };

  const loadPlatformModels = async () => {
    try {
      const res = await fetchAIAgentApi('/api/ai-agents/platform-models');
      if (res.ok) {
        const data = await res.json();
        setPlatformModels(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load platform models:', err);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!systemPrompt.trim()) {
      toast.error('System prompt is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetchAIAgentApi(`/api/ai-agents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          model_id: model,
          model_key_id: usePlatformBilling ? null : modelKeyId,
          use_platform_billing: usePlatformBilling,
          system_prompt: systemPrompt.trim(),
          status: isActive ? 'active' : 'paused',
          knowledge_base_ids: knowledgeBaseId ? [knowledgeBaseId] : [],
          rag_enabled: ragEnabled && !!knowledgeBaseId,
          temperature,
          max_tokens: maxTokens,
          // Access control
          is_public: isPublic,
          require_auth: requireAuth,
          allowed_origins: allowedOrigins.split(',').map(o => o.trim()).filter(Boolean),
          rate_limit_rpm: rateLimitRpm,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success('Agent updated successfully');
      await loadAgent();
    } catch (err) {
      console.error('Failed to save agent:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetchAIAgentApi(`/api/ai-agents/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete');

      toast.success('Agent deleted');
      router.push('/dashboard/services/ai-agents');
    } catch (err) {
      console.error('Failed to delete agent:', err);
      toast.error('Failed to delete agent');
    } finally {
      setDeleting(false);
    }
  };

  const copyEndpoint = async () => {
    if (!agent) return;
    const url = `${window.location.origin}/api/v1/agents/${agent.endpoint_id}/chat`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Endpoint URL copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const getRequestExampleCurl = () => {
    if (!agent) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `curl -X POST \\
  "${origin}/api/v1/agents/${agent.endpoint_id}/chat" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hello, how can you help me?",
    "conversation_id": "optional-conversation-id"
  }'`;
  };

  const copyRequestExample = async () => {
    if (!agent) return;
    try {
      await navigator.clipboard.writeText(getRequestExampleCurl());
      toast.success('cURL example copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">Agent not found</p>
      </div>
    );
  }

  // const selectedModel = platformModels.find((m) => m.id === model);

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      {/* Header */}
      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/dashboard/services/ai-agents" className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to agents
            </Link>
            <h1 className="mt-4 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {agent.name}
              <Badge className={isActive ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/[0.05] text-white/60'}>
                {isActive ? 'Active' : 'Disabled'}
              </Badge>
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/50">{agent.description || 'No description'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={copyEndpoint} className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]">
              <Copy className="h-4 w-4 mr-2" />
              Copy Endpoint
            </Button>
            <Button asChild className="border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
              <Link href={`/dashboard/services/ai-agents/${id}/playground`}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Playground
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="glass-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Messages</p>
                <p className="mt-3 text-2xl font-semibold text-white">{stats.total_messages}</p>
              </div>
              <Image src="/dashboard-icons/messages.png" alt="Messages" width={32} height={32} className="shrink-0 opacity-80"  unoptimized />
            </div>
          </div>
          <div className="glass-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Conversations</p>
                <p className="mt-3 text-2xl font-semibold text-white">{stats.total_conversations}</p>
              </div>
              <Image src="/dashboard-icons/agents.png" alt="Conversations" width={32} height={32} className="shrink-0 opacity-80"  unoptimized />
            </div>
          </div>
          <div className="glass-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Tokens Used</p>
                <p className="mt-3 text-2xl font-semibold text-white">{(stats.total_input_tokens + stats.total_output_tokens).toLocaleString()}</p>
              </div>
              <Image src="/dashboard-icons/model.png" alt="Tokens" width={32} height={32} className="shrink-0 opacity-80"  unoptimized />
            </div>
          </div>
          <div className="glass-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Total Cost</p>
                <p className="mt-3 text-2xl font-semibold text-white">${stats.total_cost.toFixed(4)}</p>
              </div>
              <Image src="/dashboard-icons/agent-api-keys.png" alt="Cost" width={32} height={32} className="shrink-0 opacity-80"  unoptimized />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="settings" className="space-y-5">
        <TabsList className="grid grid-cols-2 border border-white/[0.08] bg-white/[0.04] p-1 sm:w-fit">
          <TabsTrigger value="settings" className="text-white/60 data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">Settings</TabsTrigger>
          <TabsTrigger value="api" className="text-white/60 data-[state=active]:bg-blue-500/90 data-[state=active]:text-white">API</TabsTrigger>
        </TabsList>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-5">
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white">Basic Settings</h3>
              <p className="mt-1 text-sm text-white/45">Configure your agent&apos;s basic information</p>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Agent Status</Label>
                  <p className="text-sm text-white/45">Enable or disable the agent endpoint</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.1] text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.1] text-white"
                />
              </div>
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white">Model Configuration</h3>
              <p className="mt-1 text-sm text-white/45">Choose the AI model and parameters</p>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              {/* Platform Billing Toggle */}
              <div className="flex items-center justify-between border border-white/[0.08] bg-white/[0.03] p-3">
                <div>
                  <p className="font-medium text-white">Use Platform Models</p>
                  <p className="text-sm text-white/45">
                    Pay per token usage. No API key needed.
                  </p>
                </div>
                <Switch 
                  checked={usePlatformBilling} 
                  onCheckedChange={(checked) => {
                    setUsePlatformBilling(checked);
                    if (checked) {
                      setModelKeyId(null);
                      // Reset to first platform model if current model not in platform list
                      const platformModelIds = platformModels.map(m => m.id);
                      if (!platformModelIds.includes(model) && platformModels.length > 0) {
                        setModel(platformModels[0].id);
                      }
                    } else {
                      setModel('');
                    }
                  }} 
                />
              </div>

              {/* Platform Models Selection */}
              {usePlatformBilling && (
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.1] text-white">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {platformModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2">
                            <span>{m.name}</span>
                            <span className="text-xs text-slate-500">({m.provider})</span>
                            {m.isFree && (
                              <Badge className="bg-green-500/20 text-green-400 text-xs">Free</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {model && platformModels.find(m => m.id === model) && (
                    <p className="text-xs text-white/40">
                      Pricing: {platformModels.find(m => m.id === model)?.pricing.inputFormatted} input / {platformModels.find(m => m.id === model)?.pricing.outputFormatted} output
                    </p>
                  )}
                </div>
              )}

              {/* BYO Key Mode */}
              {!usePlatformBilling && (
                <>
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Select value={modelKeyId || ''} onValueChange={(v) => {
                      setModelKeyId(v || null);
                      setModel(''); // Reset model when key changes
                    }}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.1] text-white">
                        <SelectValue placeholder="Select an API key" />
                      </SelectTrigger>
                      <SelectContent>
                        {modelKeys.map((key) => (
                          <SelectItem key={key.id} value={key.id}>
                            {key.name} ({key.provider})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-white/40">
                      <Link href="/dashboard/services/ai-agents/settings" className="text-blue-400 hover:underline">
                        Manage API Keys
                      </Link>
                    </p>
                  </div>

                  {/* Model selection based on API key provider */}
                  {modelKeyId && (() => {
                    const selectedKey = modelKeys.find(k => k.id === modelKeyId);
                    const provider = selectedKey?.provider?.toLowerCase() || '';
                    
                    const PROVIDER_MODELS: Record<string, Array<{id: string; name: string}>> = {
                      openai: [
                        { id: 'gpt-4o', name: 'GPT-4o' },
                        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
                        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
                        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
                      ],
                      anthropic: [
                        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
                        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
                        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
                      ],
                      google: [
                        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
                        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
                      ],
                      openrouter: [
                        { id: 'openai/gpt-4o', name: 'GPT-4o' },
                        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
                        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
                        { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro' },
                      ],
                    };

                    const models = PROVIDER_MODELS[provider] || PROVIDER_MODELS['openrouter'];

                    return (
                      <div className="space-y-2">
                        <Label>Model</Label>
                        <Select value={model} onValueChange={setModel}>
                          <SelectTrigger className="bg-white/[0.04] border-white/[0.1] text-white">
                            <SelectValue placeholder="Select a model" />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Temperature: {temperature}</Label>
                  <Input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="bg-white/[0.04]"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Select value={maxTokens.toString()} onValueChange={(v) => setMaxTokens(parseInt(v))}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.1] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1024">1,024</SelectItem>
                      <SelectItem value="2048">2,048</SelectItem>
                      <SelectItem value="4096">4,096</SelectItem>
                      <SelectItem value="8192">8,192</SelectItem>
                      <SelectItem value="16384">16,384</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white">System Prompt</h3>
              <p className="mt-1 text-sm text-white/45">Define how your agent should behave</p>
            </div>
            <div className="p-5 sm:p-6">
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="bg-white/[0.04] border-white/[0.1] text-white min-h-[200px] font-mono text-sm"
              />
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white">Knowledge Base (RAG)</h3>
              <p className="mt-1 text-sm text-white/45">Enable RAG to use documents from a knowledge base for context</p>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable RAG</Label>
                  <p className="text-sm text-white/45">Search knowledge base for relevant context</p>
                </div>
                <Switch 
                  checked={ragEnabled} 
                  onCheckedChange={setRagEnabled}
                  disabled={!knowledgeBaseId}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Knowledge Base</Label>
                <Select
                  value={knowledgeBaseId || 'none'}
                  onValueChange={(v) => {
                    setKnowledgeBaseId(v === 'none' ? null : v);
                    if (v === 'none') setRagEnabled(false);
                  }}
                >
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.1] text-white">
                    <SelectValue placeholder="Select a knowledge base" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No knowledge base</SelectItem>
                    {knowledgeBases.map((kb) => (
                      <SelectItem key={kb.id} value={kb.id}>
                        {kb.name} ({kb.document_count} documents)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {knowledgeBaseId && !ragEnabled && (
                  <p className="text-sm text-yellow-400">
                    ⚠️ Knowledge base selected but RAG is disabled. Enable RAG above to use it.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Access Control */}
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white">API Access Control</h3>
              <p className="mt-1 text-sm text-white/45">Configure who can access your agent&apos;s API endpoint</p>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Public Access</Label>
                  <p className="text-sm text-white/45">Allow anyone to use this agent without authentication</p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Require API Key</Label>
                  <p className="text-sm text-white/45">Require x-api-key header for requests</p>
                </div>
                <Switch 
                  checked={requireAuth} 
                  onCheckedChange={setRequireAuth}
                  disabled={isPublic}
                />
              </div>
              
              {!isPublic && requireAuth && (
                <div className="border border-blue-500/20 bg-blue-500/10 p-3">
                  <p className="text-sm text-blue-400">
                    API keys can be generated in <Link href="/dashboard/services/ai-agents/settings" className="underline">AI Agents Settings</Link>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Allowed Origins (CORS)</Label>
                <Input
                  value={allowedOrigins}
                  onChange={(e) => setAllowedOrigins(e.target.value)}
                  placeholder="https://example.com, https://app.example.com"
                  className="bg-white/[0.04] border-white/[0.1] text-white"
                />
                <p className="text-xs text-white/40">Comma-separated list. Leave empty to allow all origins. Use * to allow any.</p>
              </div>

              <div className="space-y-2">
                <Label>Rate Limit (requests/minute)</Label>
                <Select value={rateLimitRpm.toString()} onValueChange={(v) => setRateLimitRpm(parseInt(v))}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.1] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / minute</SelectItem>
                    <SelectItem value="30">30 / minute</SelectItem>
                    <SelectItem value="60">60 / minute</SelectItem>
                    <SelectItem value="120">120 / minute</SelectItem>
                    <SelectItem value="300">300 / minute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Agent
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &quot;{agent.name}&quot;? This will delete all
                    conversations and usage data. This action cannot be undone.
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
        </TabsContent>

        {/* API Tab */}
        <TabsContent value="api" className="space-y-5">
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white">API Endpoint</h3>
              <p className="mt-1 text-sm text-white/45">Use this endpoint to chat with your agent</p>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="border border-white/[0.08] bg-white/[0.03] p-4 font-mono text-sm">
                <p className="text-white/40">POST</p>
                <p className="text-white break-all">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}/api/v1/agents/${agent.endpoint_id}/chat`
                    : `/api/v1/agents/${agent.endpoint_id}/chat`}
                </p>
              </div>

              <Button variant="outline" onClick={copyEndpoint} className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]">
                <Copy className="h-4 w-4 mr-2" />
                Copy Endpoint URL
              </Button>
            </div>
          </div>

	          <div className="glass-panel overflow-hidden">
	            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6 flex items-center justify-between gap-3">
	              <h3 className="text-base font-semibold text-white">Request Example</h3>
	              <Button
	                variant="outline"
	                size="sm"
	                onClick={copyRequestExample}
	                className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]"
	              >
	                <Copy className="h-4 w-4 mr-2" />
	                Copy cURL
	              </Button>
	            </div>
	            <div className="p-5 sm:p-6">
	              <pre className="border border-white/[0.08] bg-white/[0.03] p-4 text-sm overflow-x-auto">
	                <code className="text-green-400">
	                  {getRequestExampleCurl()}
	                </code>
	              </pre>
	            </div>
	          </div>

          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-white">Response Format</h3>
            </div>
            <div className="p-5 sm:p-6">
              <pre className="border border-white/[0.08] bg-white/[0.03] p-4 text-sm overflow-x-auto">
                <code className="text-blue-400">
                  {`{
  "response": "Hello! I'm here to help you with...",
  "conversation_id": "conv_abc123",
  "usage": {
    "input_tokens": 50,
    "output_tokens": 100
  }
}`}
                </code>
              </pre>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
