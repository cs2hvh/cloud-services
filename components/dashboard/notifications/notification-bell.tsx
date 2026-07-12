"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "./notification-dropdown";
import { useSession } from "@/app/dashboard/provider";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";

export function NotificationBell() {
  const { user } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  
  // Use new realtime notifications hook
  const { 
    unreadCount, 
    markAllAsRead,
  } = useRealtimeNotifications({
    userId: user?.id,
    limit: 50,
    enabled: !!user?.id,
  });

  // Handle dropdown open/close
  const handleOpenChange = async (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Mark all as read when dropdown opens
      try {
        await markAllAsRead();
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
          aria-label="Notifications"
          className="group relative h-8 w-8 rounded-[7px] border border-white/[0.08] bg-white/[0.02] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white hover:border-white/[0.16]"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[17px]"
          >
            <path d="M17.5 9a5.5 5.5 0 0 0-11 0c0 4.8-2.2 6.2-2.2 6.2h15.4S17.5 13.8 17.5 9Z" />
            <path d="M13.7 18.3a2 2 0 0 1-3.4 0" />
          </svg>
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-[#0d0e11]"
              style={{ background: "#0095FF", boxShadow: "0 0 10px rgba(0,149,255,0.6)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[360px] max-w-[calc(100vw-1.5rem)] max-h-[520px] overflow-hidden p-0 bg-[#0d0e11] border border-white/[0.08] rounded-[8px] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]"
      >
        <NotificationDropdown onClose={() => setIsOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
