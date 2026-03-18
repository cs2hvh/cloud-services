/**
 * AI Agents - Single Agent Endpoints
 * GET /api/ai-agents/[id] - Get agent details
 * PUT /api/ai-agents/[id] - Update agent
 * DELETE /api/ai-agents/[id] - Delete agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUserFromHeader } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import { AIAgents } from '@/lib/supabase/queries/ai_agents';
import { AIAgentUpdate } from '@/lib/ai/types';
import { NotificationService, createServiceNotification } from '@/lib/notifications/service';
import { AuditLogService, getAuditContext } from '@/lib/audit';
import { z } from 'zod';

// Validation schema for updating an agent
const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  system_prompt: z.string().min(10).max(10000).optional(),
  welcome_message: z.string().max(1000).optional().nullable(),
  model_id: z.string().min(1).optional(),
  model_key_id: z.string().uuid().optional().nullable(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(128000).optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  knowledge_base_ids: z.array(z.string().uuid()).optional(),
  rag_enabled: z.boolean().optional(),
  similarity_threshold: z.number().min(0).max(1).optional(),
  max_context_chunks: z.number().min(1).max(20).optional(),
  is_public: z.boolean().optional(),
  require_auth: z.boolean().optional(),
  allowed_origins: z.array(z.string()).optional(),
  rate_limit_rpm: z.number().min(1).optional(),
  status: z.enum(['active', 'paused']).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/ai-agents/[id]
 * Get agent details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:ai-agents-get',
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const result = await AIAgents.get(id, auth.user!.id);

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('[AI Agents] Get error:', err);
    return NextResponse.json(
      { error: 'Failed to get agent' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/ai-agents/[id]
 * Update agent settings
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:ai-agents-update',
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Check if agent exists and belongs to user
    const existing = await AIAgents.get(id, auth.user!.id);
    if (!existing.success || !existing.data) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validation = updateAgentSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation error', details: validation.error.errors },
        { status: 400 }
      );
    }

    const patch: AIAgentUpdate = {
      ...validation.data,
      description: validation.data.description === null ? undefined : validation.data.description,
      avatar_url: validation.data.avatar_url === null ? undefined : validation.data.avatar_url,
      welcome_message: validation.data.welcome_message === null ? undefined : validation.data.welcome_message,
    };

    const result = await AIAgents.update(id, auth.user!.id, patch);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update agent' },
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
      action: 'update',
      service_type: 'ai_agent',
      service_id: id,
      service_name: result.data?.name || existing.data.name,
      before_state: existing.data as unknown as Record<string, unknown>,
      after_state: result.data as unknown as Record<string, unknown>,
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
      metadata: {
        updatedFields: Object.keys(patch),
      },
    });

    // Determine update type for notification
    let updateType = 'agent_settings';
    if (patch.model_id) updateType = 'agent_model';
    else if (patch.system_prompt) updateType = 'agent_system_prompt';
    else if (patch.rag_enabled !== undefined) updateType = 'agent_rag';
    else if (patch.status) updateType = 'agent_status';

    // Create notification
    const notificationParams = createServiceNotification({
      userId: auth.user!.id,
      serviceType: 'ai_agent',
      action: 'updated',
      serviceName: result.data?.name || existing.data.name,
      serviceId: id,
      metadata: {
        updateType,
        modelId: patch.model_id,
        enabled: patch.rag_enabled,
        status: patch.status,
      },
    });
    await NotificationService.create(notificationParams);

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('[AI Agents] Update error:', err);
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-agents/[id]
 * Soft delete an agent
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:ai-agents-delete',
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Check if agent exists and belongs to user
    const existing = await AIAgents.get(id, auth.user!.id);
    if (!existing.success || !existing.data) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    const result = await AIAgents.delete(id, auth.user!.id);

    if (!result.success) {
      // Create failure notification
      const notificationParams = createServiceNotification({
        userId: auth.user!.id,
        serviceType: 'ai_agent',
        action: 'failed',
        serviceName: existing.data.name,
        serviceId: id,
        error: result.error || 'Failed to delete agent',
      });
      await NotificationService.create(notificationParams);

      return NextResponse.json(
        { error: result.error || 'Failed to delete agent' },
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
      action: 'delete',
      service_type: 'ai_agent',
      service_id: id,
      service_name: existing.data.name,
      before_state: existing.data as unknown as Record<string, unknown>,
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
      metadata: {
        endpointId: existing.data.endpoint_id,
        modelId: existing.data.model_id,
      },
    });

    // Create success notification
    const notificationParams = createServiceNotification({
      userId: auth.user!.id,
      serviceType: 'ai_agent',
      action: 'deleted',
      serviceName: existing.data.name,
      serviceId: id,
    });
    await NotificationService.create(notificationParams);

    return NextResponse.json({
      success: true,
      message: 'Agent deleted successfully',
    });
  } catch (err) {
    console.error('[AI Agents] Delete error:', err);
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    );
  }
}
