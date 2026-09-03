/**
 * Admin AI Agents Statistics API
 * GET /api/admin/ai-agents/stats - Get overview statistics for AI agents platform
 *
 * Every read here either succeeds or fails the request. The previous version
 * wrote `const { data } = await ...` and `data?.reduce(...) || 0`, so an
 * unreachable table reported a platform with no agents, no users and $0 of
 * spend — and it had been doing exactly that: it queried agents.agent_usage,
 * agents.agent_messages and agents.agent_conversations, none of which exist.
 * The tables are agents.usage (a per-agent, per-day rollup), agents.messages
 * and agents.conversations, as lib/supabase/queries/ai_agents.ts writes them.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/auth';
import { logError, sanitizeError } from '@/lib/api/error-sanitizer';
import { selectAll } from '@/lib/supabase/select-all';

export const dynamic = 'force-dynamic';

/** agents.usage: one row per (agent, date), counters accumulated in place. */
interface UsageRow {
  date: string;
  request_count: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  estimated_cost: number | null;
}

interface MessageModelRow {
  model_used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
}

// Prevents: a count whose read failed being reported as 0.
async function exactCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  what: string
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(`${what} count failed: ${error.message}`);
  if (count === null) throw new Error(`${what} count missing from response`);
  return count;
}

function sumUsage(rows: UsageRow[]) {
  return rows.reduce(
    (acc, u) => {
      acc.input_tokens += u.prompt_tokens || 0;
      acc.output_tokens += u.completion_tokens || 0;
      acc.cost += Number(u.estimated_cost) || 0;
      acc.requests += u.request_count || 0;
      return acc;
    },
    { input_tokens: 0, output_tokens: 0, cost: 0, requests: 0 }
  );
}

export async function GET() {
  // Check admin access
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceClient();
    const agents = () => supabase.schema('agents');

    // Counts come from the server (`count: exact`), never from the length of
    // a response that PostgREST caps at 1000 rows.
    const totalAgents = await exactCount(
      agents().from('ai_agents').select('*', { count: 'exact', head: true }),
      'ai_agents'
    );
    const activeAgents = await exactCount(
      agents().from('ai_agents').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      'active ai_agents'
    );

    // Every list read below pages through selectAll — a single select stops
    // silently at 1000 rows — and throws on a failed page.
    const agentOwners = await selectAll<{ user_id: string }>(
      (from, to) =>
        agents().from('ai_agents').select('user_id').not('user_id', 'is', null).order('id').range(from, to),
      { label: 'agents.ai_agents' }
    );
    const totalUsers = new Set(agentOwners.map((u) => u.user_id)).size;

    const totalConversations = await exactCount(
      agents().from('conversations').select('*', { count: 'exact', head: true }),
      'conversations'
    );
    const totalMessages = await exactCount(
      agents().from('messages').select('*', { count: 'exact', head: true }),
      'messages'
    );

    const USAGE_COLUMNS = 'date, request_count, prompt_tokens, completion_tokens, estimated_cost';

    // All-time usage
    const usageData = await selectAll<UsageRow>(
      (from, to) => agents().from('usage').select(USAGE_COLUMNS).order('id').range(from, to),
      { label: 'agents.usage' }
    );
    const totals = sumUsage(usageData);

    // Today's usage. agents.usage is keyed by `date` (UTC calendar day, as
    // AgentUsage.record writes it), so the day is matched exactly rather than
    // approximated from created_at.
    const today = new Date().toISOString().split('T')[0];
    const todayUsage = await selectAll<UsageRow>(
      (from, to) => agents().from('usage').select(USAGE_COLUMNS).eq('date', today).order('id').range(from, to),
      { label: 'agents.usage (today)' }
    );
    const todayTotals = sumUsage(todayUsage);

    // Usage by model (top 10)
    const modelUsage = await selectAll<MessageModelRow>(
      (from, to) =>
        agents()
          .from('messages')
          .select('model_used, prompt_tokens, completion_tokens')
          .not('model_used', 'is', null)
          .order('id')
          .range(from, to),
      { label: 'agents.messages' }
    );

    const modelStats: Record<string, { tokens: number; count: number }> = {};
    modelUsage.forEach((m) => {
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

    // Recent usage trend (last 7 days), one bucket per rollup date
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const sinceDate = sevenDaysAgo.toISOString().split('T')[0];

    const recentUsage = await selectAll<UsageRow>(
      (from, to) =>
        agents()
          .from('usage')
          .select(USAGE_COLUMNS)
          .gte('date', sinceDate)
          .order('date', { ascending: true })
          .order('id')
          .range(from, to),
      { label: 'agents.usage (7d)' }
    );

    // Group by day
    const dailyUsage: Record<string, { tokens: number; cost: number; requests: number }> = {};
    recentUsage.forEach((u) => {
      const day = u.date;
      if (!dailyUsage[day]) {
        dailyUsage[day] = { tokens: 0, cost: 0, requests: 0 };
      }
      dailyUsage[day].tokens += (u.prompt_tokens || 0) + (u.completion_tokens || 0);
      dailyUsage[day].cost += Number(u.estimated_cost) || 0;
      dailyUsage[day].requests += u.request_count || 0;
    });

    const usageTrend = Object.entries(dailyUsage)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, stats]) => ({ date, ...stats }));

    return NextResponse.json({
      success: true,
      data: {
        totalAgents,
        activeAgents,
        totalUsers,
        totalConversations,
        totalMessages,
        usage: {
          total_input_tokens: totals.input_tokens,
          total_output_tokens: totals.output_tokens,
          total_cost: totals.cost,
          total_requests: totals.requests,
        },
        usageToday: {
          input_tokens: todayTotals.input_tokens,
          output_tokens: todayTotals.output_tokens,
          cost: todayTotals.cost,
          requests: todayTotals.requests,
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
