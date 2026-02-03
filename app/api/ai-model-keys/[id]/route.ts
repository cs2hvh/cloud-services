/**
 * Model Keys - Single Key Operations
 * DELETE /api/ai-model-keys/[id] - Delete an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import { AgentModelKeys } from '@/lib/supabase/queries/ai_agents';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * DELETE /api/ai-model-keys/[id]
 * Delete an API key
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:model-keys-delete',
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429 }
      );
    }

    // Verify ownership
    const existing = await AgentModelKeys.get(id, auth.user!.id);
    if (!existing.success || !existing.data) {
      return NextResponse.json(
        { error: 'Key not found' },
        { status: 404 }
      );
    }

    const result = await AgentModelKeys.delete(id, auth.user!.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to delete key' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Key deleted successfully',
    });
  } catch (err) {
    console.error('[Model Keys] Delete error:', err);
    return NextResponse.json(
      { error: 'Failed to delete key' },
      { status: 500 }
    );
  }
}
