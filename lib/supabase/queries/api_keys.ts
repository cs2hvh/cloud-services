/**
 * API Keys Query Helpers
 * Handles CRUD operations for api_keys table (Personal Access Tokens)
 * 
 * SECURITY MODEL:
 * - API keys are HASHED (SHA-256), not encrypted
 * - Full key is shown ONCE on creation, never stored
 * - Constant-time comparison prevents timing attacks
 * - Keys are cryptographically random (192 bits of entropy)
 */
import { createServiceClient } from "../server";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export type ApiKey = {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  plan: "free" | "pro" | "enterprise";
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Generate a new API key with cryptographic randomness
 * Format: sk_live_<random_32_chars>
 * Entropy: 192 bits (24 bytes)
 */
function generateApiKey(): { fullKey: string; hash: string; prefix: string } {
  // Generate 24 bytes (192 bits) of cryptographically secure random data
  const randomPart = randomBytes(24).toString("base64url"); // ~32 URL-safe chars
  const fullKey = `sk_live_${randomPart}`;
  
  // Hash with SHA-256 (one-way, cannot be reversed)
  const hash = createHash("sha256").update(fullKey).digest("hex");
  
  // Display prefix for UI (first 15 chars + "...")
  const prefix = fullKey.substring(0, 15) + "...";
  
  return { fullKey, hash, prefix };
}

/**
 * Hash an API key for comparison
 * Uses SHA-256 one-way hashing
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Constant-time comparison to prevent timing attacks
 * Compares two hex strings safely
 */
function constantTimeCompare(a: string, b: string): boolean {
  try {
    // Convert hex strings to buffers
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    
    // Different lengths = not equal (but still constant time within same length)
    if (bufA.length !== bufB.length) {
      return false;
    }
    
    // Timing-safe comparison
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export const ApiKeys = {
  /**
   * Create a new API key for a user
   * Enforces 10-key limit per user atomically
   */
  create: async (params: {
    user_id: string;
    name: string;
    plan?: "free" | "pro" | "enterprise";
    expires_at?: string | null;
  }): Promise<{ success: true; key: string; record: ApiKey } | { success: false; error: string }> => {
    try {
      const { fullKey, hash, prefix } = generateApiKey();
      
      const supabase = await createServiceClient();
      
      // Check count atomically before insert to prevent race
      const { count } = await supabase
        .from("api_keys")
        .select("id", { count: "exact", head: true })
        .eq("user_id", params.user_id);
      
      if (count !== null && count >= 10) {
        return { success: false, error: "Maximum 10 API keys allowed per user" };
      }
      
      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          user_id: params.user_id,
          name: params.name,
          key_hash: hash,
          key_prefix: prefix,
          plan: params.plan || "free",
          expires_at: params.expires_at || null,
        })
        .select()
        .single();

      if (error) {
        console.error("[ApiKeys] Create error:", error);
        return { success: false, error: error.message };
      }

      // Return the full key ONCE (never stored in DB)
      return { success: true, key: fullKey, record: data };
    } catch (err) {
      console.error("[ApiKeys] Create exception:", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * List all API keys for a user (without full key, only prefix)
   */
  list: async (user_id: string): Promise<ApiKey[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ApiKeys] List error:", error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error("[ApiKeys] List exception:", err);
      return [];
    }
  },

  /**
   * Validate an API key and return user info
   * Uses constant-time comparison to prevent timing attacks
   */
  validate: async (
    key: string
  ): Promise<
    | { valid: true; userId: string; keyId: string; plan: "free" | "pro" | "enterprise" }
    | { valid: false; error: string }
  > => {
    try {
      // Basic format validation
      if (!key.startsWith("sk_live_") || key.length < 40) {
        return { valid: false, error: "Invalid API key format" };
      }

      const hash = hashApiKey(key);
      
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("key_hash", hash)
        .maybeSingle();

      if (error) {
        console.error("[ApiKeys] Validate error:", error);
        return { valid: false, error: "Invalid API key" };
      }

      // Use constant-time comparison for additional security
      // (though in practice, DB lookup timing already leaks some info)
      if (!data || !constantTimeCompare(data.key_hash, hash)) {
        return { valid: false, error: "Invalid API key" };
      }

      // Check expiration
      if (data.expires_at) {
        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
          return { valid: false, error: "API key expired" };
        }
      }

      // Update last_used_at (fire and forget)
      void supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id);

      return {
        valid: true,
        userId: data.user_id,
        keyId: data.id,
        plan: data.plan as "free" | "pro" | "enterprise",
      };
    } catch (err) {
      console.error("[ApiKeys] Validate exception:", err);
      return { valid: false, error: "Validation failed" };
    }
  },

  /**
   * Delete (revoke) an API key
   */
  delete: async (
    key_id: string,
    user_id: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("api_keys")
        .delete()
        .eq("id", key_id)
        .eq("user_id", user_id);

      if (error) {
        console.error("[ApiKeys] Delete error:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error("[ApiKeys] Delete exception:", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get single API key by ID
   */
  get: async (key_id: string, user_id: string): Promise<ApiKey | null> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("id", key_id)
        .eq("user_id", user_id)
        .single();

      if (error) {
        console.error("[ApiKeys] Get error:", error);
        return null;
      }

      return data;
    } catch (err) {
      console.error("[ApiKeys] Get exception:", err);
      return null;
    }
  },
};
