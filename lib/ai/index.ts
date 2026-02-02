/**
 * AI Agents - Module Index
 * Re-exports all AI-related modules
 */

// Types
export * from './types';

// Models Configuration
export * from './models';

// LLM Clients
export {
  OpenRouterClient,
  OpenAIClient,
  createLLMClient,
  getDefaultOpenRouterClient,
  buildMessages,
  type OpenRouterConfig,
} from './openrouter';

// Embeddings
export {
  EmbeddingsService,
  getDefaultEmbeddingsService,
  estimateTokenCount,
  splitIntoTokenChunks,
  type EmbeddingsConfig,
} from './embeddings';

// Chunking
export {
  splitText,
  splitMarkdown,
  chunkDocument,
  mergeSmallChunks,
  type ChunkingOptions,
  type Chunk,
} from './chunking';

// RAG Pipeline
export {
  RAGPipeline,
  buildRAGSystemPrompt,
  createRAGPipeline,
  type RAGConfig,
  type RAGContext,
} from './rag';
