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

// Document Parsers
export {
  parseDocument,
  isFileSupported,
  getContentType,
  isBinaryFile,
  getFileExtension,
  getSupportedFileTypes,
  getAcceptedExtensions,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
  MAX_FILE_SIZES,
  type ParsedDocument,
  type ParseOptions,
} from './document-parsers';

// RAG Pipeline
export {
  RAGPipeline,
  buildRAGSystemPrompt,
  createRAGPipeline,
  type RAGConfig,
  type RAGContext,
} from './rag';
