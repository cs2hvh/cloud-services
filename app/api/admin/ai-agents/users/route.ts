/**
 * Admin AI Agents Users API
 * GET /api/admin/ai-agents/users - List users with AI agents usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Check admin access
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceClient();
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'total_cost';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Get unique users with agents
    const { data: agentUsers } = await supabase
      .schema('agents')
      .from('ai_agents')
      .select('user_id');

    const uniqueUserIds = [...new Set(agentUsers?.map(a => a.user_id).filter(Boolean) || [])];
    
    if (uniqueUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          users: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        },
      });
    }

    // Get user details from auth.admin
    const { data: authData } = await supabase.auth.admin.listUsers();
    const allUsers = authData?.users || [];
    
    // Filter to only users with agents and apply search
    let users = allUsers.filter(u => uniqueUserIds.includes(u.id));
    
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(u => 
        u.email?.toLowerCase().includes(searchLower) ||
        (u.user_metadata?.full_name as string)?.toLowerCase().includes(searchLower)
      );
    }

    // Get agent counts per user
    const { data: agentCounts } = await supabase
      .schema('agents')
      .from('ai_agents')
      .select('user_id')
      .in('user_id', uniqueUserIds);

    const agentCountMap: Record<string, number> = {};
    agentCounts?.forEach(a => {
      agentCountMap[a.user_id] = (agentCountMap[a.user_id] || 0) + 1;
    });

    // Get usage stats per user
    const { data: usageData } = await supabase
      .schema('agents')
      .from('agent_usage')
      .select('user_id, input_tokens, output_tokens, cost')
      .in('user_id', uniqueUserIds);

    const usageMap: Record<string, { tokens: number; cost: number; requests: number }> = {};
    usageData?.forEach(u => {
      if (!usageMap[u.user_id]) {
        usageMap[u.user_id] = { tokens: 0, cost: 0, requests: 0 };
      }
      usageMap[u.user_id].tokens += (u.input_tokens || 0) + (u.output_tokens || 0);
      usageMap[u.user_id].cost += u.cost || 0;
      usageMap[u.user_id].requests++;
    });

    // Get user balances
    const { data: balances } = await supabase
      .schema('billing')
      .from('user_credits')
      .select('user_id, credit_balance')
      .in('user_id', uniqueUserIds);

    const balanceMap: Record<string, number> = {};
    balances?.forEach(b => {
      balanceMap[b.user_id] = b.credit_balance || 0;
    });

    // Combine data
    let enrichedUsers = users.map(user => ({
      id: user.id,
      email: user.email || '',
      full_name: (user.user_metadata?.full_name as string) || '',
      created_at: user.created_at,
      agents_count: agentCountMap[user.id] || 0,
      balance: balanceMap[user.id] || 0,
      usage: usageMap[user.id] || { tokens: 0, cost: 0, requests: 0 },
    }));

    // Sort
    if (sortBy === 'total_cost') {
      enrichedUsers.sort((a, b) => 
        sortOrder === 'desc' 
          ? b.usage.cost - a.usage.cost 
          : a.usage.cost - b.usage.cost
      );
    } else if (sortBy === 'agents_count') {
      enrichedUsers.sort((a, b) => 
        sortOrder === 'desc' 
          ? b.agents_count - a.agents_count 
          : a.agents_count - b.agents_count
      );
    } else if (sortBy === 'balance') {
      enrichedUsers.sort((a, b) => 
        sortOrder === 'desc' 
          ? b.balance - a.balance 
          : a.balance - b.balance
      );
    } else if (sortBy === 'email') {
      enrichedUsers.sort((a, b) => 
        sortOrder === 'desc' 
          ? (b.email || '').localeCompare(a.email || '')
          : (a.email || '').localeCompare(b.email || '')
      );
    }

    // Paginate
    const total = enrichedUsers.length;
    const offset = (page - 1) * limit;
    enrichedUsers = enrichedUsers.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: {
        users: enrichedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    console.error('[Admin AI Agents Users] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
