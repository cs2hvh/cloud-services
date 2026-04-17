'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import {
  Plus,
  RotateCw,
  MessageSquare,
  Copy,
  ExternalLink,
  MoreVertical,
  Trash2,
  Play,
  Settings,
  Pause,
} from 'lucide-react';
import Link from 'next/link';
import { fetchAIAgentApi } from '@/lib/ai/client-api';
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

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model_id: string;
  status: 'active' | 'paused' | 'deleted';
  endpoint_id: string;
  created_at: string;
  usage_count?: number;
  knowledge_base_ids?: string[];
}

export default function AIAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const res = await fetchAIAgentApi('/api/ai-agents');

      if (!res.ok) {
        throw new Error('Failed to load agents');
      }

      const data = await res.json();
      setAgents(data.data || []);
    } catch (err) {
      console.error('Failed to load agents:', err);
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const copyEndpoint = async (endpointId: string) => {
    const url = `${window.location.origin}/api/v1/agents/${endpointId}/chat`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Endpoint URL copied to clipboard');
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const toggleAgentStatus = async (agent: Agent) => {
    try {
      const res = await fetchAIAgentApi(`/api/ai-agents/${agent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: agent.status === 'active' ? 'paused' : 'active' }),
      });

      if (!res.ok) throw new Error('Failed to update agent');

      toast.success(`Agent ${agent.status === 'active' ? 'paused' : 'activated'}`);
      await loadAgents();
    } catch (err) {
      console.error('Failed to toggle agent:', err);
      toast.error('Failed to update agent');
    }
  };

  const handleDelete = async () => {
    if (!deleteAgent) return;

    setDeleting(true);
    try {
      const res = await fetchAIAgentApi(`/api/ai-agents/${deleteAgent.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete agent');

      toast.success('Agent deleted successfully');
      setDeleteAgent(null);
      await loadAgents();
    } catch (err) {
      console.error('Failed to delete agent:', err);
      toast.error('Failed to delete agent');
    } finally {
      setDeleting(false);
    }
  };

  const getModelDisplayName = (model: string) => {
    const modelNames: Record<string, string> = {
      'openai/gpt-4o': 'GPT-4o',
      'openai/gpt-4o-mini': 'GPT-4o Mini',
      'openai/gpt-4-turbo': 'GPT-4 Turbo',
      'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
      'anthropic/claude-3-opus': 'Claude 3 Opus',
      'anthropic/claude-3-haiku': 'Claude 3 Haiku',
      'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1 70B',
      'meta-llama/llama-3.1-8b-instruct': 'Llama 3.1 8B',
      'mistralai/mistral-large': 'Mistral Large',
      'google/gemini-pro-1.5': 'Gemini Pro 1.5',
      'deepseek/deepseek-chat': 'DeepSeek Chat',
    };
    return modelNames[model] || model;
  };
  const activeAgents = agents.filter((agent) => agent.status === 'active').length;
  const totalMessages = agents.reduce((sum, agent) => sum + (agent.usage_count || 0), 0);
  const linkedKnowledgeBases = agents.reduce(
    (sum, agent) => sum + (agent.knowledge_base_ids?.length || 0),
    0
  );

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">AI Services</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">AI agents for conversational workflows and production automations.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">Manage deployed agents, review endpoint posture, and control operational status from a cleaner enterprise console.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={loadAgents}
              variant="outline"
              disabled={loading}
              className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08] cursor-pointer"
            >
              <RotateCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button asChild className="border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
              <Link href="/dashboard/services/ai-agents/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Agent
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Agents</p>
              <div className="mt-3 text-2xl font-semibold text-white">{agents.length}</div>
              <p className="mt-1 text-sm text-white/45">Provisioned conversational agents</p>
            </div>
            <Image src="/dashboard icons/agents .png" alt="Agents" width={36} height={36} className="shrink-0 opacity-80" />
          </div>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Active</p>
              <div className="mt-3 text-2xl font-semibold text-white">{activeAgents}</div>
              <p className="mt-1 text-sm text-white/45">Agents currently serving traffic</p>
            </div>
            <Image src="/dashboard icons/active .png" alt="Active" width={36} height={36} className="shrink-0 opacity-80" />
          </div>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Messages</p>
              <div className="mt-3 text-2xl font-semibold text-white">{totalMessages}</div>
              <p className="mt-1 text-sm text-white/45">Tracked requests across all agents</p>
            </div>
            <Image src="/dashboard icons/messages .png" alt="Messages" width={36} height={36} className="shrink-0 opacity-80" />
          </div>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Knowledge Links</p>
              <div className="mt-3 text-2xl font-semibold text-white">{linkedKnowledgeBases}</div>
              <p className="mt-1 text-sm text-white/45">Knowledge-base attachments in use</p>
            </div>
            <Image src="/dashboard icons/knowledge links .png" alt="Knowledge Links" width={36} height={36} className="shrink-0 opacity-80" />
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-white">Agent Inventory</h2>
          <p className="text-sm text-white/45">Review deployment posture, models, and endpoint access for each agent.</p>
        </div>
        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center border border-white/[0.08] bg-white/[0.03] py-16 text-sm text-white/45">Loading agents...</div>
          ) : agents.length > 0 ? (
            <div className="space-y-4">
              {agents.map((agent) => (
                <div key={agent.id} className="border border-white/[0.08] bg-white/[0.03] p-5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <Image src="/dashboard icons/agents .png" alt="Agent" width={44} height={44} className="shrink-0 opacity-80" />
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-white">{agent.name}</h3>
                          <Badge className={agent.status === 'active' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/[0.05] text-white/60'}>
                            {agent.status === 'active' ? 'Active' : 'Paused'}
                          </Badge>
                        </div>
                        {agent.description && (
                          <p className="max-w-3xl text-sm leading-6 text-white/50">{agent.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">{getModelDisplayName(agent.model_id)}</span>
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">{agent.usage_count || 0} messages</span>
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">{agent.knowledge_base_ids?.length || 0} knowledge bases</span>
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">Created {new Date(agent.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <Button variant="outline" size="sm" onClick={() => copyEndpoint(agent.endpoint_id)} className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]">
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Endpoint
                      </Button>
                      <Button variant="outline" size="sm" asChild className="border-white/[0.1] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]">
                        <Link href={`/dashboard/services/ai-agents/${agent.id}/playground`}>
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Playground
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
                            <Link href={`/dashboard/services/ai-agents/${agent.id}`}>
                              <Settings className="mr-2 h-4 w-4" />
                              Settings
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/services/ai-agents/${agent.id}/playground`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open Playground
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toggleAgentStatus(agent)}>
                            {agent.status === 'active' ? (
                              <>
                                <Pause className="mr-2 h-4 w-4" />
                                Disable
                              </>
                            ) : (
                              <>
                                <Play className="mr-2 h-4 w-4" />
                                Enable
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={() => setDeleteAgent(agent)}>
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
              <Image src="/dashboard icons/agents .png" alt="No agents" width={48} height={48} className="opacity-25" />
              <h3 className="mt-5 text-lg font-semibold text-white">No agents yet</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/45">Create your first AI agent to launch conversational flows with model selection, knowledge grounding, and endpoint controls.</p>
              <Button asChild className="mt-6 border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">
                <Link href="/dashboard/services/ai-agents/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Agent
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteAgent} onOpenChange={() => setDeleteAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteAgent?.name}&quot;? This action cannot be undone.
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
