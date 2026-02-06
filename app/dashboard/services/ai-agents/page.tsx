'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Plus,
  RotateCw,
  Settings,
  MessageSquare,
  Copy,
  ExternalLink,
  MoreVertical,
  Trash2,
  Play,
  Pause,
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

  const supabase = createClient();

  const loadAgents = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch('/api/ai-agents', {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(`/api/ai-agents/${agent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(`/api/ai-agents/${deleteAgent.id}`, {
        method: 'DELETE',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">AI Agents</h1>
          <p className="text-slate-400 mt-2">
            Create and manage AI agents with custom knowledge bases
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadAgents} variant="outline" disabled={loading}>
            <RotateCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/services/ai-agents/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-900/30 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Agents</CardTitle>
            <Bot className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{agents.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/30 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Active Agents</CardTitle>
            <Play className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {agents.filter((a) => a.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/30 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {agents.reduce((sum, a) => sum + (a.usage_count || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agents List */}
      <div className="space-y-4">
        {loading ? (
          <Card className="bg-slate-900/30 border-slate-800">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-slate-400">Loading agents...</div>
            </CardContent>
          </Card>
        ) : agents.length > 0 ? (
          agents.map((agent) => (
            <Card
              key={agent.id}
              className="bg-slate-900/30 border-slate-800 hover:border-slate-700 transition-colors"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
                      <Bot className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{agent.name}</h3>
                        <Badge
                          variant={agent.status === 'active' ? 'default' : 'secondary'}
                          className={
                            agent.status === 'active'
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                          }
                        >
                          {agent.status === 'active' ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      {agent.description && (
                        <p className="text-sm text-slate-400">{agent.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {getModelDisplayName(agent.model_id)}
                        </Badge>
                        {agent.knowledge_base_ids && agent.knowledge_base_ids.length > 0 && (
                          <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                            {agent.knowledge_base_ids.length} KB(s)
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">
                          Created {new Date(agent.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyEndpoint(agent.endpoint_id)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Endpoint
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/services/ai-agents/${agent.id}/playground`}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Test
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
                          <Link href={`/dashboard/services/ai-agents/${agent.id}`}>
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/services/ai-agents/${agent.id}/playground`}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Playground
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toggleAgentStatus(agent)}>
                          {agent.status === 'active' ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" />
                              Disable
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Enable
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400 focus:text-red-400"
                          onClick={() => setDeleteAgent(agent)}
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
              <Bot className="h-12 w-12 text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">No agents yet</h3>
              <p className="text-slate-400 mb-4 max-w-md">
                Create your first AI agent to start building conversational experiences with custom
                knowledge bases.
              </p>
              <Button asChild>
                <Link href="/dashboard/services/ai-agents/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Agent
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteAgent} onOpenChange={() => setDeleteAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteAgent?.name}&quot;? This action cannot be
              undone and will delete all conversations and usage data associated with this agent.
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
