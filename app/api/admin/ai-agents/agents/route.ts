/**
 * Admin AI Agents List API
 * GET /api/admin/ai-agents/agents - List all agents with user info
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

const AGENT_SORT_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'name',
  'status',
  'endpoint_id',
  'user_id',
]);

function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9@._\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: NextRequest) {
  // Check admin access
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceClient();
    const { searchParams } = new URL(request.url);
    
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const search = sanitizeSearchTerm(searchParams.get('search') || '');
    const status = searchParams.get('status') || '';
    const requestedSortBy = searchParams.get('sortBy') || 'created_at';
    const sortBy = AGENT_SORT_COLUMNS.has(requestedSortBy) ? requestedSortBy : 'created_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .schema('agents')
      .from('ai_agents')
      .select('*', { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,endpoint_id.ilike.%${search}%`);
    }
    if (status) {
      query = query.eq('status', status);
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    query = query.range(offset, offset + limit - 1);

    const { data: agents, count, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    // Get user info for all agents from auth.admin
    const userIds = [...new Set(agents?.map(a => a.user_id).filter(Boolean) || [])];
    
    const userMap: Record<string, { email: string; full_name: string }> = {};
    if (userIds.length > 0) {
      const { data: authData } = await supabase.auth.admin.listUsers();
      const allUsers = authData?.users || [];
      
      allUsers.forEach(u => {
        if (userIds.includes(u.id)) {
          userMap[u.id] = {
            email: u.email || '',
            full_name: (u.user_metadata?.full_name as string) || '',
          };
        }
      });
    }

    // Get usage stats for each agent
    const agentIds = agents?.map(a => a.id) || [];
    const { data: usageData } = await supabase
      .schema('agents')
      .from('agent_usage')
      .select('agent_id, input_tokens, output_tokens, cost')
      .in('agent_id', agentIds);

    const usageMap: Record<string, { tokens: number; cost: number; requests: number }> = {};
    usageData?.forEach(u => {
      if (!usageMap[u.agent_id]) {
        usageMap[u.agent_id] = { tokens: 0, cost: 0, requests: 0 };
      }
      usageMap[u.agent_id].tokens += (u.input_tokens || 0) + (u.output_tokens || 0);
      usageMap[u.agent_id].cost += u.cost || 0;
      usageMap[u.agent_id].requests++;
    });

    // Combine data
    const enrichedAgents = agents?.map(agent => ({
      ...agent,
      user: userMap[agent.user_id] || null,
      usage: usageMap[agent.id] || { tokens: 0, cost: 0, requests: 0 },
    }));

    return NextResponse.json({
      success: true,
      data: {
        agents: enrichedAgents,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (err) {
    console.error('[Admin AI Agents List] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}
