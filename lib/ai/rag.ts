/**
 * RAG (Retrieval-Augmented Generation) Pipeline
 * Handles document retrieval and context building for AI agents
 */

import { EmbeddingsService, getDefaultEmbeddingsService } from './embeddings';
import { ChunkSearchResult } from './types';

export interface RAGConfig {
  embeddingsService?: EmbeddingsService;
  similarityThreshold?: number;
  maxChunks?: number;
}

export interface RAGContext {
  chunks: ChunkSearchResult[];
  totalTokens: number;
}

/**
 * RAG Pipeline for document retrieval
 */
export class RAGPipeline {
  private embeddingsService: EmbeddingsService;
  private similarityThreshold: number;
  private maxChunks: number;

  constructor(config: RAGConfig = {}) {
    this.embeddingsService = config.embeddingsService || getDefaultEmbeddingsService();
    this.similarityThreshold = config.similarityThreshold || 0.7;
    this.maxChunks = config.maxChunks || 5;
  }

  /**
   * Generate embedding for a query
   */
  async embedQuery(query: string): Promise<number[]> {
    return this.embeddingsService.embedSingle(query);
  }

  /**
   * Format retrieved chunks into context string
   */
  formatContext(chunks: ChunkSearchResult[]): string {
    if (chunks.length === 0) return '';

    return chunks
      .map((chunk, i) => {
        const sourceInfo = chunk.metadata?.source
          ? ` (Source: ${chunk.metadata.source})`
          : '';
        return `[${i + 1}]${sourceInfo}\n${chunk.content}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Estimate tokens in context
   */
  estimateContextTokens(chunks: ChunkSearchResult[]): number {
    return chunks.reduce((total, chunk) => {
      return total + Math.ceil(chunk.content.length / 4);
    }, 0);
  }

  /**
   * Truncate context to fit within token budget
   */
  truncateContext(
    chunks: ChunkSearchResult[],
    maxTokens: number
  ): ChunkSearchResult[] {
    const result: ChunkSearchResult[] = [];
    let totalTokens = 0;

    for (const chunk of chunks) {
      const chunkTokens = Math.ceil(chunk.content.length / 4);
      if (totalTokens + chunkTokens > maxTokens) {
        // Try to include a truncated version
        const remainingTokens = maxTokens - totalTokens;
        if (remainingTokens > 100) {
          const truncatedContent = chunk.content.slice(0, remainingTokens * 4);
          result.push({
            ...chunk,
            content: truncatedContent + '...',
          });
        }
        break;
      }
      result.push(chunk);
      totalTokens += chunkTokens;
    }

    return result;
  }

  /**
   * Re-rank chunks using a simple scoring mechanism
   */
  reRankChunks(
    chunks: ChunkSearchResult[],
    query: string
  ): ChunkSearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    return [...chunks]
      .map(chunk => {
        const content = chunk.content.toLowerCase();
        
        // Count exact term matches
        let termScore = 0;
        for (const term of queryTerms) {
          if (term.length > 2) {
            const matches = (content.match(new RegExp(term, 'g')) || []).length;
            termScore += matches * 0.1;
          }
        }
        
        // Boost shorter chunks (more focused)
        const lengthBonus = 1 - (chunk.content.length / 10000);
        
        // Combined score
        const adjustedSimilarity = chunk.similarity + termScore + (lengthBonus * 0.05);
        
        return {
          ...chunk,
          similarity: Math.min(adjustedSimilarity, 1.0),
        };
      })
      .sort((a, b) => b.similarity - a.similarity);
  }
}

/**
 * Build system prompt with RAG context
 */
export function buildRAGSystemPrompt(
  basePrompt: string,
  context: string
): string {
  if (!context) return basePrompt;

  return `${basePrompt}

---
RELEVANT CONTEXT FROM KNOWLEDGE BASE:

${context}

---

Instructions for using context:
- Use the above context to answer the user's question when relevant
- If the context doesn't contain the answer, use your general knowledge
- When citing information from context, be accurate and don't embellish
- If unsure, acknowledge uncertainty rather than making up information`;
}

/**
 * Create a default RAG pipeline
 */
export function createRAGPipeline(config?: RAGConfig): RAGPipeline {
  return new RAGPipeline(config);
}
