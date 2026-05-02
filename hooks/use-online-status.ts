"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the browser has a network connection, false when offline.
 * Uses navigator.onLine as the initial value and keeps it in sync with the
 * browser's "online" / "offline" window events.
 */
export function useOnlineStatus(): boolean {
  // Default true — safe for SSR (no navigator on server).
  // We sync the real value in useEffect once the browser is settled;
  // navigator.onLine is only reliable after mount, not during the initial
  // render / hydration pass where it can incorrectly return false.
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    // Sync actual state on mount — handles the case where the user opens the
    // page while already offline (no "offline" event fires in that case).
    setIsOnline(navigator.onLine);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
