"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { 
  Bot, 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  DollarSign,
  Cpu,
  Eye,
  // EyeOff,
  Sparkles,
  Zap,
  MessageSquare,
  Users,
  TrendingUp,
  Activity,
  BarChart3,
  Calendar,
  CreditCard,
  Globe,
  // ExternalLink,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import api from "@/lib/axios/axios";

interface PlatformModel {
  id: string;
  model_id: string;
  display_name: string;
  provider: string;
  description: string | null;
  /** Null when the model has no price in inference.models — withheld from customers. */
  input_cost_per_million: number | null;
  output_cost_per_million: number | null;
  context_window: number;
  supports_vision: boolean;
  supports_function_calling: boolean;
  supports_streaming: boolean;
  is_active: boolean;
  is_free: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Stats interface
interface OverviewStats {
  totalAgents: number;
  activeAgents: number;
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  usage: {
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost: number;
    total_requests: number;
  };
  usageToday: {
    input_tokens: number;
    output_tokens: number;
    cost: number;
    requests: number;
  };
  topModels: Array<{
    model: string;
    total_requests: number;
    total_cost: number;
  }>;
  usageTrend: Array<{
    date: string;
    requests: number;
    cost: number;
  }>;
}

// Agent interface
interface AgentWithUser {
  id: string;
  name: string;
  description: string | null;
  model: string;
  is_public: boolean;
  use_platform_billing: boolean;
  status: 'active' | 'paused' | 'deleted';
  created_at: string;
  user: {
    email: string;
    full_name: string | null;
  } | null;
  usage: {
    tokens: number;
    cost: number;
    requests: number;
  };
}

// User interface
interface UserWithUsage {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  agents_count: number;
  balance: number;
  usage: {
    tokens: number;
    cost: number;
    requests: number;
  };
}

interface PageProps {
  initialModels: PlatformModel[];
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  highlight?: boolean;
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
  return (
    <div className={`
      p-4 rounded-xl border transition-colors
      ${highlight 
        ? 'bg-blue-500/10 border-blue-500/30' 
        : 'bg-black/40 border-white/10'}
    `}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${highlight ? 'bg-blue-500/20' : 'bg-neutral-800'}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-semibold text-white">{value}</p>
          <p className="text-sm text-neutral-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', color: 'bg-green-500/20 text-green-400' },
  { id: 'anthropic', name: 'Anthropic', color: 'bg-orange-500/20 text-orange-400' },
  { id: 'google', name: 'Google', color: 'bg-blue-500/20 text-blue-400' },
  { id: 'deepseek', name: 'DeepSeek', color: 'bg-purple-500/20 text-purple-400' },
  { id: 'mistral', name: 'Mistral', color: 'bg-cyan-500/20 text-cyan-400' },
];

const getProviderColor = (provider: string) => {
  const p = PROVIDERS.find(pr => pr.id === provider.toLowerCase());
  return p?.color || 'bg-neutral-500/20 text-neutral-400';
};

export default function AdminAIAgents({ initialModels }: PageProps) {
  const [models, setModels] = useState<PlatformModel[]>(initialModels);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  
  // Overview stats
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  
  // Agents list
  const [agents, setAgents] = useState<AgentWithUser[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsSearch, setAgentsSearch] = useState("");
  
  // Users list
  const [users, setUsers] = useState<UserWithUsage[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<PlatformModel | null>(null);
  const [modelToDelete, setModelToDelete] = useState<PlatformModel | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    model_id: '',
    display_name: '',
    provider: 'openai',
    description: '',
    context_window: 128000,
    supports_vision: false,
    supports_function_calling: true,
    supports_streaming: true,
    is_active: true,
    is_free: false,
    sort_order: 100,
  });

  // Fetch overview stats
  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await api.get('/admin/ai-agents/stats');
      if (res?.data?.success) {
        setStats(res?.data?.data ?? null);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error("Failed to load overview stats");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch agents list
  const fetchAgents = useCallback(async () => {
    try {
      setAgentsLoading(true);
      const res = await api.get('/admin/ai-agents/agents', {
        params: { search: agentsSearch }
      });
      if (res?.data?.success) {
        setAgents(res?.data?.data?.agents || []);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
      toast.error("Failed to load agents");
    } finally {
      setAgentsLoading(false);
    }
  }, [agentsSearch]);

  // Fetch users list
  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const res = await api.get('/admin/ai-agents/users', {
        params: { search: usersSearch }
      });
      if (res?.data?.success) {
        setUsers(res?.data?.data?.users || []);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, [usersSearch]);

  // Initial load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Track if initial fetch was done
  const [agentsFetched, setAgentsFetched] = useState(false);
  const [usersFetched, setUsersFetched] = useState(false);

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'agents' && !agentsFetched && !agentsLoading) {
      setAgentsFetched(true);
      fetchAgents();
    } else if (activeTab === 'users' && !usersFetched && !usersLoading) {
      setUsersFetched(true);
      fetchUsers();
    }
  }, [activeTab, agentsFetched, usersFetched, agentsLoading, usersLoading, fetchAgents, fetchUsers]);

  const filteredModels = models.filter((model) =>
    model.model_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.provider.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredAgents = agents.filter((agent) =>
    agent.name?.toLowerCase().includes(agentsSearch.toLowerCase()) ||
    agent.user?.email?.toLowerCase().includes(agentsSearch.toLowerCase()) ||
    (agent.user?.full_name && agent.user.full_name.toLowerCase().includes(agentsSearch.toLowerCase()))
  );
  
  const filteredUsers = users.filter((user) =>
    user.email?.toLowerCase().includes(usersSearch.toLowerCase()) ||
    (user.full_name && user.full_name.toLowerCase().includes(usersSearch.toLowerCase()))
  );

  const resetForm = () => {
    setFormData({
      model_id: '',
      display_name: '',
      provider: 'openai',
      description: '',
      context_window: 128000,
      supports_vision: false,
      supports_function_calling: true,
      supports_streaming: true,
      is_active: true,
      is_free: false,
      sort_order: 100,
    });
  };

  const handleCreate = async () => {
    if (!formData.model_id || !formData.display_name) {
      toast.error("Model ID and Display Name are required");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/admin/ai-agents/models', formData);
      
      if (res?.data?.success) {
        if (res?.data?.data) {
          setModels([...models, res.data.data]);
        }
        toast.success("Model created successfully");
        setCreateDialogOpen(false);
        resetForm();
      } else {
        toast.error(res?.data?.error || "Failed to create model");
      }
    } catch (error: unknown) {
      console.error("Error creating model:", error);
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to create model");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (model: PlatformModel) => {
    setSelectedModel(model);
    setFormData({
      model_id: model.model_id,
      display_name: model.display_name,
      provider: model.provider,
      description: model.description || '',
      context_window: model.context_window,
      supports_vision: model.supports_vision,
      supports_function_calling: model.supports_function_calling,
      supports_streaming: model.supports_streaming,
      is_active: model.is_active,
      is_free: model.is_free,
      sort_order: model.sort_order,
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedModel) return;

    try {
      setLoading(true);
      const res = await api.put(`/admin/ai-agents/models/${selectedModel.id}`, {
        display_name: formData.display_name,
        provider: formData.provider,
        description: formData.description || null,
        context_window: formData.context_window,
        supports_vision: formData.supports_vision,
        supports_function_calling: formData.supports_function_calling,
        supports_streaming: formData.supports_streaming,
        is_active: formData.is_active,
        is_free: formData.is_free,
        sort_order: formData.sort_order,
      });
      
      if (res?.data?.success) {
        setModels(
          models.map((m) =>
            m.id === selectedModel.id ? (res?.data?.data ?? m) : m
          )
        );
        toast.success("Model updated successfully");
        setEditDialogOpen(false);
        resetForm();
        setSelectedModel(null);
      } else {
        toast.error(res?.data?.error || "Failed to update model");
      }
    } catch (error: unknown) {
      console.error("Error updating model:", error);
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to update model");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (model: PlatformModel) => {
    setModelToDelete(model);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!modelToDelete) return;

    try {
      setLoading(true);
      const res = await api.delete(`/admin/ai-agents/models/${modelToDelete.id}`);
      
      if (res?.data?.success) {
        setModels(models.filter(m => m.id !== modelToDelete.id));
        toast.success("Model deleted successfully");
        setDeleteDialogOpen(false);
        setModelToDelete(null);
      } else {
        toast.error(res?.data?.error || "Failed to delete model");
      }
    } catch (error: unknown) {
      console.error("Error deleting model:", error);
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to delete model");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (model: PlatformModel) => {
    try {
      const res = await api.put(`/admin/ai-agents/models/${model.id}`, {
        is_active: !model.is_active,
      });
      
      if (res?.data?.success) {
        setModels(models.map(m => m.id === model.id ? { ...m, is_active: !m.is_active } : m));
        toast.success(`Model ${!model.is_active ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error("Error toggling model:", error);
      toast.error("Failed to update model status");
    }
  };

  const totalActive = models.filter(m => m.is_active).length;
  const totalFree = models.filter(m => m.is_free).length;

  const ModelFormDialog = ({ isEdit = false }: { isEdit?: boolean }) => (
    <Dialog 
      open={isEdit ? editDialogOpen : createDialogOpen} 
      onOpenChange={isEdit ? setEditDialogOpen : setCreateDialogOpen}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Model' : 'Add New Model'}</DialogTitle>
          <DialogDescription>
            {isEdit 
              ? 'Update the model configuration and pricing.' 
              : 'Add a new AI model to the platform. Users will be billed based on token usage.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Model ID and Display Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model_id">Model ID (OpenRouter)</Label>
              <Input
                id="model_id"
                placeholder="e.g., openai/gpt-5-nano"
                value={formData.model_id}
                onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
                disabled={isEdit}
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                placeholder="e.g., GPT-5 Nano"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          {/* Provider and Sort Order */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <select
                id="provider"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-white"
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of the model..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-slate-800 border-slate-700"
              rows={2}
            />
          </div>

          {/* Pricing — read-only pointer, not an input. */}
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-green-400" />
              <span className="font-medium text-white">Pricing</span>
            </div>
            <p className="text-sm text-slate-400">
              Set in <span className="text-slate-200">Admin → Inference Pricing</span>, which shows
              upstream cost and margin side by side and blocks a below-cost price.
              This table is the catalogue — which models are offered — not the price list.
            </p>
            <p className="text-sm text-slate-500 mt-2">
              A model with no price there is withheld from customers and shown as
              <span className="text-slate-300"> — </span> in the list below.
            </p>
          </div>

          {/* Context Window */}
          <div className="space-y-2">
            <Label htmlFor="context_window">Context Window (tokens)</Label>
            <Input
              id="context_window"
              type="number"
              value={formData.context_window}
              onChange={(e) => setFormData({ ...formData, context_window: parseInt(e.target.value) || 0 })}
              className="bg-slate-800 border-slate-700"
            />
          </div>

          {/* Capabilities */}
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="font-medium text-white">Capabilities</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="supports_vision" className="text-sm">Vision</Label>
                <Switch
                  id="supports_vision"
                  checked={formData.supports_vision}
                  onCheckedChange={(checked) => setFormData({ ...formData, supports_vision: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="supports_function" className="text-sm">Functions</Label>
                <Switch
                  id="supports_function"
                  checked={formData.supports_function_calling}
                  onCheckedChange={(checked) => setFormData({ ...formData, supports_function_calling: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="supports_streaming" className="text-sm">Streaming</Label>
                <Switch
                  id="supports_streaming"
                  checked={formData.supports_streaming}
                  onCheckedChange={(checked) => setFormData({ ...formData, supports_streaming: checked })}
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_free"
                checked={formData.is_free}
                onCheckedChange={(checked) => setFormData({ ...formData, is_free: checked })}
              />
              <Label htmlFor="is_free">Free Tier</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => {
              if (isEdit) {
                setEditDialogOpen(false);
              } else {
                setCreateDialogOpen(false);
              }
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={isEdit ? handleUpdate : handleCreate} 
            disabled={loading}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {loading ? 'Saving...' : (isEdit ? 'Update Model' : 'Create Model')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto"
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-lg border border-purple-500/30">
              <Bot className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                AI Agents Management
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                Monitor agents, users, usage, and manage platform models
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-black/40 border border-white/10 p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="agents" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <Bot className="h-4 w-4 mr-2" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="models" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <Cpu className="h-4 w-4 mr-2" />
              Models
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            {statsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              </div>
            ) : stats ? (
              <div className="space-y-6">
                {/* Main Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Agents"
                    value={stats.totalAgents}
                    icon={<Bot className="h-5 w-5 text-purple-400" />}
                  />
                  <StatCard
                    label="Active Agents"
                    value={stats.activeAgents}
                    icon={<Activity className="h-5 w-5 text-green-400" />}
                    highlight
                  />
                  <StatCard
                    label="Total Users"
                    value={stats.totalUsers}
                    icon={<Users className="h-5 w-5 text-blue-400" />}
                  />
                  <StatCard
                    label="Total Conversations"
                    value={stats.totalConversations}
                    icon={<MessageSquare className="h-5 w-5 text-cyan-400" />}
                  />
                </div>

                {/* Usage Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-400" />
                      Total Usage (All Time)
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-neutral-900/50">
                        <p className="text-sm text-neutral-400">Input Tokens</p>
                        <p className="text-xl font-semibold text-white">
                          {((stats.usage?.total_input_tokens || 0) / 1000000).toFixed(2)}M
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-neutral-900/50">
                        <p className="text-sm text-neutral-400">Output Tokens</p>
                        <p className="text-xl font-semibold text-white">
                          {((stats.usage?.total_output_tokens || 0) / 1000000).toFixed(2)}M
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-neutral-900/50">
                        <p className="text-sm text-neutral-400">Total Revenue</p>
                        <p className="text-xl font-semibold text-green-400">
                          ${(stats.usage?.total_cost || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-neutral-900/50">
                        <p className="text-sm text-neutral-400">Total Requests</p>
                        <p className="text-xl font-semibold text-white">
                          {(stats.usage?.total_requests || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-blue-400" />
                      Today&apos;s Usage
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-neutral-900/50">
                        <p className="text-sm text-neutral-400">Input Tokens</p>
                        <p className="text-xl font-semibold text-white">
                          {((stats.usageToday?.input_tokens || 0) / 1000).toFixed(1)}K
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-neutral-900/50">
                        <p className="text-sm text-neutral-400">Output Tokens</p>
                        <p className="text-xl font-semibold text-white">
                          {((stats.usageToday?.output_tokens || 0) / 1000).toFixed(1)}K
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-neutral-900/50">
                        <p className="text-sm text-neutral-400">Revenue</p>
                        <p className="text-xl font-semibold text-green-400">
                          ${(stats.usageToday?.cost || 0).toFixed(4)}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-neutral-900/50">
                        <p className="text-sm text-neutral-400">Requests</p>
                        <p className="text-xl font-semibold text-white">
                          {(stats.usageToday?.requests || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Models & Trend */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-400" />
                      Top Models
                    </h3>
                    {(stats.topModels?.length || 0) > 0 ? (
                      <div className="space-y-3">
                        {stats.topModels.map((model, i) => (
                          <div key={model.model} className="flex items-center justify-between p-3 rounded-lg bg-neutral-900/50">
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-neutral-500">#{i + 1}</span>
                              <span className="text-white font-mono text-sm">{model.model}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-green-400 font-semibold">${(model.total_cost || 0).toFixed(2)}</p>
                              <p className="text-xs text-neutral-400">{model.total_requests || 0} requests</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-neutral-500 text-center py-4">No usage data yet</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-cyan-400" />
                      7-Day Trend
                    </h3>
                    {(stats.usageTrend?.length || 0) > 0 ? (
                      <div className="space-y-2">
                        {stats.usageTrend.map((day) => (
                          <div key={day.date} className="flex items-center gap-3">
                            <span className="text-neutral-400 text-sm w-20">
                              {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <div className="flex-1 h-6 bg-neutral-900/50 rounded overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                                style={{ 
                                  width: `${Math.max(5, ((day.requests || 0) / Math.max(...stats.usageTrend.map(d => d.requests || 0), 1)) * 100)}%` 
                                }}
                              />
                            </div>
                            <span className="text-sm text-neutral-300 w-16 text-right">{day.requests || 0}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-neutral-500 text-center py-4">No usage data yet</p>
                    )}
                  </div>
                </div>

                <Button 
                  onClick={fetchStats} 
                  variant="outline" 
                  className="border-white/10"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Stats
                </Button>
              </div>
            ) : (
              <div className="text-center py-20 text-neutral-400">
                Failed to load statistics
              </div>
            )}
          </TabsContent>

          {/* Agents Tab */}
          <TabsContent value="agents">
            <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <Input
                    placeholder="Search agents by name or user..."
                    value={agentsSearch}
                    onChange={(e) => setAgentsSearch(e.target.value)}
                    className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-neutral-500"
                  />
                </div>
                <Button onClick={fetchAgents} variant="outline" className="border-white/10">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              {agentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="text-center py-12">
                  <Bot className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                  <p className="text-neutral-400">
                    {agentsSearch ? "No agents found" : "No agents created yet"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Agent</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">User</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Model</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Usage</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Revenue</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAgents.map((agent) => (
                        <tr key={agent.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-white">{agent.name}</p>
                              <p className="text-xs text-neutral-500 truncate max-w-[200px]">
                                {agent.description || 'No description'}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-white text-sm">{agent.user?.email || '-'}</p>
                              <p className="text-xs text-neutral-500">{agent.user?.full_name || '-'}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge className={`${getProviderColor(agent.model?.split('/')[0] || '')} border-0`}>
                              {agent.model}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm">
                              <p className="text-neutral-300">{agent.usage?.requests || 0} requests</p>
                              <p className="text-xs text-neutral-500">
                                {((agent.usage?.tokens || 0) / 1000).toFixed(1)}K tokens
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-green-400 font-mono">
                              ${(agent.usage?.cost || 0).toFixed(4)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1">
                              <Badge className={
                                agent.status === 'active' 
                                  ? 'bg-green-500/20 text-green-400 border-0' 
                                  : agent.status === 'paused'
                                  ? 'bg-yellow-500/20 text-yellow-400 border-0'
                                  : 'bg-red-500/20 text-red-400 border-0'
                              }>
                                {agent.status}
                              </Badge>
                              {agent.use_platform_billing && (
                                <Badge className="bg-purple-500/20 text-purple-400 border-0 text-xs">
                                  <CreditCard className="h-3 w-3 mr-1" />
                                  Platform Billing
                                </Badge>
                              )}
                              {agent.is_public && (
                                <Badge className="bg-blue-500/20 text-blue-400 border-0 text-xs">
                                  <Globe className="h-3 w-3 mr-1" />
                                  Public
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-neutral-400">
                            {new Date(agent.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <Input
                    placeholder="Search users by email or name..."
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-neutral-500"
                  />
                </div>
                <Button onClick={fetchUsers} variant="outline" className="border-white/10">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                  <p className="text-neutral-400">
                    {usersSearch ? "No users found" : "No users with AI agents yet"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">User</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Agents</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Balance</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Total Spent</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Usage</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-white">{user.email}</p>
                              <p className="text-xs text-neutral-500">{user.full_name || '-'}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge className="bg-purple-500/20 text-purple-400 border-0">
                              {user.agents_count} agents
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`font-mono font-semibold ${
                              user.balance > 1 ? 'text-green-400' : 
                              user.balance > 0.1 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              ${user.balance.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-green-400 font-mono">
                              ${(user.usage?.cost || 0).toFixed(4)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm">
                              <p className="text-neutral-300">{user.usage?.requests || 0} requests</p>
                              <p className="text-xs text-neutral-500">
                                {((user.usage?.tokens || 0) / 1000).toFixed(1)}K tokens
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-neutral-400">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Models Tab */}
          <TabsContent value="models">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatCard
                label="Total Models"
                value={models.length}
                icon={<Cpu className="h-5 w-5 text-neutral-300" />}
              />
              <StatCard
                label="Active Models"
                value={totalActive}
                icon={<Zap className="h-5 w-5 text-blue-400" />}
                highlight
              />
              <StatCard
                label="Free Tier Models"
                value={totalFree}
                icon={<Sparkles className="h-5 w-5 text-neutral-300" />}
              />
            </div>

        {/* Main Content */}
        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-4 sm:p-6">
          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-neutral-500"
              />
            </div>
            <Button
              onClick={() => {
                resetForm();
                setCreateDialogOpen(true);
              }}
              className="cursor-pointer bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Model
            </Button>
          </div>

          {/* Models Table */}
          {filteredModels.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
              <p className="text-neutral-400">
                {searchTerm ? "No models found" : "No models yet. Add your first model!"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Model</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Provider</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Input Price</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Output Price</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Context</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Features</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-neutral-400">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-neutral-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModels.map((model) => (
                    <tr 
                      key={model.id} 
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-white">{model.display_name}</p>
                            {model.is_free && (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                                Free
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 font-mono">{model.model_id}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`${getProviderColor(model.provider)} border-0`}>
                          {model.provider}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-green-400 font-mono text-sm">
                          {model.input_cost_per_million == null ? "—" : `$${model.input_cost_per_million}/M`}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-orange-400 font-mono text-sm">
                          {model.output_cost_per_million == null ? "—" : `$${model.output_cost_per_million}/M`}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-neutral-400 text-sm">
                          {(model.context_window / 1000).toFixed(0)}K
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {model.supports_vision && (
                            <Badge className="bg-purple-500/20 text-purple-400 border-0 text-xs">
                              <Eye className="h-3 w-3 mr-1" />
                              Vision
                            </Badge>
                          )}
                          {model.supports_streaming && (
                            <Badge className="bg-blue-500/20 text-blue-400 border-0 text-xs">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              Stream
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={model.is_active}
                            onCheckedChange={() => handleToggleActive(model)}
                          />
                          <span className={model.is_active ? 'text-green-400' : 'text-neutral-500'}>
                            {model.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(model)}
                            className="text-neutral-400 hover:text-white"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(model)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="mt-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 text-blue-400 mt-0.5" />
            <div>
              <p className="text-blue-400 font-medium">Billing Information</p>
              <p className="text-sm text-blue-300/70 mt-1">
                Users who don&apos;t provide their own API keys will be billed based on the prices set here.
                These models use OpenRouter as the backend provider. Make sure to set competitive prices
                that cover your OpenRouter costs plus margin.
              </p>
            </div>
          </div>
        </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Create Dialog */}
      <ModelFormDialog isEdit={false} />

      {/* Edit Dialog */}
      <ModelFormDialog isEdit={true} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{modelToDelete?.display_name}&quot;? 
              This action cannot be undone. Users who have agents using this model
              will need to select a different one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
