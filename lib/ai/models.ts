/**
 * AI Models Configuration
 * Defines available AI models and their properties
 */

import { AIModel, ModelProvider } from './types';

// ============================================================
// AVAILABLE MODELS
// ============================================================

export const AVAILABLE_MODELS: AIModel[] = [
  // OpenAI Models
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    inputCostPer1k: 0.005,
    outputCostPer1k: 0.015,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    contextWindow: 128000,
    inputCostPer1k: 0.01,
    outputCostPer1k: 0.03,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  
  // Anthropic Models
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    inputCostPer1k: 0.00025,
    outputCostPer1k: 0.00125,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  
  // Meta Llama Models (via OpenRouter)
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B Instruct',
    provider: 'openrouter',
    contextWindow: 131072,
    inputCostPer1k: 0.00052,
    outputCostPer1k: 0.00075,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B Instruct',
    provider: 'openrouter',
    contextWindow: 131072,
    inputCostPer1k: 0.00006,
    outputCostPer1k: 0.00006,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
  
  // Mistral Models (via OpenRouter)
  {
    id: 'mistralai/mistral-large-2411',
    name: 'Mistral Large',
    provider: 'openrouter',
    contextWindow: 128000,
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.006,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
  {
    id: 'mistralai/mistral-small-2409',
    name: 'Mistral Small',
    provider: 'openrouter',
    contextWindow: 128000,
    inputCostPer1k: 0.0002,
    outputCostPer1k: 0.0006,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
  {
    id: 'mistralai/mixtral-8x7b-instruct',
    name: 'Mixtral 8x7B',
    provider: 'openrouter',
    contextWindow: 32768,
    inputCostPer1k: 0.00024,
    outputCostPer1k: 0.00024,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
  
  // Google Models (via OpenRouter)
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    provider: 'openrouter',
    contextWindow: 2097152,
    inputCostPer1k: 0.00125,
    outputCostPer1k: 0.005,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'google/gemini-flash-1.5',
    name: 'Gemini Flash 1.5',
    provider: 'openrouter',
    contextWindow: 1000000,
    inputCostPer1k: 0.000075,
    outputCostPer1k: 0.0003,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  
  // DeepSeek Models (via OpenRouter)
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'openrouter',
    contextWindow: 64000,
    inputCostPer1k: 0.00014,
    outputCostPer1k: 0.00028,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'openrouter',
    contextWindow: 64000,
    inputCostPer1k: 0.00055,
    outputCostPer1k: 0.00219,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getModelById(modelId: string): AIModel | undefined {
  return AVAILABLE_MODELS.find(m => m.id === modelId);
}

export function getModelsByProvider(provider: ModelProvider): AIModel[] {
  return AVAILABLE_MODELS.filter(m => m.provider === provider);
}

export function calculateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const model = getModelById(modelId);
  if (!model) return 0;
  
  const inputCost = (promptTokens / 1000) * model.inputCostPer1k;
  const outputCost = (completionTokens / 1000) * model.outputCostPer1k;
  
  return inputCost + outputCost;
}

export function getDefaultModel(): AIModel {
  return AVAILABLE_MODELS.find(m => m.id === 'openai/gpt-4o-mini')!;
}

export function groupModelsByProvider(): Record<string, AIModel[]> {
  const groups: Record<string, AIModel[]> = {};
  
  for (const model of AVAILABLE_MODELS) {
    if (!groups[model.provider]) {
      groups[model.provider] = [];
    }
    groups[model.provider].push(model);
  }
  
  return groups;
}

// ============================================================
// EMBEDDING MODELS
// ============================================================

export const EMBEDDING_MODELS = {
  'text-embedding-3-small': {
    id: 'text-embedding-3-small',
    name: 'OpenAI Embedding Small',
    dimensions: 1536,
    costPer1k: 0.00002,
  },
  'text-embedding-3-large': {
    id: 'text-embedding-3-large',
    name: 'OpenAI Embedding Large',
    dimensions: 3072,
    costPer1k: 0.00013,
  },
  'text-embedding-ada-002': {
    id: 'text-embedding-ada-002',
    name: 'OpenAI Ada 002',
    dimensions: 1536,
    costPer1k: 0.0001,
  },
};

export type EmbeddingModelId = keyof typeof EMBEDDING_MODELS;

export function getEmbeddingModel(modelId: EmbeddingModelId) {
  return EMBEDDING_MODELS[modelId];
}
