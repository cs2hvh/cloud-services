/**
 * AI Agents - Type Definitions
 * TypeScript types for the AI Agents platform
 */

// ============================================================
// ENUMS
// ============================================================

export type AgentStatus = 'active' | 'paused' | 'deleted';
export type KnowledgeBaseStatus = 'pending' | 'indexing' | 'ready' | 'error';
export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'error';
export type ModelProvider = 'openrouter' | 'openai' | 'anthropic' | 'google' | 'mistral' | 'custom';
export type MessageRole = 'user' | 'assistant' | 'system';

// ============================================================
// MODEL CONFIGURATION
// ============================================================

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  contextWindow: number;
  // No price here on purpose: inference.models.pricing is the single source,
  // read at request time. A copy in code is a copy that drifts.
  supportsStreaming: boolean;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
}

export interface ModelKey {
  id: string;
  name: string;
  provider: ModelProvider;
  api_key_encrypted: string;
  user_id: string;
  is_valid: boolean;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelKeyInsert {
  name: string;
  provider: ModelProvider;
  api_key_encrypted: string;
  user_id: string;
}

// ============================================================
// PLATFORM MODELS (OpenRouter)
// ============================================================

export interface PlatformModel {
  id: string;
  model_id: string;
  display_name: string;
  provider: string;
  description: string | null;
  input_cost_per_million: number;
  output_cost_per_million: number;
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

export interface PlatformModelInsert {
  model_id: string;
  display_name: string;
  provider: string;
  description?: string;
  input_cost_per_million: number;
  output_cost_per_million: number;
  context_window?: number;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_streaming?: boolean;
  is_active?: boolean;
  is_free?: boolean;
  sort_order?: number;
}

export interface PlatformModelUpdate {
  display_name?: string;
  provider?: string;
  description?: string;
  input_cost_per_million?: number;
  output_cost_per_million?: number;
  context_window?: number;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_streaming?: boolean;
  is_active?: boolean;
  is_free?: boolean;
  sort_order?: number;
}

// ============================================================
// KNOWLEDGE BASE
// ============================================================

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  document_count: number;
  chunk_count: number;
  total_tokens: number;
  status: KnowledgeBaseStatus;
  last_indexed_at: string | null;
  error_message: string | null;
  user_id: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseInsert {
  name: string;
  description?: string;
  embedding_model?: string;
  chunk_size?: number;
  chunk_overlap?: number;
  user_id: string;
  project_id?: string;
}

export interface KnowledgeBaseUpdate {
  name?: string;
  description?: string;
  embedding_model?: string;
  chunk_size?: number;
  chunk_overlap?: number;
  status?: KnowledgeBaseStatus;
  error_message?: string;
}

// ============================================================
// KNOWLEDGE BASE DOCUMENTS
// ============================================================

export interface KBDocument {
  id: string;
  knowledge_base_id: string;
  name: string;
  source_type: 'file' | 'url' | 'text';
  source_url: string | null;
  content_type: string | null;
  file_size: number | null;
  raw_content: string | null;
  storage_path: string | null;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface KBDocumentInsert {
  knowledge_base_id: string;
  name: string;
  source_type: 'file' | 'url' | 'text';
  source_url?: string;
  content_type?: string;
  file_size?: number;
  raw_content?: string;
  storage_path?: string | null;
}

// ============================================================
// KNOWLEDGE BASE CHUNKS
// ============================================================

export interface KBChunk {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  content: string;
  embedding: number[] | null;
  chunk_index: number;
  token_count: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChunkSearchResult {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

// ============================================================
// AI AGENTS
// ============================================================

export interface AIAgent {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  system_prompt: string;
  welcome_message: string | null;
  model_id: string;
  model_key_id: string | null;
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  knowledge_base_ids: string[];
  rag_enabled: boolean;
  similarity_threshold: number;
  max_context_chunks: number;
  endpoint_id: string;
  is_public: boolean;
  require_auth: boolean;
  allowed_origins: string[];
  rate_limit_rpm: number;
  user_id: string;
  project_id: string | null;
  status: AgentStatus;
  created_at: string;
  updated_at: string;
}

export interface AIAgentInsert {
  name: string;
  description?: string;
  avatar_url?: string;
  system_prompt: string;
  welcome_message?: string;
  model_id: string;
  model_key_id?: string | null;
  use_platform_billing?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  knowledge_base_ids?: string[];
  rag_enabled?: boolean;
  similarity_threshold?: number;
  max_context_chunks?: number;
  endpoint_id: string;
  is_public?: boolean;
  require_auth?: boolean;
  allowed_origins?: string[];
  rate_limit_rpm?: number;
  user_id: string;
  project_id?: string;
}

export interface AIAgentUpdate {
  name?: string;
  description?: string;
  avatar_url?: string;
  system_prompt?: string;
  welcome_message?: string;
  model_id?: string;
  model_key_id?: string | null;
  use_platform_billing?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  knowledge_base_ids?: string[];
  rag_enabled?: boolean;
  similarity_threshold?: number;
  max_context_chunks?: number;
  is_public?: boolean;
  require_auth?: boolean;
  allowed_origins?: string[];
  rate_limit_rpm?: number;
  status?: AgentStatus;
}

// ============================================================
// CONVERSATIONS
// ============================================================

export interface Conversation {
  id: string;
  agent_id: string;
  title: string | null;
  session_id: string | null;
  user_id: string | null;
  external_user_id: string | null;
  message_count: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationInsert {
  agent_id: string;
  title?: string;
  session_id?: string;
  user_id?: string;
  external_user_id?: string;
}

// ============================================================
// MESSAGES
// ============================================================

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  context_chunks: ChunkSearchResult[];
  model_used: string | null;
  created_at: string;
}

export interface MessageInsert {
  conversation_id: string;
  role: MessageRole;
  content: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  context_chunks?: ChunkSearchResult[];
  model_used?: string;
}

// ============================================================
// USAGE
// ============================================================

export interface Usage {
  id: string;
  agent_id: string;
  user_id: string;
  date: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  created_at: string;
  updated_at: string;
}

export interface UsageStats {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  daily_usage: {
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }[];
}

// ============================================================
// AGENT API KEYS
// ============================================================

export interface AgentApiKey {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  agent_id: string | null;
  user_id: string;
  is_active: boolean;
  expires_at: string | null;
  request_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentApiKeyInsert {
  name: string;
  key_hash: string;
  key_prefix: string;
  agent_id?: string;
  user_id: string;
  expires_at?: string;
}

export interface AgentApiKeyWithRawKey extends AgentApiKey {
  rawKey: string;
}

// ============================================================
// API TYPES
// ============================================================

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  session_id?: string;
  stream?: boolean;
  user_id?: string;
}

export interface ChatResponse {
  id: string;
  conversation_id: string;
  message: {
    role: 'assistant';
    content: string;
  };
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  context?: ChunkSearchResult[];
}

export interface CompletionRequest {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  id: string;
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================
// LLM PROVIDER TYPES
// ============================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionRequest {
  model: string;
  messages: LLMMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

export interface LLMCompletionResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMStreamChunk {
  id: string;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================
// EMBEDDING TYPES
// ============================================================

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface EmbeddingResponse {
  data: {
    object: 'embedding';
    embedding: number[];
    index: number;
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
