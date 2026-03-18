/**
 * AI Agents - Single API Key Management
 * GET /api/ai-agents/api-keys/[id] - Get a single API key
 * DELETE /api/ai-agents/api-keys/[id] - Delete an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUserFromHeader } from '@/lib/auth/server-auth';
import { AgentApiKeys } from '@/lib/supabase/queries/ai_agents';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await authenticateUserFromHeader(request);
    if (!auth.authenticated) return auth.response;

    const key = await AgentApiKeys.get(id, auth.user!.id);

    if (!key) {
      return NextResponse.json(
        { success: false, error: 'API key not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: key,
    });
  } catch (error) {
    console.error('[API Keys GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch API key' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await authenticateUserFromHeader(request);
    if (!auth.authenticated) return auth.response;

    const result = await AgentApiKeys.delete(id, auth.user!.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error) {
    console.error('[API Keys DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
