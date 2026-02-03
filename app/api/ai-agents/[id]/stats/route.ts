/**
 * AI Agents - Agent Statistics
 * GET /api/ai-agents/[id]/stats - Get usage statistics for an agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import { AIAgents, AgentUsage, AgentConversations } from '@/lib/supabase/queries/ai_agents';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/ai-agents/[id]/stats
 * Get usage statistics for an agent
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:ai-agents-stats',
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
    const agent = await AIAgents.get(id, auth.user!.id);
    if (!agent.success || !agent.data) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Get days parameter from query string (default 30)
    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 90);

    // Fetch usage data
    const usage = await AgentUsage.get_by_agent(id, days);
    
    // Fetch conversations count
    const conversations = await AgentConversations.list_by_agent(id, 1000);

    // Aggregate stats
    const totals = usage.reduce(
      (acc, day) => ({
        requests: acc.requests + (day.request_count || 0),
        prompt_tokens: acc.prompt_tokens + (day.prompt_tokens || 0),
        completion_tokens: acc.completion_tokens + (day.completion_tokens || 0),
        total_tokens: acc.total_tokens + (day.total_tokens || 0),
        cost: acc.cost + parseFloat(String(day.estimated_cost || 0)),
      }),
      { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 }
    );

    // Format daily data
    const dailyUsage = usage.map(day => ({
      date: day.date,
      requests: day.request_count,
      tokens: day.total_tokens,
      cost: parseFloat(String(day.estimated_cost || 0)),
    }));

    return NextResponse.json({
      success: true,
      data: {
        agent_id: id,
        period_days: days,
        totals: {
          requests: totals.requests,
          prompt_tokens: totals.prompt_tokens,
          completion_tokens: totals.completion_tokens,
          total_tokens: totals.total_tokens,
          estimated_cost: totals.cost.toFixed(4),
          conversations: conversations.length,
        },
        daily: dailyUsage,
      },
    });
  } catch (err) {
    console.error('[AI Agents] Stats error:', err);
    return NextResponse.json(
      { error: 'Failed to get agent statistics' },
      { status: 500 }
    );
  }
}
