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
