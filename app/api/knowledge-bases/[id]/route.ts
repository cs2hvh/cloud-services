/**
 * Knowledge Bases - Single KB Endpoints
 * GET /api/knowledge-bases/[id] - Get KB details
 * PUT /api/knowledge-bases/[id] - Update KB
 * DELETE /api/knowledge-bases/[id] - Delete KB
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import { AgentKnowledgeBases, AgentKBDocuments } from '@/lib/supabase/queries/ai_agents';
import { KnowledgeBaseUpdate } from '@/lib/ai/types';
import { NotificationService, createServiceNotification } from '@/lib/notifications/service';
import { z } from 'zod';

// Validation schema for updating a knowledge base
const updateKBSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  chunk_size: z.number().min(100).max(4000).optional(),
  chunk_overlap: z.number().min(0).max(1000).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/knowledge-bases/[id]
 * Get knowledge base details with documents
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:kb-get',
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const result = await AgentKnowledgeBases.get(id, auth.user!.id);

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: 'Knowledge base not found' },
        { status: 404 }
      );
    }

    // Also fetch documents
    const documents = await AgentKBDocuments.list_by_kb(id);

    return NextResponse.json({
      success: true,
      data: {
        ...result.data,
        documents,
      },
    });
  } catch (err) {
    console.error('[Knowledge Bases] Get error:', err);
    return NextResponse.json(
      { error: 'Failed to get knowledge base' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/knowledge-bases/[id]
 * Update knowledge base settings
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:kb-update',
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Check if KB exists and belongs to user
    const existing = await AgentKnowledgeBases.get(id, auth.user!.id);
    if (!existing.success || !existing.data) {
      return NextResponse.json(
        { error: 'Knowledge base not found' },
        { status: 404 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validation = updateKBSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation error', details: validation.error.errors },
        { status: 400 }
      );
    }

    const patch: KnowledgeBaseUpdate = validation.data;

    const result = await AgentKnowledgeBases.update(id, auth.user!.id, patch);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update knowledge base' },
        { status: 400 }
      );
    }

    // Create notification
    const notificationParams = createServiceNotification({
      userId: auth.user!.id,
      serviceType: 'knowledge_base',
      action: 'updated',
      serviceName: result.data?.name || existing.data.name,
      serviceId: id,
      metadata: {
        updateType: 'kb_settings',
        chunkSize: patch.chunk_size,
        chunkOverlap: patch.chunk_overlap,
      },
    });
    await NotificationService.create(notificationParams);

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('[Knowledge Bases] Update error:', err);
    return NextResponse.json(
      { error: 'Failed to update knowledge base' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/knowledge-bases/[id]
 * Delete a knowledge base and all its documents
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:kb-delete',
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Check if KB exists and belongs to user
    const existing = await AgentKnowledgeBases.get(id, auth.user!.id);
    if (!existing.success || !existing.data) {
      return NextResponse.json(
        { error: 'Knowledge base not found' },
        { status: 404 }
      );
    }

    const result = await AgentKnowledgeBases.delete(id, auth.user!.id);

    if (!result.success) {
      // Create failure notification
      const notificationParams = createServiceNotification({
        userId: auth.user!.id,
        serviceType: 'knowledge_base',
        action: 'failed',
        serviceName: existing.data.name,
        serviceId: id,
        error: result.error || 'Failed to delete knowledge base',
      });
      await NotificationService.create(notificationParams);

      return NextResponse.json(
        { error: result.error || 'Failed to delete knowledge base' },
        { status: 400 }
      );
    }

    // Create success notification
    const notificationParams = createServiceNotification({
      userId: auth.user!.id,
      serviceType: 'knowledge_base',
      action: 'deleted',
      serviceName: existing.data.name,
      serviceId: id,
    });
    await NotificationService.create(notificationParams);

    return NextResponse.json({
      success: true,
      message: 'Knowledge base deleted successfully',
    });
  } catch (err) {
    console.error('[Knowledge Bases] Delete error:', err);
    return NextResponse.json(
      { error: 'Failed to delete knowledge base' },
      { status: 500 }
    );
  }
}
