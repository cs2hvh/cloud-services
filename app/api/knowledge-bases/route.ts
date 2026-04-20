/**
 * Knowledge Bases - List & Create Endpoints
 * GET /api/knowledge-bases - List user's knowledge bases
 * POST /api/knowledge-bases - Create a new knowledge base
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUserFromHeader } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import { AgentKnowledgeBases } from '@/lib/supabase/queries/ai_agents';
import { KnowledgeBaseInsert } from '@/lib/ai/types';
import { NotificationService, createServiceNotification } from '@/lib/notifications/service';
import { AuditLogService, getAuditContext } from '@/lib/audit';
import { z } from 'zod';
import { sanitizeValidationError, logError } from '@/lib/api/error-sanitizer';

// Validation schema for creating a knowledge base
const createKBSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  embedding_model: z.string().optional(),
  chunk_size: z.number().min(100).max(4000).optional(),
  chunk_overlap: z.number().min(0).max(1000).optional(),
  project_id: z.string().uuid().optional(),
});

/**
 * GET /api/knowledge-bases
 * List all knowledge bases for the authenticated user
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:kb-list',
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const knowledgeBases = await AgentKnowledgeBases.list_by_user(auth.user!.id);

    return NextResponse.json({
      success: true,
      data: knowledgeBases,
    });
  } catch (err) {
    console.error('[Knowledge Bases] List error:', err);
    return NextResponse.json(
      { error: 'Failed to list knowledge bases' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/knowledge-bases
 * Create a new knowledge base
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:kb-create',
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validation = createKBSchema.safeParse(body);
    
    if (!validation.success) {
      logError('POST /api/knowledge-bases validation', validation.error);
      return NextResponse.json(
        sanitizeValidationError(validation.error.errors),
        { status: 400 }
      );
    }

    const data = validation.data;

    // Create the knowledge base
    const payload: KnowledgeBaseInsert = {
      name: data.name,
      description: data.description,
      embedding_model: data.embedding_model || 'text-embedding-3-small',
      chunk_size: data.chunk_size || 1000,
      chunk_overlap: data.chunk_overlap || 200,
      user_id: auth.user!.id,
      project_id: data.project_id,
    };

    const result = await AgentKnowledgeBases.create(payload);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create knowledge base' },
        { status: 400 }
      );
    }

    // Get audit context
    const auditContext = getAuditContext(request);

    // Create audit log
    await AuditLogService.create({
      user_id: auth.user!.id,
      user_role: 'user',
      user_email: auth.user!.email,
      action: 'create',
      service_type: 'knowledge_base',
      service_id: result.data?.id,
      service_name: data.name,
      after_state: result.data as unknown as Record<string, unknown>,
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
      metadata: {
        embeddingModel: data.embedding_model || 'text-embedding-3-small',
        chunkSize: data.chunk_size || 1000,
        chunkOverlap: data.chunk_overlap || 200,
      },
    });

    // Create notification
    const notificationParams = createServiceNotification({
      userId: auth.user!.id,
      serviceType: 'knowledge_base',
      action: 'created',
      serviceName: data.name,
      serviceId: result.data?.id,
      metadata: {
        embeddingModel: data.embedding_model || 'text-embedding-3-small',
        chunkSize: data.chunk_size || 1000,
      },
    });
    await NotificationService.create(notificationParams);

    return NextResponse.json({
      success: true,
      data: result.data,
    }, { status: 201 });
  } catch (err) {
    console.error('[Knowledge Bases] Create error:', err);
    return NextResponse.json(
      { error: 'Failed to create knowledge base' },
      { status: 500 }
    );
  }
}
