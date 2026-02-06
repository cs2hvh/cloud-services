/**
 * Embeddings Service
 * Generates vector embeddings for text using OpenAI
 */

import { EmbeddingResponse } from './types';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export interface EmbeddingsConfig {
  apiKey: string;
  model?: string;
}

export class EmbeddingsService {
  private apiKey: string;
  private model: string;

  constructor(config: EmbeddingsConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'text-embedding-3-small';
  }

  /**
   * Generate embeddings for a single text or array of texts
   */
  async embed(input: string | string[]): Promise<number[][]> {
    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
        model: this.model,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Embeddings API error: ${response.status}`);
    }

    const data: EmbeddingResponse = await response.json();
    return data.data.map(item => item.embedding);
  }

  /**
   * Generate embedding for a single text
   */
  async embedSingle(text: string): Promise<number[]> {
    const embeddings = await this.embed(text);
    return embeddings[0];
  }

  /**
   * Generate embeddings in batches (for large documents)
   */
  async embedBatch(
    texts: string[],
    batchSize = 100,
    onProgress?: (completed: number, total: number) => void
  ): Promise<number[][]> {
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await this.embed(batch);
      results.push(...embeddings);
      
      if (onProgress) {
        onProgress(Math.min(i + batchSize, texts.length), texts.length);
      }
      
      // Rate limiting - wait between batches
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
}

/**
 * Get default embeddings service using platform API key
 */
export function getDefaultEmbeddingsService(): EmbeddingsService {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY or OPENROUTER_API_KEY environment variable is not set');
  }
  return new EmbeddingsService({ apiKey });
}

/**
 * Count tokens in text (approximate)
 * Uses a simple heuristic - for accurate counting, use tiktoken
 */
export function estimateTokenCount(text: string): number {
  // Rough approximation: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks that fit within token limit
 */
export function splitIntoTokenChunks(
  text: string,
  maxTokensPerChunk: number = 8000
): string[] {
  const chunks: string[] = [];
  const maxCharsPerChunk = maxTokensPerChunk * 4; // Approximate
  
  let start = 0;
  while (start < text.length) {
    let end = start + maxCharsPerChunk;
    
    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const lastParagraph = text.lastIndexOf('\n\n', end);
      const lastSentence = text.lastIndexOf('. ', end);
      const lastNewline = text.lastIndexOf('\n', end);
      
      if (lastParagraph > start + maxCharsPerChunk / 2) {
        end = lastParagraph + 2;
      } else if (lastSentence > start + maxCharsPerChunk / 2) {
        end = lastSentence + 2;
      } else if (lastNewline > start + maxCharsPerChunk / 2) {
        end = lastNewline + 1;
      }
    }
    
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}
