/**
 * Model Keys - API Endpoints
 * CRUD operations for user's LLM API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import { AgentModelKeys } from '@/lib/supabase/queries/ai_agents';
import { createLLMClient } from '@/lib/ai';
import { z } from 'zod';

// Validation schema
const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['openrouter', 'openai', 'anthropic', 'google', 'mistral', 'custom']),
  api_key: z.string().min(10).max(500),
});

/**
 * GET /api/ai-model-keys
 * List user's model API keys (masked)
 */
export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:model-keys-list',
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429 }
      );
    }

    const keys = await AgentModelKeys.list_by_user(auth.user!.id);
    
    // Mask the API keys for security
    const maskedKeys = keys.map(key => ({
      id: key.id,
      name: key.name,
      provider: key.provider,
      is_valid: key.is_valid,
      last_verified_at: key.last_verified_at,
      created_at: key.created_at,
      // Show only last 4 characters
      api_key_preview: '••••••••' + key.api_key_encrypted.slice(-4),
    }));

    return NextResponse.json({
      success: true,
      data: maskedKeys,
    });
  } catch (err) {
    console.error('[Model Keys] List error:', err);
    return NextResponse.json(
      { error: 'Failed to list keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-model-keys
 * Add a new API key
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:model-keys-create',
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429 }
      );
    }

    const body = await request.json();
    console.log('[Model Keys] Received body:', JSON.stringify(body, null, 2));
    const validation = createKeySchema.safeParse(body);
    
    if (!validation.success) {
      console.log('[Model Keys] Validation errors:', JSON.stringify(validation.error.errors, null, 2));
      return NextResponse.json(
        { error: 'Validation error', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { name, provider, api_key } = validation.data;

    // Verify the API key works
    try {
      console.log('[Model Keys] Verifying API key for provider:', provider);
      const client = createLLMClient(provider, api_key);
      const isValid = await client.verifyApiKey();
      console.log('[Model Keys] Verification result:', isValid);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid API key - verification failed' },
          { status: 400 }
        );
      }
    } catch (verifyError) {
      console.error('[Model Keys] Verification error:', verifyError);
      return NextResponse.json(
        { error: 'Failed to verify API key: ' + String(verifyError) },
        { status: 400 }
      );
    }

    // Create the key
    console.log('[Model Keys] Creating key in database...');
    const result = await AgentModelKeys.create({
      name,
      provider,
      api_key,
      user_id: auth.user!.id,
    });

    console.log('[Model Keys] Create result:', result);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create key' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.data!.id,
        name: result.data!.name,
        provider: result.data!.provider,
        created_at: result.data!.created_at,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[Model Keys] Create error:', err);
    return NextResponse.json(
      { error: 'Failed to create key' },
      { status: 500 }
    );
  }
}
