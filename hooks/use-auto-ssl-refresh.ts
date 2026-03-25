'use client';

import { useEffect, useRef } from 'react';

/**
 * Polls POST /api/domains/{id}/check-ssl for every issuing domain
 * on a fixed interval, then calls onRefresh to re-read the updated
 * DB state.
 *
 * Calling check-ssl BEFORE the re-fetch is critical: the API writes
 * ssl_status = "active" to the DB when the TLS cert is confirmed,
 * so subsequent reads immediately reflect the new state.
 *
 * @param issuingIds - IDs of domains currently in ssl_status="issuing"
 * @param onRefresh  - callback to re-fetch domain list. Does NOT need to be
 *                    wrapped in useCallback — a ref is used internally so an
 *                    unstable (inline) function never triggers a re-render loop.
 * @param intervalMs - polling interval (default 20 s)
 */
export function useAutoSslRefresh(
  issuingIds: string[],
  onRefresh: () => void,
  intervalMs = 20_000,
) {
  const cursorRef = useRef(0);
  // Keep a ref to the latest onRefresh so the setInterval closure always calls
  // the current version without needing it in the effect dependency array.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; });

  useEffect(() => {
    if (issuingIds.length === 0) return;

    const interval = setInterval(async () => {
      // Probe one domain per tick (round-robin) to stay safely below API
      // rate limits when multiple domains are issuing in parallel.
      const current = issuingIds[cursorRef.current % issuingIds.length];
      cursorRef.current = (cursorRef.current + 1) % Math.max(issuingIds.length, 1);

      await fetch(`/api/domains/${current}/check-ssl`, { method: 'POST' }).catch(() => {});
      onRefreshRef.current();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [issuingIds, intervalMs]);
}
