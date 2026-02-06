/**
 * AI Agents - Supabase Query Helpers
 * CRUD operations for AI agents and related entities
 */

import { createServiceClient, createWorkerClient } from '../server';
import { Encryption, EncryptedData } from '@/config/functions';
import {
  AIAgent,
  AIAgentInsert,
  AIAgentUpdate,
  KnowledgeBase,
  KnowledgeBaseInsert,
  KnowledgeBaseUpdate,
  KBDocument,
  KBDocumentInsert,
  KBChunk,
  ModelKey,
  ModelKeyInsert,
  Conversation,
  ConversationInsert,
  Message,
  MessageInsert,
  ChunkSearchResult,
  Usage,
  AgentApiKey,
  AgentApiKeyInsert,
  AgentApiKeyWithRawKey,
  PlatformModel,
  PlatformModelInsert,
  PlatformModelUpdate,
} from '@/lib/ai/types';
import crypto from 'crypto';

// ============================================================
// ENCRYPTION HELPERS
// ============================================================

const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not configured');
  return key;
};

const encryptApiKey = (apiKey: string): string => {
  const key = getEncryptionKey();
  const encrypted = Encryption.encrypt(apiKey, key);
  return JSON.stringify(encrypted);
};

const decryptApiKey = (encryptedKey: string): string => {
  try {
    const key = getEncryptionKey();
    const encryptedData: EncryptedData = JSON.parse(encryptedKey);
    return Encryption.decrypt(encryptedData, key);
  } catch {
    return encryptedKey;
  }
};

// Helper to get schema-prefixed supabase client
// Helper to get schema-prefixed supabase client for 'agents' schema
const getAgentsDb = async () => {
  const supabase = await createWorkerClient();
  // Cast to 'any' to allow 'agents' schema - the schema exists but types aren't generated for it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).schema('agents');
};

// ============================================================
// MODEL KEYS
// ============================================================

export const AgentModelKeys = {
  create: async (payload: Omit<ModelKeyInsert, 'api_key_encrypted'> & { api_key: string }) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('model_keys')
        .insert({
          name: payload.name,
          provider: payload.provider,
          api_key_encrypted: encryptApiKey(payload.api_key),
          user_id: payload.user_id,
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as ModelKey };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  list_by_user: async (user_id: string): Promise<ModelKey[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('model_keys')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AgentModelKeys] Error listing keys:', error.message);
        return [];
      }
      return (data || []) as ModelKey[];
    } catch (err) {
      console.error('[AgentModelKeys] Error listing keys:', err);
      return [];
    }
  },

  get: async (id: string, user_id: string) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('model_keys')
        .select('*')
        .eq('id', id)
        .eq('user_id', user_id)
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as ModelKey };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  get_decrypted_key: async (id: string): Promise<string | null> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('model_keys')
        .select('api_key_encrypted')
        .eq('id', id)
        .single();

      if (error || !data) return null;
      return decryptApiKey(data.api_key_encrypted);
    } catch {
      return null;
    }
  },

  get_key_with_provider: async (id: string): Promise<{ apiKey: string; provider: string } | null> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('model_keys')
        .select('api_key_encrypted, provider')
        .eq('id', id)
        .single();

      if (error || !data) return null;
      const apiKey = decryptApiKey(data.api_key_encrypted);
      if (!apiKey) return null;
      return { apiKey, provider: data.provider };
    } catch {
      return null;
    }
  },

  delete: async (id: string, user_id: string) => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('model_keys')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  update_validity: async (id: string, is_valid: boolean) => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('model_keys')
        .update({
          is_valid,
          last_verified_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

// ============================================================
// KNOWLEDGE BASES
// ============================================================

export const AgentKnowledgeBases = {
  create: async (payload: KnowledgeBaseInsert) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('knowledge_bases')
        .insert(payload)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as KnowledgeBase };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  list_by_user: async (user_id: string): Promise<KnowledgeBase[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('knowledge_bases')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AgentKnowledgeBases] Error listing:', error.message);
        return [];
      }
      return (data || []) as KnowledgeBase[];
    } catch (err) {
      console.error('[AgentKnowledgeBases] Error listing:', err);
      return [];
    }
  },

  get: async (id: string, user_id: string) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('knowledge_bases')
        .select('*')
        .eq('id', id)
        .eq('user_id', user_id)
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as KnowledgeBase };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  update: async (id: string, user_id: string, patch: KnowledgeBaseUpdate) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('knowledge_bases')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user_id)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as KnowledgeBase };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  delete: async (id: string, user_id: string) => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('knowledge_bases')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  update_stats: async (id: string, stats: {
    document_count?: number;
    chunk_count?: number;
    total_tokens?: number;
    status?: string;
  }) => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('knowledge_bases')
        .update({
          ...stats,
          last_indexed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

// ============================================================
// KNOWLEDGE BASE DOCUMENTS
// ============================================================

export const AgentKBDocuments = {
  create: async (payload: KBDocumentInsert) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('kb_documents')
        .insert(payload)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as KBDocument };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  list_by_kb: async (knowledge_base_id: string): Promise<KBDocument[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('kb_documents')
        .select('*')
        .eq('knowledge_base_id', knowledge_base_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AgentKBDocuments] Error listing:', error.message);
        return [];
      }
      return (data || []) as KBDocument[];
    } catch (err) {
      console.error('[AgentKBDocuments] Error listing:', err);
      return [];
    }
  },

  get: async (id: string) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('kb_documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as KBDocument };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  update_status: async (id: string, status: string, error_message?: string, chunk_count?: number) => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('kb_documents')
        .update({
          status,
          error_message: error_message || null,
          chunk_count: chunk_count || 0,
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  delete: async (id: string) => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('kb_documents')
        .delete()
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

// ============================================================
// KNOWLEDGE BASE CHUNKS
// ============================================================

export const AgentKBChunks = {
  create_batch: async (chunks: {
    knowledge_base_id: string;
    document_id: string;
    content: string;
    embedding: number[];
    chunk_index: number;
    token_count: number;
    metadata?: Record<string, unknown>;
  }[]) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('kb_chunks')
        .insert(chunks)
        .select();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as KBChunk[] };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  delete_by_document: async (document_id: string) => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('kb_chunks')
        .delete()
        .eq('document_id', document_id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  search: async (
    kb_ids: string[],
    query_embedding: number[],
    match_count: number = 5
  ): Promise<ChunkSearchResult[]> => {
    try {
      const supabase = await createServiceClient();
      
      // Query chunks from knowledge bases
      const { data, error } = await supabase
        .schema('agents')
        .from('kb_chunks')
        .select('id, knowledge_base_id, document_id, content, metadata')
        .in('knowledge_base_id', kb_ids)
        .limit(match_count);

      if (error) {
        console.error('[AgentKBChunks] Search error:', error.message);
        return [];
      }
      
      if (data && data.length > 0) {
        return data.map(c => ({
          id: c.id,
          knowledge_base_id: c.knowledge_base_id,
          document_id: c.document_id,
          content: c.content,
          metadata: c.metadata,
          similarity: 0.9,
        }));
      }
      
      return [];
    } catch (err) {
      console.error('[AgentKBChunks] Search error:', err);
      return [];
    }
  },
};

// ============================================================
// AI AGENTS
// ============================================================

export const AIAgents = {
  create: async (payload: AIAgentInsert) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('ai_agents')
        .insert(payload)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as AIAgent };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  list_by_user: async (user_id: string): Promise<AIAgent[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('ai_agents')
        .select('*')
        .eq('user_id', user_id)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AIAgents] Error listing:', error.message);
        return [];
      }
      return (data || []) as AIAgent[];
    } catch (err) {
      console.error('[AIAgents] Error listing:', err);
      return [];
    }
  },

  list_by_project: async (project_id: string): Promise<AIAgent[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('ai_agents')
        .select('*')
        .eq('project_id', project_id)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AIAgents] Error listing by project:', error.message);
        return [];
      }
      return (data || []) as AIAgent[];
    } catch (err) {
      console.error('[AIAgents] Error listing by project:', err);
      return [];
    }
  },

  get: async (id: string, user_id: string) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('ai_agents')
        .select('*')
        .eq('id', id)
        .eq('user_id', user_id)
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as AIAgent };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  get_by_endpoint: async (endpoint_id: string) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('ai_agents')
        .select('*')
        .eq('endpoint_id', endpoint_id)
        .eq('status', 'active')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as AIAgent };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  update: async (id: string, user_id: string, patch: AIAgentUpdate) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('ai_agents')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user_id)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as AIAgent };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  delete: async (id: string, user_id: string) => {
    try {
      const db = await getAgentsDb();
      // Soft delete
      const { error } = await db
        .from('ai_agents')
        .update({ status: 'deleted' })
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  count_by_user: async (user_id: string): Promise<number> => {
    try {
      const db = await getAgentsDb();
      const { count, error } = await db
        .from('ai_agents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .neq('status', 'deleted');

      if (error) {
        console.error('[AIAgents] Error counting:', error.message);
        return 0;
      }
      return count || 0;
    } catch (err) {
      console.error('[AIAgents] Error counting:', err);
      return 0;
    }
  },

  generate_endpoint_id: async (): Promise<string> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase.rpc('generate_endpoint_id');

      if (error) throw error;
      return data as string;
    } catch {
      // Fallback to local generation
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 12; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
      }
      return result;
    }
  },
};

// ============================================================
// CONVERSATIONS
// ============================================================

export const AgentConversations = {
  create: async (payload: ConversationInsert) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('conversations')
        .insert(payload)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as Conversation };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  get: async (id: string) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as Conversation };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  list_by_agent: async (agent_id: string, limit = 50): Promise<Conversation[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('conversations')
        .select('*')
        .eq('agent_id', agent_id)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[AgentConversations] Error listing:', error.message);
        return [];
      }
      return (data || []) as Conversation[];
    } catch (err) {
      console.error('[AgentConversations] Error listing:', err);
      return [];
    }
  },

  update_stats: async (id: string, message_count: number, total_tokens: number) => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('conversations')
        .update({ message_count, total_tokens })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

// ============================================================
// MESSAGES
// ============================================================

export const AgentMessages = {
  create: async (payload: MessageInsert) => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('messages')
        .insert(payload)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as Message };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  list_by_conversation: async (conversation_id: string): Promise<Message[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[AgentMessages] Error listing:', error.message);
        return [];
      }
      return (data || []) as Message[];
    } catch (err) {
      console.error('[AgentMessages] Error listing:', err);
      return [];
    }
  },

  get_recent: async (conversation_id: string, limit = 10): Promise<Message[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[AgentMessages] Error getting recent:', error.message);
        return [];
      }
      return ((data || []) as Message[]).reverse();
    } catch (err) {
      console.error('[AgentMessages] Error getting recent:', err);
      return [];
    }
  },
};

// ============================================================
// USAGE
// ============================================================

export const AgentUsage = {
  record: async (
    agent_id: string,
    user_id: string,
    prompt_tokens: number,
    completion_tokens: number,
    cost: number
  ) => {
    try {
      const db = await getAgentsDb();
      const today = new Date().toISOString().split('T')[0];
      const total_tokens = prompt_tokens + completion_tokens;

      // Check if row exists for today
      const { data: existing } = await db
        .from('usage')
        .select('id, request_count, prompt_tokens, completion_tokens, total_tokens, estimated_cost')
        .eq('agent_id', agent_id)
        .eq('date', today)
        .single();

      if (existing) {
        // Update existing row
        const { error } = await db
          .from('usage')
          .update({
            request_count: existing.request_count + 1,
            prompt_tokens: existing.prompt_tokens + prompt_tokens,
            completion_tokens: existing.completion_tokens + completion_tokens,
            total_tokens: existing.total_tokens + total_tokens,
            estimated_cost: existing.estimated_cost + cost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          console.error('[AgentUsage] Error updating usage:', error.message);
          return { success: false, error: error.message };
        }
      } else {
        // Insert new row
        const { error } = await db
          .from('usage')
          .insert({
            agent_id,
            user_id,
            date: today,
            request_count: 1,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost: cost,
          });

        if (error) {
          console.error('[AgentUsage] Error inserting usage:', error.message);
          return { success: false, error: error.message };
        }
      }
      
      return { success: true };
    } catch (err) {
      console.error('[AgentUsage] Exception recording usage:', err);
      return { success: false, error: String(err) };
    }
  },

  get_by_agent: async (agent_id: string, days = 30): Promise<Usage[]> => {
    try {
      const db = await getAgentsDb();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await db
        .from('usage')
        .select('*')
        .eq('agent_id', agent_id)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) {
        console.error('[AgentUsage] Error getting:', error.message);
        return [];
      }
      return (data || []) as Usage[];
    } catch (err) {
      console.error('[AgentUsage] Error getting:', err);
      return [];
    }
  },

  get_user_total: async (user_id: string, days = 30) => {
    try {
      const db = await getAgentsDb();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await db
        .from('usage')
        .select('request_count, total_tokens, estimated_cost')
        .eq('user_id', user_id)
        .gte('date', startDate.toISOString().split('T')[0]);

      if (error) {
        console.error('[AgentUsage] Error getting total:', error.message);
        return { requests: 0, tokens: 0, cost: 0 };
      }

      const totals = (data || []).reduce(
        (acc, row) => ({
          requests: acc.requests + (row.request_count || 0),
          tokens: acc.tokens + (row.total_tokens || 0),
          cost: acc.cost + parseFloat(row.estimated_cost || '0'),
        }),
        { requests: 0, tokens: 0, cost: 0 }
      );

      return totals;
    } catch (err) {
      console.error('[AgentUsage] Error getting total:', err);
      return { requests: 0, tokens: 0, cost: 0 };
    }
  },
};

// ============================================================
// AGENT API KEYS
// ============================================================

const generateApiKey = (): { rawKey: string; keyHash: string; keyPrefix: string } => {
  // Generate a secure random key (32 bytes = 256 bits, base64 encoded)
  const rawKey = `ak_${crypto.randomBytes(32).toString('base64url')}`;
  // Hash it for storage
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  // Store prefix for display (first 8 chars after 'ak_')
  const keyPrefix = rawKey.substring(0, 11); // 'ak_' + 8 chars
  return { rawKey, keyHash, keyPrefix };
};

const hashApiKey = (rawKey: string): string => {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
};

export const AgentApiKeys = {
  /**
   * Create a new API key for an agent or all user's agents
   * @returns The key with rawKey - shown only once to the user!
   */
  create: async (
    name: string,
    user_id: string,
    agent_id?: string,
    expires_at?: string
  ): Promise<{ success: boolean; data?: AgentApiKeyWithRawKey; error?: string }> => {
    try {
      const db = await getAgentsDb();
      const { rawKey, keyHash, keyPrefix } = generateApiKey();

      const insertData: AgentApiKeyInsert = {
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        user_id,
        ...(agent_id && { agent_id }),
        ...(expires_at && { expires_at }),
      };

      const { data, error } = await db
        .from('agent_api_keys')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('[AgentApiKeys] Error creating:', error.message);
        return { success: false, error: error.message };
      }

      // Return with the raw key - this is the only time it's available!
      return {
        success: true,
        data: { ...data, rawKey } as AgentApiKeyWithRawKey,
      };
    } catch (err) {
      console.error('[AgentApiKeys] Error creating:', err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * List all API keys for a user (without the raw key)
   */
  list_by_user: async (user_id: string): Promise<AgentApiKey[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('agent_api_keys')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AgentApiKeys] Error listing:', error.message);
        return [];
      }
      return (data || []) as AgentApiKey[];
    } catch (err) {
      console.error('[AgentApiKeys] Error listing:', err);
      return [];
    }
  },

  /**
   * List API keys for a specific agent
   */
  list_by_agent: async (agent_id: string): Promise<AgentApiKey[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('agent_api_keys')
        .select('*')
        .or(`agent_id.eq.${agent_id},agent_id.is.null`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AgentApiKeys] Error listing by agent:', error.message);
        return [];
      }
      return (data || []) as AgentApiKey[];
    } catch (err) {
      console.error('[AgentApiKeys] Error listing by agent:', err);
      return [];
    }
  },

  /**
   * Validate an API key and return the key record if valid
   * @param rawKey The raw API key from the request header
   * @param agent_id Optional agent ID to check if key is authorized for this agent
   */
  validate: async (
    rawKey: string,
    agent_id?: string
  ): Promise<{ valid: boolean; key?: AgentApiKey; error?: string }> => {
    try {
      const db = await getAgentsDb();
      const keyHash = hashApiKey(rawKey);

      const { data, error } = await db
        .from('agent_api_keys')
        .select('*')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return { valid: false, error: 'Invalid API key' };
      }

      const key = data as AgentApiKey;

      // Check expiration
      if (key.expires_at && new Date(key.expires_at) < new Date()) {
        return { valid: false, error: 'API key has expired' };
      }

      // Check agent scope if provided
      if (agent_id && key.agent_id && key.agent_id !== agent_id) {
        return { valid: false, error: 'API key not authorized for this agent' };
      }

      return { valid: true, key };
    } catch (err) {
      console.error('[AgentApiKeys] Error validating:', err);
      return { valid: false, error: String(err) };
    }
  },

  /**
   * Update request count and last used timestamp
   */
  record_usage: async (key_id: string): Promise<void> => {
    try {
      const supabase = await createServiceClient();
      await supabase.rpc('increment_api_key_usage', { p_key_id: key_id });
    } catch (err) {
      console.error('[AgentApiKeys] Error recording usage:', err);
    }
  },

  /**
   * Deactivate (soft delete) an API key
   */
  deactivate: async (
    id: string,
    user_id: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('agent_api_keys')
        .update({ is_active: false })
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) {
        console.error('[AgentApiKeys] Error deactivating:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error('[AgentApiKeys] Error deactivating:', err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Permanently delete an API key
   */
  delete: async (
    id: string,
    user_id: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const db = await getAgentsDb();
      const { error } = await db
        .from('agent_api_keys')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) {
        console.error('[AgentApiKeys] Error deleting:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error('[AgentApiKeys] Error deleting:', err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get a single API key by ID
   */
  get: async (id: string, user_id: string): Promise<AgentApiKey | null> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('agent_api_keys')
        .select('*')
        .eq('id', id)
        .eq('user_id', user_id)
        .single();

      if (error) {
        console.error('[AgentApiKeys] Error getting:', error.message);
        return null;
      }
      return data as AgentApiKey;
    } catch (err) {
      console.error('[AgentApiKeys] Error getting:', err);
      return null;
    }
  },
};

// ============================================================
// PLATFORM MODELS (OpenRouter)
// ============================================================

export const PlatformModels = {
  /**
   * Get all active platform models (for user selection)
   */
  list_active: async (): Promise<PlatformModel[]> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('platform_models')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('[PlatformModels] Error listing:', error.message);
        return [];
      }
      return (data || []) as PlatformModel[];
    } catch (err) {
      console.error('[PlatformModels] Error listing:', err);
      return [];
    }
  },

  /**
   * Get all platform models including inactive (for admin)
   */
  list_all: async (): Promise<PlatformModel[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .schema('agents')
        .from('platform_models')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('[PlatformModels] Error listing all:', error.message);
        return [];
      }
      return (data || []) as PlatformModel[];
    } catch (err) {
      console.error('[PlatformModels] Error listing all:', err);
      return [];
    }
  },

  /**
   * Get a single model by ID
   */
  get: async (id: string): Promise<PlatformModel | null> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .schema('agents')
        .from('platform_models')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('[PlatformModels] Error getting:', error.message);
        return null;
      }
      return data as PlatformModel;
    } catch (err) {
      console.error('[PlatformModels] Error getting:', err);
      return null;
    }
  },

  /**
   * Get a model by model_id (e.g., "openai/gpt-5-nano")
   */
  get_by_model_id: async (model_id: string): Promise<PlatformModel | null> => {
    try {
      const db = await getAgentsDb();
      const { data, error } = await db
        .from('platform_models')
        .select('*')
        .eq('model_id', model_id)
        .single();

      if (error) {
        console.error('[PlatformModels] Error getting by model_id:', error.message);
        return null;
      }
      return data as PlatformModel;
    } catch (err) {
      console.error('[PlatformModels] Error getting by model_id:', err);
      return null;
    }
  },

  /**
   * Create a new platform model (admin only)
   */
  create: async (payload: PlatformModelInsert): Promise<{ success: boolean; data?: PlatformModel; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .schema('agents')
        .from('platform_models')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[PlatformModels] Error creating:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as PlatformModel };
    } catch (err) {
      console.error('[PlatformModels] Error creating:', err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Update a platform model (admin only)
   */
  update: async (id: string, payload: PlatformModelUpdate): Promise<{ success: boolean; data?: PlatformModel; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .schema('agents')
        .from('platform_models')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[PlatformModels] Error updating:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as PlatformModel };
    } catch (err) {
      console.error('[PlatformModels] Error updating:', err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Delete a platform model (admin only)
   */
  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .schema('agents')
        .from('platform_models')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[PlatformModels] Error deleting:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error('[PlatformModels] Error deleting:', err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Toggle model active status (admin only)
   */
  toggle_active: async (id: string, is_active: boolean): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .schema('agents')
        .from('platform_models')
        .update({ is_active })
        .eq('id', id);

      if (error) {
        console.error('[PlatformModels] Error toggling:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error('[PlatformModels] Error toggling:', err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Calculate cost for token usage
   */
  calculate_cost: (model: PlatformModel, input_tokens: number, output_tokens: number): number => {
    const inputCost = (input_tokens / 1_000_000) * model.input_cost_per_million;
    const outputCost = (output_tokens / 1_000_000) * model.output_cost_per_million;
    return inputCost + outputCost;
  },
};
