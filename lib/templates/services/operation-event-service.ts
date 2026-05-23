import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { EventLevel, EventStatus } from '../domain/state-machine';

export type OperationEventInput = {
  operationId: string;
  serviceId?: string | null;
  level?: EventLevel;
  stage: string;
  status: EventStatus;
  message: string;
  progressPct?: number | null;
  data?: Record<string, unknown>;
};

// Module-level singleton — one client per process, not one per emit() call.
// createServiceClient() is async and creates a new HTTP client every time it is
// called; at 20+ events per deployment that is a connection-pool exhaustion risk.
let _db: ReturnType<typeof createClient<Database>> | null = null;

function getDb() {
  if (!_db) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error('Missing SUPABASE_URL');
    if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    _db = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return _db;
}

export class OperationEventService {
  static async emit(input: OperationEventInput): Promise<void> {
    const { error } = await getDb().from('operation_events').insert({
      operation_id: input.operationId,
      service_id: input.serviceId ?? null,
      level: input.level ?? 'info',
      stage: input.stage,
      status: input.status,
      message: input.message,
      progress_pct: input.progressPct ?? null,
      data: input.data ?? {},
    });

    if (error) throw new Error(`Failed to persist operation event: ${error.message}`);
  }

  /**
   * Emit multiple events in a single INSERT for efficiency.
   * Use this during batch stages (e.g. secrets creation loop) to reduce round-trips.
   */
  static async emitBatch(inputs: OperationEventInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const rows = inputs.map(input => ({
      operation_id: input.operationId,
      service_id: input.serviceId ?? null,
      level: input.level ?? 'info',
      stage: input.stage,
      status: input.status,
      message: input.message,
      progress_pct: input.progressPct ?? null,
      data: input.data ?? {},
    }));
    const { error } = await getDb().from('operation_events').insert(rows);
    if (error) throw new Error(`Failed to persist operation events: ${error.message}`);
  }

  static async list(operationId: string, afterId?: number) {
    let query = getDb()
      .from('operation_events')
      .select('id, operation_id, service_id, level, stage, status, message, progress_pct, data, created_at')
      .eq('operation_id', operationId)
      .order('id', { ascending: true });

    if (afterId !== undefined) query = query.gt('id', afterId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }
}
