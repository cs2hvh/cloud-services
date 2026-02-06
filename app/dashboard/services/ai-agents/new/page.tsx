
'use client';
import Link from 'next/link';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Sparkles,
  Brain,
  Database,
  CheckCircle2,
  AlertCircle,
  Key,
  CreditCard,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
}

interface ModelKey {
  id: string;
  provider: string;
  name: string;
  is_valid: boolean;
}

const STEPS = [
  { id: 1, name: 'Basic Info', description: 'Name and description' },
  { id: 2, name: 'Model', description: 'Choose AI model' },
  { id: 3, name: 'System Prompt', description: 'Define behavior' },
  { id: 4, name: 'Knowledge Base', description: 'Attach documents' },
  { id: 5, name: 'Review', description: 'Review and create' },
];

export default function NewAgentPage() {
  const router = useRouter();
  const supabase = createClient();

  // Form state
  const [currentStep, setCurrentStep] = useState(1);
  const [creating, setCreating] = useState(false);

  // Agent config
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('');
  const [modelKeyId, setModelKeyId] = useState<string | null>(null);
  const [usePlatformBilling, setUsePlatformBilling] = useState(true); // Use platform models by default
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant. Answer questions accurately and concisely.');
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | null>(null);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);

  // Data
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [modelKeys, setModelKeys] = useState<ModelKey[]>([]);
  const [platformModels, setPlatformModels] = useState<PlatformModel[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const headers: HeadersInit = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const [kbRes, keysRes, modelsRes] = await Promise.all([
        fetch('/api/knowledge-bases', { headers }),
        fetch('/api/ai-model-keys', { headers }),
        fetch('/api/ai-agents/platform-models', { headers }),
      ]);

      if (kbRes.ok) {
        const kbData = await kbRes.json();
        setKnowledgeBases(kbData.knowledgeBases || []);
      }

      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setModelKeys(keysData.data || []);
      }

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        const models = modelsData.data || [];
        setPlatformModels(models);
        // Set default model to the first one if available
        if (models.length > 0 && !model) {
          setModel(models[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const validateStep = () => {
    switch (currentStep) {
      case 1:
        if (!name.trim()) {
          toast.error('Please enter a name for your agent');
          return false;
        }
        return true;
      case 2:
        if (!model) {
          toast.error('Please select a model');
          return false;
        }
        // Only require API key if not using platform billing
        if (!usePlatformBilling && !modelKeyId) {
          toast.error('Please select an API key for the model');
          return false;
        }
        return true;
      case 3:
        if (!systemPrompt.trim()) {
          toast.error('Please enter a system prompt');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleCreate = async () => {
    if (!validateStep()) return;

    setCreating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch('/api/ai-agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          model_id: model,
          model_key_id: usePlatformBilling ? null : modelKeyId,
          use_platform_billing: usePlatformBilling,
          system_prompt: systemPrompt.trim(),
          knowledge_base_ids: knowledgeBaseId ? [knowledgeBaseId] : [],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Show validation details if available
        if (data.details && Array.isArray(data.details)) {
          const errorMessages = data.details.map((d: { path?: string[]; message?: string }) => 
            `${d.path?.join('.') || 'field'}: ${d.message || 'invalid'}`
          ).join(', ');
          throw new Error(errorMessages);
        }
        throw new Error(data.error || 'Failed to create agent');
      }

      toast.success('Agent created successfully!');
      router.push(`/dashboard/services/ai-agents/${data.data.id}`);
    } catch (err) {
      console.error('Failed to create agent:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  const selectedPlatformModel = platformModels.find((m) => m.id === model);
  const selectedKb = knowledgeBases.find((kb) => kb.id === knowledgeBaseId);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Create AI Agent</h1>
        <p className="text-slate-400 mt-2">
          Configure your AI agent with a custom model and knowledge base
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors',
                  currentStep === step.id
                    ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                    : currentStep > step.id
                      ? 'border-green-500 bg-green-500/20 text-green-400'
                      : 'border-slate-700 bg-slate-800 text-slate-500'
                )}
              >
                {currentStep > step.id ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-medium">{step.id}</span>
                )}
              </div>
              <div className="mt-2 text-center hidden sm:block">
                <p
                  className={cn(
                    'text-sm font-medium',
                    currentStep >= step.id ? 'text-white' : 'text-slate-500'
                  )}
                >
                  {step.name}
                </p>
                <p className="text-xs text-slate-500">{step.description}</p>
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-12 mx-2 sm:w-20',
                  currentStep > step.id ? 'bg-green-500' : 'bg-slate-700'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Bot className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Basic Information</h2>
                  <p className="text-sm text-slate-400">Give your agent a name and description</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Agent Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Customer Support Bot"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="What does this agent do?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-slate-800 border-slate-700 min-h-[100px]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Model Selection */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Brain className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Select Model</h2>
                  <p className="text-sm text-slate-400">Choose the AI model for your agent</p>
                </div>
              </div>

              {/* Billing Mode Selection */}
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <CreditCard className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Use Platform Models</p>
                      <p className="text-sm text-slate-400">
                        Pay per token usage. No API key needed.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={usePlatformBilling}
                    onCheckedChange={(checked) => {
                      setUsePlatformBilling(checked);
                      if (checked) {
                        setModelKeyId(null);
                        // Reset to first platform model
                        if (platformModels.length > 0) {
                          setModel(platformModels[0].id);
                        }
                      } else {
                        setModel('');
                      }
                    }}
                  />
                </div>
              </div>

              {/* Platform Models */}
              {usePlatformBilling && (
                <>
                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-blue-400 mt-0.5" />
                      <div>
                        <p className="text-sm text-blue-400 font-medium">Platform Billing</p>
                        <p className="text-sm text-slate-400 mt-1">
                          Token usage will be billed to your account. Prices shown are per million tokens.
                        </p>
                      </div>
                    </div>
                  </div>

                  {loadingData ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                      <span className="ml-2 text-slate-400">Loading models...</span>
                    </div>
                  ) : platformModels.length === 0 ? (
                    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                      <p className="text-yellow-400">No platform models available. Please try again later.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Select a Model *</Label>
                      <Select value={model} onValueChange={setModel}>
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue placeholder="Choose a model" />
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

                      {/* Selected model details */}
                      {model && platformModels.find((m) => m.id === model) && (
                        <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 mt-4">
                          {(() => {
                            const selectedModel = platformModels.find((m) => m.id === model)!;
                            return (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="font-medium text-white">{selectedModel.name}</h4>
                                    <p className="text-sm text-slate-400">{selectedModel.description}</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Badge className="bg-slate-700 text-slate-300 capitalize">
                                      {selectedModel.provider}
                                    </Badge>
                                    {selectedModel.isFree && (
                                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                        Free
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-slate-500">Context Window:</span>
                                    <span className="text-white ml-2">{(selectedModel.contextWindow / 1000).toFixed(0)}K tokens</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Capabilities:</span>
                                    <span className="ml-2">
                                      {selectedModel.capabilities.vision && (
                                        <Badge className="bg-purple-500/20 text-purple-400 text-xs mr-1">Vision</Badge>
                                      )}
                                      {selectedModel.capabilities.functionCalling && (
                                        <Badge className="bg-blue-500/20 text-blue-400 text-xs mr-1">Functions</Badge>
                                      )}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 pt-2 border-t border-slate-700">
                                  <div>
                                    <span className="text-slate-500 text-sm">Input:</span>
                                    <span className="text-green-400 ml-2 font-medium">{selectedModel.pricing.inputFormatted}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 text-sm">Output:</span>
                                    <span className="text-orange-400 ml-2 font-medium">{selectedModel.pricing.outputFormatted}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Custom API Key Mode */}
              {!usePlatformBilling && (
                <>
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-start gap-3">
                      <Key className="h-5 w-5 text-yellow-400 mt-0.5" />
                      <div>
                        <p className="text-sm text-yellow-400 font-medium">Bring Your Own Key</p>
                        <p className="text-sm text-slate-400 mt-1">
                          Use your own API keys. You&apos;ll be billed directly by the provider.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* API Key Selection - First select key, then model */}
                  <div className="space-y-2">
                    <Label htmlFor="modelKey">Select API Key *</Label>
                    <p className="text-sm text-slate-400 mb-2">
                      Choose an API key to use. Models will be shown based on the provider.
                    </p>
                    {modelKeys.length === 0 ? (
                      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-yellow-400 font-medium">No API Keys Found</p>
                          <p className="text-sm text-slate-400 mt-1">
                            You need to add an API key before using custom models.{' '}
                            <Button variant="link" className="p-0 h-auto text-yellow-400" asChild>
                              <Link href="/dashboard/services/ai-agents/settings">Add API Key</Link>
                            </Button>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <Select
                        value={modelKeyId || ''}
                        onValueChange={(v) => {
                          setModelKeyId(v || null);
                          // Reset model when API key changes
                          setModel('');
                        }}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue placeholder="Select an API key" />
                        </SelectTrigger>
                        <SelectContent>
                          {modelKeys.map((key) => (
                            <SelectItem key={key.id} value={key.id}>
                              <div className="flex items-center gap-2">
                                <span>{key.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {key.provider}
                                </Badge>
                                {!key.is_valid && (
                                  <Badge variant="destructive" className="text-xs">
                                    Invalid
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Model Selection based on selected API key provider */}
                  {modelKeyId && (() => {
                    const selectedKey = modelKeys.find(k => k.id === modelKeyId);
                    const provider = selectedKey?.provider?.toLowerCase() || '';
                    
                    // Models by provider
                    const PROVIDER_MODELS: Record<string, Array<{id: string; name: string; description: string}>> = {
                      openai: [
                        { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model, great for complex tasks' },
                        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable for most tasks' },
                        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous gen, still very capable' },
                        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and cost-effective' },
                      ],
                      anthropic: [
                        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Best balance of speed and intelligence' },
                        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most powerful for complex tasks' },
                        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest and most affordable' },
                      ],
                      google: [
                        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Advanced reasoning with long context' },
                        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient' },
                        { id: 'gemini-pro', name: 'Gemini Pro', description: 'Balanced performance' },
                      ],
                      openrouter: [
                        { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI\'s most capable model' },
                        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable' },
                        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Anthropic\'s best model' },
                        { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro', description: 'Google\'s advanced model' },
                        { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', description: 'Meta\'s open model' },
                      ],
                    };

                    const models = PROVIDER_MODELS[provider] || PROVIDER_MODELS['openrouter'];

                    return (
                      <div className="space-y-2">
                        <Label>Select Model *</Label>
                        <Select value={model} onValueChange={setModel}>
                          <SelectTrigger className="bg-slate-800 border-slate-700">
                            <SelectValue placeholder="Choose a model" />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                <div className="flex flex-col">
                                  <span>{m.name}</span>
                                  <span className="text-xs text-slate-500">{m.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Step 3: System Prompt */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Sparkles className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">System Prompt</h2>
                  <p className="text-sm text-slate-400">Define how your agent should behave</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">System Prompt *</Label>
                  <Textarea
                    id="systemPrompt"
                    placeholder="You are a helpful customer support assistant for..."
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="bg-slate-800 border-slate-700 min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500">
                    This prompt defines your agent&apos;s personality, knowledge constraints, and
                    response style.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="temperature">Temperature: {temperature}</Label>
                    <Input
                      id="temperature"
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="bg-slate-800"
                    />
                    <p className="text-xs text-slate-500">
                      Lower = more focused, Higher = more creative
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxTokens">Max Tokens</Label>
                    <Select
                      value={maxTokens.toString()}
                      onValueChange={(v) => setMaxTokens(parseInt(v))}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700">
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
                    <p className="text-xs text-slate-500">Maximum response length</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Knowledge Base */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Database className="h-6 w-6 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Knowledge Base (Optional)</h2>
                  <p className="text-sm text-slate-400">
                    Attach a knowledge base for RAG capabilities
                  </p>
                </div>
              </div>

              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : knowledgeBases.length > 0 ? (
                <RadioGroup
                  value={knowledgeBaseId || ''}
                  onValueChange={(v) => setKnowledgeBaseId(v || null)}
                  className="space-y-3"
                >
                  <div className="relative">
                    <RadioGroupItem value="" id="no-kb" className="peer sr-only" />
                    <Label
                      htmlFor="no-kb"
                      className={cn(
                        'flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors',
                        'bg-slate-800/50 border-slate-700 hover:border-slate-600',
                        'peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-500/10'
                      )}
                    >
                      <span className="text-slate-400">No knowledge base</span>
                    </Label>
                  </div>

                  {knowledgeBases.map((kb) => (
                    <div key={kb.id} className="relative">
                      <RadioGroupItem value={kb.id} id={kb.id} className="peer sr-only" />
                      <Label
                        htmlFor={kb.id}
                        className={cn(
                          'flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-colors',
                          'bg-slate-800/50 border-slate-700 hover:border-slate-600',
                          'peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-500/10'
                        )}
                      >
                        <div>
                          <span className="font-medium text-white">{kb.name}</span>
                          {kb.description && (
                            <p className="text-sm text-slate-400 mt-1">{kb.description}</p>
                          )}
                        </div>
                        <Badge variant="outline">{kb.document_count} documents</Badge>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-4">No knowledge bases found</p>
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/services/ai-agents/knowledge-bases/new">
                      Create Knowledge Base
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Review */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <CheckCircle2 className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Review & Create</h2>
                  <p className="text-sm text-slate-400">Review your agent configuration</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-slate-800/50 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Name</span>
                    <span className="text-white font-medium">{name}</span>
                  </div>
                  {description && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Description</span>
                      <span className="text-white">{description}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Model</span>
                    <span className="text-white">
                      {usePlatformBilling && selectedPlatformModel 
                        ? `${selectedPlatformModel.name} (${selectedPlatformModel.provider})`
                        : model
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Billing Mode</span>
                    <span className="text-white">
                      {usePlatformBilling ? (
                        <span className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-green-400" />
                          Platform Billing
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-yellow-400" />
                          Own API Key
                        </span>
                      )}
                    </span>
                  </div>
                  {usePlatformBilling && selectedPlatformModel && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pricing</span>
                      <span className="text-white text-sm">
                        <span className="text-green-400">{selectedPlatformModel.pricing.inputFormatted}</span>
                        {' / '}
                        <span className="text-orange-400">{selectedPlatformModel.pricing.outputFormatted}</span>
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Temperature</span>
                    <span className="text-white">{temperature}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Max Tokens</span>
                    <span className="text-white">{maxTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Knowledge Base</span>
                    <span className="text-white">{selectedKb?.name || 'None'}</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-800/50">
                  <p className="text-sm text-slate-400 mb-2">System Prompt</p>
                  <p className="text-sm text-white whitespace-pre-wrap font-mono">{systemPrompt}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={prevStep} disabled={currentStep === 1 || creating}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        {currentStep < STEPS.length ? (
          <Button onClick={nextStep}>
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Bot className="h-4 w-4 mr-2" />
                Create Agent
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
