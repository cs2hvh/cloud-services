/**
 * useRealtimeTable - Simple Realtime Hook
 * Subscribes to Supabase table changes in real-time
 * 
 * @example
 * const { data, loading } = useRealtimeTable({
 *   table: 'deployments',
 *   filter: 'app_id=eq.abc123',
 *   transform: (r) => ({ ...r, status: r.status.toUpperCase() })
 * });
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface UseRealtimeTableOptions<TData = any, TTransformed = TData> {
  table: string;
  filter?: string;  // Format: "column=eq.value"
  limit?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  enabled?: boolean;
  transform?: (record: TData) => TTransformed;
}

export interface UseRealtimeTableReturn<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  refetch: () => Promise<void>;
}

export function useRealtimeTable<TData = any, TTransformed = TData>(
  options: UseRealtimeTableOptions<TData, TTransformed>
): UseRealtimeTableReturn<TTransformed> {
  const {
    table,
    filter,
    limit = 100,
    orderBy = 'created_at',
    orderDirection = 'desc',
    enabled = true,
    transform,
  } = options;

  const [data, setData] = useState<TTransformed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');

  // Stabilize transform to prevent infinite re-renders if caller doesn't memoize it
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    if (!enabled || !table) {
      setLoading(false); // Don't stay in loading state when disabled
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      let query = supabase
        .from(table)
        .select('*')
        .order(orderBy, { ascending: orderDirection === 'asc' })
        .limit(limit);

      // Apply filter: "app_id=eq.abc123" -> query.eq('app_id', 'abc123')
      if (filter) {
        const [column, rest] = filter.split('=');
        const [operator, value] = rest?.split('.') || [];
        if (column && operator === 'eq' && value) {
          query = query.eq(column, value);
        }
      }

      const { data: rows, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const transformed = (rows || []).map((row) =>
        transformRef.current ? transformRef.current(row as TData) : (row as unknown as TTransformed)
      );
      
      setData(transformed);
    } catch (err: any) {
      console.error(`[useRealtimeTable] Error fetching ${table}:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [table, filter, orderBy, orderDirection, limit, enabled]);

  // Setup realtime subscription
  useEffect(() => {
    if (!enabled || !table) {
      setLoading(false); // Don't stay in loading state when disabled
      setConnectionStatus('disconnected');
      return;
    }

    let channel: RealtimeChannel;

    const setup = async () => {
      // Fetch initial data (reuse fetchData callback)
      await fetchData();

      // Subscribe to realtime changes
      setConnectionStatus('connecting');
      channel = createClient()
        .channel(`${table}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: filter || undefined },
          (payload) => {
            const newRecord = payload.new as TData;
            const oldRecord = payload.old as TData;

            setData((prev) => {
              if (payload.eventType === 'INSERT' && newRecord) {
                // Prevent duplicates
                if (prev.some((item: any) => (item as any).id === (newRecord as any).id)) {
                  return prev;
                }
                const transformed = transformRef.current ? transformRef.current(newRecord) : (newRecord as unknown as TTransformed);
                return [transformed, ...prev].slice(0, limit);
              }
              if (payload.eventType === 'UPDATE' && newRecord) {
                const transformed = transformRef.current ? transformRef.current(newRecord) : (newRecord as unknown as TTransformed);
                return prev.map((item: any) => ((item as any).id === (newRecord as any).id ? transformed : item));
              }
              if (payload.eventType === 'DELETE' && oldRecord) {
                return prev.filter((item: any) => (item as any).id !== (oldRecord as any).id);
              }
              return prev;
            });
          }
        )
        .subscribe((status) => {
          setConnectionStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
        });
    };

    setup();

    return () => {
      channel?.unsubscribe();
    };
  }, [table, filter, orderBy, orderDirection, limit, enabled, fetchData]);

  return { data, loading, error, connectionStatus, refetch: fetchData };
}
