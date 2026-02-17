/**
 * Supabase Realtime Utilities
 * Common functions for connection management, status tracking, and reconnection logic
 * 
 * Use these utilities to build Realtime features consistently across the app
 */

import { createClient } from './client';
import type { 
  RealtimeChannel, 
  RealtimeChannelSendResponse,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

// Connection status types
export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Realtime event types
export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

// Connection options
export interface RealtimeConnectionOptions {
  onStatusChange?: (status: RealtimeStatus) => void;
  onError?: (error: Error) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

// Subscription configuration
export interface RealtimeSubscriptionConfig {
  table: string;
  schema?: string;
  event?: RealtimeEvent;
  filter?: string;
}

/**
 * Create and manage a Realtime channel subscription
 * Handles connection lifecycle, status tracking, and auto-reconnection
 */
export class RealtimeConnection {
  private channel: RealtimeChannel | null = null;
  private status: RealtimeStatus = 'disconnected';
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private cleanedUp = false;

  constructor(
    private channelName: string,
    private options: RealtimeConnectionOptions = {}
  ) {
    this.options.autoReconnect ??= true;
    this.options.reconnectDelay ??= 5000;
  }

  /**
   * Get current connection status
   */
  getStatus(): RealtimeStatus {
    return this.status;
  }

  /**
   * Subscribe to postgres_changes events
   */
  subscribe<T extends Record<string, unknown> = Record<string, unknown>>(
    config: RealtimeSubscriptionConfig,
    callback: (payload: RealtimePostgresChangesPayload<T>) => void
  ): this {
    if (this.cleanedUp) {
      console.warn('[RealtimeConnection] Cannot subscribe - already cleaned up');
      return this;
    }

    this.updateStatus('connecting');

    const supabase = createClient();
    this.channel = supabase.channel(this.channelName);

    // Setup postgres_changes listener
    // Supabase RealtimeChannel.on() requires type casting via unknown for generic postgres_changes usage
    ((this.channel as unknown) as {
      on: (
        event: 'postgres_changes',
        config: { event?: string; schema?: string; table: string; filter?: string },
        callback: (payload: RealtimePostgresChangesPayload<T>) => void
      ) => RealtimeChannel;
    }).on(
      'postgres_changes',
      {
        event: config.event || '*',
        schema: config.schema || 'public',
        table: config.table,
        filter: config.filter,
      },
      callback
    );

    // Subscribe with status callback
    this.channel.subscribe((status, err) => {
      console.log(`[RealtimeConnection] ${this.channelName} status:`, status, err);

      if (status === 'SUBSCRIBED') {
        this.updateStatus('connected');
        // Clear any pending reconnect attempts
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.updateStatus('error');
        this.handleConnectionError(new Error(`Connection ${status}: ${err || 'Unknown error'}`));
      } else if (status === 'CLOSED') {
        this.updateStatus('disconnected');
      }
    });

    return this;
  }

  /**
   * Subscribe to broadcast events
   */
  subscribeToBroadcast<T extends Record<string, unknown> = Record<string, unknown>>(
    event: string,
    callback: (payload: T) => void
  ): this {
    if (!this.channel) {
      console.warn('[RealtimeConnection] Channel not initialized');
      return this;
    }

    this.channel.on('broadcast', { event }, (payload) => {
      callback(payload.payload as T);
    });

    return this;
  }

  /**
   * Send a broadcast event
   */
  async broadcast<T extends Record<string, unknown> = Record<string, unknown>>(event: string, payload: T): Promise<RealtimeChannelSendResponse> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    return this.channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  }

  /**
   * Manually reconnect
   */
  reconnect(): void {
    if (this.cleanedUp) {
      console.warn('[RealtimeConnection] Cannot reconnect - already cleaned up');
      return;
    }

    console.log(`[RealtimeConnection] Manually reconnecting ${this.channelName}...`);
    this.cleanup();
    // Reconnection should be handled by re-subscribing from the component
  }

  /**
   * Cleanup and unsubscribe
   */
  cleanup(): void {
    this.cleanedUp = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.channel) {
      const supabase = createClient();
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.updateStatus('disconnected');
    console.log(`[RealtimeConnection] Cleaned up ${this.channelName}`);
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(status: RealtimeStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }

  /**
   * Handle connection errors with optional auto-reconnect
   */
  private handleConnectionError(error: Error): void {
    console.error(`[RealtimeConnection] Error on ${this.channelName}:`, error);
    this.options.onError?.(error);

    // Auto-reconnect if enabled
    if (this.options.autoReconnect && !this.cleanedUp) {
      console.log(
        `[RealtimeConnection] Will retry ${this.channelName} in ${this.options.reconnectDelay}ms...`
      );
      this.reconnectTimeout = setTimeout(() => {
        if (!this.cleanedUp) {
          this.reconnect();
        }
      }, this.options.reconnectDelay);
    }
  }
}

/**
 * Simple helper to create a Realtime connection
 */
export function createRealtimeConnection(
  channelName: string,
  options?: RealtimeConnectionOptions
): RealtimeConnection {
  return new RealtimeConnection(channelName, options);
}

/**
 * Utility to test if Realtime is accessible
 * Useful for debugging connection issues
 */
export async function testRealtimeConnection(table: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = createClient();
    
    // Check auth first
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Try to create a test channel
    const channel = supabase.channel('test-connection');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        supabase.removeChannel(channel);
        resolve({ success: false, error: 'Connection timeout' });
      }, 10000);

      channel
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {})
        .subscribe((status) => {
          clearTimeout(timeout);
          supabase.removeChannel(channel);
          
          if (status === 'SUBSCRIBED') {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `Connection failed: ${status}` });
          }
        });
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Check if user is inactive (for connection management)
 * Returns true if user hasn't interacted with the page recently
 */
export function isUserInactive(inactivityThresholdMs = 300000): boolean {
  // 5 minutes default
  if (typeof window === 'undefined') return false;

  const lastActivity = parseInt(
    window.sessionStorage.getItem('lastActivity') || '0',
    10
  );
  const now = Date.now();

  return now - lastActivity > inactivityThresholdMs;
}

/**
 * Track user activity for connection management
 * Call this to register user interactions
 */
export function trackUserActivity(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem('lastActivity', Date.now().toString());
}

/**
 * Setup automatic activity tracking
 * Tracks mouse, keyboard, touch events to determine user activity
 */
export function setupActivityTracking(): () => void {
  if (typeof window === 'undefined') return () => {};

  trackUserActivity(); // Initial track

  const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
  const handler = () => trackUserActivity();

  events.forEach((event) => {
    window.addEventListener(event, handler, { passive: true });
  });

  // Cleanup function
  return () => {
    events.forEach((event) => {
      window.removeEventListener(event, handler);
    });
  };
}
