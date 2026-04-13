/**
 * Admin AI Agents Statistics API
 * GET /api/admin/ai-agents/stats - Get overview statistics for AI agents platform
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/auth';
import { logError, sanitizeError } from '@/lib/api/error-sanitizer';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Check admin access
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceClient();

    // Get total agents count
    const { count: totalAgents } = await supabase
      .schema('agents')
      .from('ai_agents')
      .select('*', { count: 'exact', head: true });

    // Get active agents count
    const { count: activeAgents } = await supabase
      .schema('agents')
      .from('ai_agents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Get unique users with agents
    const { data: uniqueUsers } = await supabase
      .schema('agents')
      .from('ai_agents')
      .select('user_id')
      .not('user_id', 'is', null);
    
    const uniqueUserIds = new Set(uniqueUsers?.map(u => u.user_id) || []);
    const totalUsers = uniqueUserIds.size;

    // Get total conversations
    const { count: totalConversations } = await supabase
      .schema('agents')
      .from('agent_conversations')
      .select('*', { count: 'exact', head: true });

    // Get total messages
    const { count: totalMessages } = await supabase
      .schema('agents')
      .from('agent_messages')
      .select('*', { count: 'exact', head: true });

    // Get usage stats (aggregated)
    const { data: usageData } = await supabase
      .schema('agents')
      .from('agent_usage')
      .select('input_tokens, output_tokens, cost');

    const totalInputTokens = usageData?.reduce((sum, u) => sum + (u.input_tokens || 0), 0) || 0;
    const totalOutputTokens = usageData?.reduce((sum, u) => sum + (u.output_tokens || 0), 0) || 0;
    const totalCost = usageData?.reduce((sum, u) => sum + (u.cost || 0), 0) || 0;

    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayUsage } = await supabase
      .schema('agents')
      .from('agent_usage')
      .select('input_tokens, output_tokens, cost')
      .gte('created_at', today.toISOString());

    const todayInputTokens = todayUsage?.reduce((sum, u) => sum + (u.input_tokens || 0), 0) || 0;
    const todayOutputTokens = todayUsage?.reduce((sum, u) => sum + (u.output_tokens || 0), 0) || 0;
    const todayCost = todayUsage?.reduce((sum, u) => sum + (u.cost || 0), 0) || 0;

    // Get usage by model (top 10)
    const { data: modelUsage } = await supabase
      .schema('agents')
      .from('agent_messages')
      .select('model_used, prompt_tokens, completion_tokens')
      .not('model_used', 'is', null);

    const modelStats: Record<string, { tokens: number; count: number }> = {};
    modelUsage?.forEach(m => {
      const model = m.model_used || 'unknown';
      if (!modelStats[model]) {
        modelStats[model] = { tokens: 0, count: 0 };
      }
      modelStats[model].tokens += (m.prompt_tokens || 0) + (m.completion_tokens || 0);
      modelStats[model].count++;
    });

    const topModels = Object.entries(modelStats)
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .slice(0, 10)
      .map(([model, stats]) => ({ model, ...stats }));

    // Get recent usage trend (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: recentUsage } = await supabase
      .schema('agents')
      .from('agent_usage')
      .select('created_at, input_tokens, output_tokens, cost')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    // Group by day
    const dailyUsage: Record<string, { tokens: number; cost: number; requests: number }> = {};
    recentUsage?.forEach(u => {
      const day = new Date(u.created_at).toISOString().split('T')[0];
      if (!dailyUsage[day]) {
        dailyUsage[day] = { tokens: 0, cost: 0, requests: 0 };
      }
      dailyUsage[day].tokens += (u.input_tokens || 0) + (u.output_tokens || 0);
      dailyUsage[day].cost += u.cost || 0;
      dailyUsage[day].requests++;
    });

    const usageTrend = Object.entries(dailyUsage)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, stats]) => ({ date, ...stats }));

    return NextResponse.json({
      success: true,
      data: {
        totalAgents: totalAgents || 0,
        activeAgents: activeAgents || 0,
        totalUsers,
        totalConversations: totalConversations || 0,
        totalMessages: totalMessages || 0,
        usage: {
          total_input_tokens: totalInputTokens,
          total_output_tokens: totalOutputTokens,
          total_cost: totalCost,
          total_requests: usageData?.length || 0,
        },
        usageToday: {
          input_tokens: todayInputTokens,
          output_tokens: todayOutputTokens,
          cost: todayCost,
          requests: todayUsage?.length || 0,
        },
        topModels: topModels.map(m => ({
          model: m.model,
          total_requests: m.count,
          total_cost: 0, // We don't track cost per model yet
        })),
        usageTrend,
      },
    });
  } catch (err) {
    logError('GET /api/admin/ai-agents/stats', err);
    return NextResponse.json(
      { error: sanitizeError(err) },
      { status: 500 }
    );
  }
}
