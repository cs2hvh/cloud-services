"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drives soft refresh of the status page every N seconds without a full
 * window.location.reload (which would flash the page + lose scroll). The
 * server data is recomputed on every Next.js router.refresh() because the
 * page is `dynamic = "force-dynamic"`.
 */
export function StatusAutoRefresh({ intervalSeconds }: { intervalSeconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const handle = window.setInterval(() => {
      router.refresh();
    }, intervalSeconds * 1000);
    return () => window.clearInterval(handle);
  }, [router, intervalSeconds]);
  return null;
}
