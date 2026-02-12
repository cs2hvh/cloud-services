"use client";

import { Bell } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "./notification-dropdown";
import api from "@/lib/axios/axios";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/app/dashboard/provider";
import { RealtimeChannel } from "@supabase/supabase-js";

export function NotificationBell() {
  const { user } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const initialFetchDone = useRef(false);

  // Fetch initial count
  const fetchCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get("/notifications/count");
      setUnreadCount(res.data.count || 0);
    } catch (error) {
      console.error("[NotificationBell] Failed to fetch count:", error)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return

    // Fetch initial count only once
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchCount();
    }

    // Clean up any existing channel before creating new one
    if (channelRef.current) {
      console.log('[NotificationBell] Cleaning up existing channel');
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const supabase = createClient()
    
    console.log('[NotificationBell] Setting up realtime subscription for user:', user.id);

    // Create the channel with a unique name
    const channel = supabase.channel(`notifications:${user.id}:${Date.now()}`);

    // Subscribe to postgres changes - ALL events first for debugging
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[NotificationBell] 🔔 Realtime event received:', {
            eventType: payload.eventType,
            old: payload.old,
            new: payload.new,
          });

          // Handle INSERT - increment count
          if (payload.eventType === 'INSERT') {
            const newRecord = payload.new as { is_read: boolean };
            if (newRecord && newRecord.is_read === false) {
              console.log('[NotificationBell] ➕ Incrementing count')
              setUnreadCount((prev) => {
                const newCount = prev + 1;
                console.log(`[NotificationBell] Count: ${prev} → ${newCount}`)
                return newCount;
              });
            }
          }

          // Handle UPDATE - decrement count if marked as read
          if (payload.eventType === 'UPDATE') {
            const oldRecord = payload.old as { is_read: boolean };
            const newRecord = payload.new as { is_read: boolean };
            if (oldRecord?.is_read === false && newRecord?.is_read === true) {
              console.log('[NotificationBell] ➖ Decrementing count')
              setUnreadCount((prev) => {
                const newCount = Math.max(0, prev - 1);
                console.log(`[NotificationBell] Count: ${prev} → ${newCount}`);
                return newCount;
              });
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[NotificationBell] 📡 Channel status:', status);
        if (err) {
          console.error('[NotificationBell] ❌ Channel error:', err);
        }
        if (status === 'SUBSCRIBED') {
          console.log('[NotificationBell] ✅ Successfully subscribed to realtime notifications!');
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[NotificationBell] ❌ Channel error - realtime might not be enabled for this table');
        }
        if (status === 'TIMED_OUT') {
          console.error('[NotificationBell] ⏱️ Subscription timed out');
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      console.log('[NotificationBell] Cleaning up subscription');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, fetchCount]);

  // Handle dropdown open/close
  const handleOpenChange = async (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Mark all as read when dropdown opens
      try {
        await api.post("/notifications/mark-read", { all: true });
        setUnreadCount(0);
      } catch (error) {
        console.error("[NotificationBell] Failed to mark as read:", error);
      }
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="cursor-pointer relative text-slate-400 hover:text-white hover:bg-slate-800/50"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-[500px] overflow-hidden p-0 bg-slate-900 border-slate-700"
      >
        <NotificationDropdown onClose={() => setIsOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
