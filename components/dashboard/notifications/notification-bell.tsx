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
      console.error("[NotificationBell] Failed to fetch count:", error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

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

    const supabase = createClient();
    
    console.log('[NotificationBell] Setting up realtime subscription for user:', user.id);

    // Create the channel
    const channel = supabase.channel(`notifications-user-${user.id}`, {
      config: {
        broadcast: { self: true },
        presence: { key: user.id },
      },
    });

    // Subscribe to INSERT events
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        console.log('[NotificationBell] New notification INSERT:', payload);
        if (payload.new && payload.new.is_read === false) {
          setUnreadCount((prev) => prev + 1);
        }
      }
    );

    // Subscribe to UPDATE events (for mark as read)
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        console.log('[NotificationBell] Notification UPDATE:', payload);
        // If marked as read, decrement
        if (payload.old?.is_read === false && payload.new?.is_read === true) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      }
    );

    // Subscribe to ALL events (for debugging - remove later)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
      },
      (payload) => {
        console.log('[NotificationBell] ANY notification event:', payload);
      }
    );

    // Subscribe to the channel
    channel.subscribe((status, err) => {
      console.log('[NotificationBell] Channel status:', status);
      if (err) {
        console.error('[NotificationBell] Channel error:', err);
      }
      if (status === 'SUBSCRIBED') {
        console.log('[NotificationBell] Successfully subscribed to realtime notifications!');
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
