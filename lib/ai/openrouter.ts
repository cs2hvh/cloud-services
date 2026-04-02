/**
 * OpenRouter API Client
 * Handles LLM completions via OpenRouter (supports 200+ models)
 */

import {
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  LLMMessage,
} from './types';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterConfig {
  apiKey: string;
  siteUrl?: string;
  siteName?: string;
}

export class OpenRouterClient {
  private apiKey: string;
  private siteUrl: string;
  private siteName: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.siteUrl = config.siteUrl || 'https://cloud.example.com';
    this.siteName = config.siteName || 'Cloud Services AI';
  }

  /**
   * Create a chat completion
   */
  async createCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.siteName,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenRouter API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Create a streaming chat completion - returns raw ReadableStream for direct piping
   * This is faster than the async generator version
   */
  createStreamingCompletionRaw(
    request: LLMCompletionRequest
  ): Promise<{ stream: ReadableStream<Uint8Array>; response: Response }> {
    return fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.siteName,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stream: true,
      }),
    }).then(response => {
      if (!response.ok) {
        return response.json().then(error => {
          throw new Error(error.error?.message || `OpenRouter API error: ${response.status}`);
        });
      }
      if (!response.body) throw new Error('No response body');
      return { stream: response.body, response };
    });
  }

  /**
   * Create a streaming chat completion
   */
  async *createStreamingCompletion(
    request: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.siteName,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenRouter API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            yield json as LLMStreamChunk;
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Verify API key is valid
   */
  async verifyApiKey(): Promise<boolean> {
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<{ id: string; name: string; context_length: number }[]> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }
}

/**
 * OpenAI-compatible API Client
 * For direct OpenAI API access
 */
export class OpenAIClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.openai.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async createCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model.replace('openai/', ''),
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    return response.json();
  }

  async *createStreamingCompletion(
    request: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model.replace('openai/', ''),
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            yield json as LLMStreamChunk;
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async verifyApiKey(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Unified LLM Client Factory
 * Creates the appropriate client based on provider
 */
export function createLLMClient(
  provider: 'openrouter' | 'openai' | 'anthropic' | 'google' | 'mistral' | 'custom',
  apiKey: string,
  customBaseUrl?: string
) {
  switch (provider) {
    case 'openrouter':
      return new OpenRouterClient({ apiKey });
    case 'openai':
      return new OpenAIClient(apiKey);
    case 'anthropic':
      // Anthropic models work through OpenRouter or direct API
      return new OpenRouterClient({ apiKey });
    case 'google':
      // Google Gemini - use OpenRouter for unified access
      return new OpenRouterClient({ apiKey });
    case 'mistral':
      // Mistral AI - use OpenRouter for unified access
      return new OpenRouterClient({ apiKey });
    case 'custom':
      if (!customBaseUrl) throw new Error('Custom provider requires baseUrl');
      return new OpenAIClient(apiKey, customBaseUrl);
    default:
      return new OpenRouterClient({ apiKey });
  }
}

/**
 * Get default OpenRouter client using platform API key
 */
export function getDefaultOpenRouterClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }
  return new OpenRouterClient({ apiKey });
}

/**
 * Build messages array for completion
 */
export function buildMessages(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: LLMMessage[] = [],
  contextChunks: string[] = []
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // System message with optional RAG context
  let systemContent = systemPrompt;
  
  if (contextChunks.length > 0) {
    systemContent += '\n\n---\nRelevant context from knowledge base:\n\n';
    systemContent += contextChunks.map((chunk, i) => `[${i + 1}] ${chunk}`).join('\n\n');
    systemContent += '\n---\n\nUse the above context to help answer the user\'s question. If the context doesn\'t contain relevant information, use your general knowledge.';
  }

  messages.push({ role: 'system', content: systemContent });

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push(msg);
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  return messages;
}
