/**
 * useRealtimeTable - Generic Realtime Hook
 * Works with ANY Supabase table - just specify table name and filter
 * 
 * Use this as a base for all Realtime subscriptions instead of creating custom hooks
 * 
 * @example
 * // Simple usage
 * const { data, loading } = useRealtimeTable({
 *   table: 'posts',
 *   filter: 'user_id=eq.123'
 * });
 * 
 * @example
 * // With transformation
 * const { data } = useRealtimeTable({
 *   table: 'deployments',
 *   filter: 'app_id=eq.abc',
 *   transform: (record) => ({ ...record, formatted: true })
 * });
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  createRealtimeConnection,
  setupActivityTracking,
  isUserInactive,
  type RealtimeStatus,
} from '@/lib/supabase/realtime';

export interface UseRealtimeTableOptions<TDatabase extends Record<string, unknown> = Record<string, unknown>, TTransformed = TDatabase> {
  /** Table name to subscribe to */
  table: string;
  
  /** Filter using PostgREST syntax (single column only!) */
  filter?: string;
  
  /** Schema name (default: 'public') */
  schema?: string;
  
  /** Event type to listen for (default: '*' = all events) */
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  
  /** Maximum number of records to keep (default: 100) */
  limit?: number;
  
  /** Enable/disable subscription (default: true) */
  enabled?: boolean;
  
  /** Order by column (default: 'created_at') */
  orderBy?: string;
  
  /** Order direction (default: 'desc') */
  orderDirection?: 'asc' | 'desc';
  
  /** Transform function to convert database record to UI format */
  transform?: (record: TDatabase) => TTransformed;
  
  /** Additional filters for initial query (supports multiple conditions) */
  additionalFilters?: Record<string, unknown>;
  
  /** Pause subscription when user is inactive (default: false) */
  pauseWhenInactive?: boolean;
  
  /** Inactivity threshold in ms (default: 5 minutes) */
  inactivityThreshold?: number;

  /** Custom select query (default: '*') */
  select?: string;
}

export interface UseRealtimeTableReturn<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  connectionStatus: RealtimeStatus;
  refetch: () => Promise<void>;
  isInactive: boolean;
}

/**
 * Generic Realtime hook for any Supabase table
 */
export function useRealtimeTable<TDatabase extends Record<string, unknown> = Record<string, unknown>, TTransformed = TDatabase>(
  options: UseRealtimeTableOptions<TDatabase, TTransformed>
): UseRealtimeTableReturn<TTransformed> {
  const {
    table,
    filter,
    schema = 'public',
    event = '*',
    limit = 100,
    enabled = true,
    orderBy = 'created_at',
    orderDirection = 'desc',
    transform,
    additionalFilters,
    pauseWhenInactive = false,
    inactivityThreshold = 300000, // 5 minutes
    select = '*',
  } = options;

  const [data, setData] = useState<TTransformed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeStatus>('disconnected');
  const [isInactive, setIsInactive] = useState(false);
  
  const connectionRef = useRef<ReturnType<typeof createRealtimeConnection> | null>(null);
  const activityCleanupRef = useRef<(() => void) | null>(null);

  // Transform helper
  const transformRecord = useCallback(
    (record: TDatabase): TTransformed => {
      return transform ? transform(record) : (record as unknown as TTransformed);
    },
    [transform]
  );

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    if (!enabled || !table) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      let query = supabase.from(table).select(select).order(orderBy, { ascending: orderDirection === 'asc' }).limit(limit);

      // Apply single-column filter from Realtime config
      if (filter) {
        const [column, operator, value] = filter.split(/=|=/);
        if (column && value) {
          const cleanValue = value.replace(/^eq\./, '');
          query = query.eq(column, cleanValue);
        }
      }

      // Apply additional filters (supports multiple conditions)
      if (additionalFilters) {
        Object.entries(additionalFilters).forEach(([key, val]) => {
          query = query.eq(key, val);
        });
      }

      const { data: fetchedData, error: fetchError } = await query;

      if (fetchError) {
        console.error(`[useRealtimeTable] Fetch error for ${table}:`, fetchError);
        setError(fetchError.message);
        return;
      }

      // Type assertion: Supabase query returns unknown array type that we safely cast to our database type
      const records = (fetchedData || []) as unknown as TDatabase[];
      const transformedData = records.map(transformRecord);
      setData(transformedData);
      console.log(`[useRealtimeTable] Fetched ${transformedData.length} records from ${table}`);
    } catch (err) {
      console.error(`[useRealtimeTable] Unexpected error for ${table}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [table, select, filter, additionalFilters, orderBy, orderDirection, limit, enabled, transformRecord]);

  // Setup Realtime subscription
  useEffect(() => {
    if (!enabled || !table) {
      setConnectionStatus('disconnected');
      return;
    }

    // Setup activity tracking if pause on inactivity is enabled
    if (pauseWhenInactive) {
      activityCleanupRef.current = setupActivityTracking();
      
      // Check inactivity periodically
      const inactivityCheck = setInterval(() => {
        const inactive = isUserInactive(inactivityThreshold);
        setIsInactive(inactive);
        
        if (inactive && connectionRef.current) {
          console.log(`[useRealtimeTable] User inactive, pausing ${table} subscription`);
          connectionRef.current.cleanup();
          connectionRef.current = null;
          setConnectionStatus('disconnected');
        } else if (!inactive && !connectionRef.current) {
          console.log(`[useRealtimeTable] User active again, resuming ${table} subscription`);
          setupSubscription();
        }
      }, 30000); // Check every 30 seconds

      return () => {
        clearInterval(inactivityCheck);
        activityCleanupRef.current?.();
      };
    }

    const setupSubscription = async () => {
      // Fetch initial data
      await fetchInitialData();

      // Create Realtime connection
      const connection = createRealtimeConnection(`realtime-${table}-${Date.now()}`, {
        onStatusChange: setConnectionStatus,
        onError: (err) => {
          console.error(`[useRealtimeTable] Connection error for ${table}:`, err);
          setError(err.message);
        },
        autoReconnect: true,
        reconnectDelay: 5000,
      });

      connection.subscribe<TDatabase>(
        { table, schema, event, filter },
        (payload) => {
          console.log(`[useRealtimeTable] ${table} event:`, payload.eventType);

          setData((prev) => {
            // Handle INSERT
            if (payload.eventType === 'INSERT') {
              const newRecord = transformRecord(payload.new);
              // Avoid duplicates - check if record with this ID already exists
              const recordId = (payload.new as Record<string, unknown>).id;
              if (prev.some((item) => (item as Record<string, unknown>).id === recordId)) {
                return prev;
              }
              return [newRecord, ...prev].slice(0, limit);
            }

            // Handle UPDATE
            if (payload.eventType === 'UPDATE') {
              const updatedRecord = transformRecord(payload.new);
              const recordId = (payload.new as Record<string, unknown>).id;
              return prev.map((item) =>
                (item as Record<string, unknown>).id === recordId ? updatedRecord : item
              );
            }

            // Handle DELETE
            if (payload.eventType === 'DELETE') {
              const recordId = (payload.old as Record<string, unknown>).id;
              return prev.filter((item) => (item as Record<string, unknown>).id !== recordId);
            }

            return prev;
          });
        }
      );

      connectionRef.current = connection;
    };

    setupSubscription();

    // Cleanup
    return () => {
      connectionRef.current?.cleanup();
      connectionRef.current = null;
      activityCleanupRef.current?.();
    };
  }, [table, schema, filter, event, limit, enabled, fetchInitialData, transformRecord, pauseWhenInactive, inactivityThreshold]);

  return {
    data,
    loading,
    error,
    connectionStatus,
    refetch: fetchInitialData,
    isInactive,
  };
}
