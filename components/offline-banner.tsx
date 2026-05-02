"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { WifiOff } from "lucide-react";

/**
 * Global offline banner — renders a sticky bar at the top of the page
 * whenever the user's network connection is lost.
 * Fires a "Back online" toast when the connection is restored.
 * Add this once to the root layout.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  // Track whether we were previously offline so we only toast on the
  // offline → online transition, never on initial page load.
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online", {
        description: "Your connection has been restored.",
        duration: 4000,
      });
    }
  }, [isOnline]);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-yellow-500 px-4 py-2 text-sm font-medium text-yellow-950"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>You are offline. Please check your internet connection.</span>
    </div>
  );
}
