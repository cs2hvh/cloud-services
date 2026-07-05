"use client";

import { Bell } from "lucide-react";
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
          className="cursor-pointer relative text-white/55 hover:text-white hover:bg-white/[0.06] rounded-[6px]"
        >
          <Bell className="h-5 w-5" />
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
