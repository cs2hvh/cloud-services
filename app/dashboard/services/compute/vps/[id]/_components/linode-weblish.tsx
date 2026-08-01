'use client';

// Weblish terminal — xterm.js over the Lish websocket returned by
// POST /linode/instances/{id}/lish. The Linode counterpart of novnc-viewer.

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';

/**
 * Lish multiplexes control frames onto the same socket as terminal output, as
 * bare JSON (`{"type":"error","reason":"Your session has expired."}`). Writing
 * those straight to the terminal dumps raw JSON at the customer, so pick them
 * out and report them as status instead.
 */
/**
 * Session URLs we have already auto-renewed once, keyed by the (unique, single
 * use) token URL.
 *
 * This deliberately lives at module scope rather than in a ref: renewing swaps
 * `wsUrl` in the parent, which unmounts and remounts this component, so any
 * per-instance guard resets and a token that came back already-expired would
 * renew forever. Keyed by URL, each token can trigger at most one renewal.
 */
const autoRenewedUrls = new Set<string>();
/** Keep the set from growing without bound over a long-lived page. */
function markAutoRenewed(url: string): void {
  if (autoRenewedUrls.size > 50) autoRenewedUrls.clear();
  autoRenewedUrls.add(url);
}

function parseLishControl(raw: string): { expired: boolean; reason: string } | null {
  if (!raw.startsWith('{') || !raw.includes('"type"')) return null;
  try {
    const parsed = JSON.parse(raw) as { type?: string; reason?: string };
    if (parsed?.type !== 'error') return null;
    const reason = String(parsed.reason ?? 'The console session ended.');
    return { expired: /expired/i.test(reason), reason };
  } catch {
    return null; // not a control frame — ordinary terminal output
  }
}

interface LinodeWeblishProps {
  wsUrl: string;
  serverName: string;
  onDisconnect?: (clean: boolean, reason?: string) => void;
  /**
   * Request a NEW session URL. Lish tokens are short-lived and single-use —
   * once one expires the upstream answers every further attempt with
   * `{"type":"error","reason":"Your session has expired."}`, so reconnecting
   * has to mint a fresh token rather than retry the dead one.
   */
  onReconnect?: () => void | Promise<void>;
}

export function LinodeWeblish({
  wsUrl,
  serverName,
  onDisconnect,
  onReconnect,
}: LinodeWeblishProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [connState, setConnState] = useState<'connecting' | 'open' | 'closed' | 'error'>(
    'connecting'
  );
  const [retryNonce, setRetryNonce] = useState(0);

  // Callers pass `onDisconnect` as an inline arrow, so its identity changes on
  // every render. Keeping it in the effect's dependency list made the socket
  // tear itself down and reconnect in a loop — connect, setConnState, re-render,
  // new identity, cleanup, repeat — which destroys the terminal each cycle so
  // nothing ever renders and keystrokes go nowhere. Hold it in a ref instead:
  // the effect reads the latest callback without depending on it.
  const onDisconnectRef = useRef(onDisconnect);
  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  }, [onDisconnect]);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  /** Set when the upstream told us this session died of old age. */
  const expiredRef = useRef(false);

  useEffect(() => {
    // Fresh session — clear any expiry recorded against the previous one.
    expiredRef.current = false;
    let disposed = false;
    let socket: WebSocket | null = null;
    let term: import('@xterm/xterm').Terminal | null = null;
    let fit: import('@xterm/addon-fit').FitAddon | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      // xterm touches `document` at import time — load it client-side only.
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !containerRef.current) return;

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        theme: {
          background: '#0d0e11',
          foreground: '#e2e8f0',
          cursor: '#0095FF',
          selectionBackground: 'rgba(0,149,255,0.3)',
        },
        scrollback: 5000,
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();

      resizeObserver = new ResizeObserver(() => {
        try {
          fit?.fit();
        } catch {
          /* container mid-layout */
        }
      });
      resizeObserver.observe(containerRef.current);

      setConnState('connecting');
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        setConnState('error');
        return;
      }
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        if (disposed) return;
        setConnState('open');
        term?.focus();
      };
      socket.onmessage = (evt) => {
        if (!term) return;
        if (typeof evt.data === 'string') {
          const control = parseLishControl(evt.data);
          if (control) {
            expiredRef.current = control.expired;
            term.write(`\r\n\x1b[33m— ${control.reason} —\x1b[0m\r\n`);
            return;
          }
          term.write(evt.data);
        } else {
          term.write(new Uint8Array(evt.data as ArrayBuffer));
        }
      };
      socket.onclose = (evt) => {
        if (disposed) return;
        onDisconnectRef.current?.(evt.wasClean, evt.reason);

        // Sessions expire on idle, and the token is single-use — so a stale
        // tab, or one returned to after a while, always dies here. Renew once
        // automatically instead of stranding the user on a dead terminal that
        // only a manual click can revive.
        if (expiredRef.current && onReconnectRef.current && !autoRenewedUrls.has(wsUrl)) {
          markAutoRenewed(wsUrl);
          expiredRef.current = false;
          setConnState('connecting');
          term?.write('\r\n\x1b[2m— renewing session —\x1b[0m\r\n');
          void onReconnectRef.current();
          return;
        }

        setConnState('closed');
        term?.write('\r\n\x1b[2m— session closed —\x1b[0m\r\n');
      };
      socket.onerror = () => {
        if (disposed) return;
        setConnState('error');
      };

      term.onData((data) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        }
      });
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      try {
        socket?.close();
      } catch {}
      try {
        term?.dispose();
      } catch {}
    };
  }, [wsUrl, retryNonce]);

  return (
    <div
      data-conn-state={connState}
      className="border border-white/[0.08] bg-[#0d0e11] rounded-[6px] overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#111216]">
        <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/45 truncate`}>
          {serverName} — weblish
        </span>
        <span className={`${MONO} inline-flex items-center gap-2 text-[9.5px] uppercase tracking-[0.12em] font-semibold`}>
          {connState === 'open' && (
            <span className="inline-flex items-center gap-1.5 text-emerald-300/90">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 5px #4ade80' }} />
              Connected
            </span>
          )}
          {connState === 'connecting' && <span className="text-white/40">Connecting…</span>}
          {(connState === 'closed' || connState === 'error') && (
            <button
              type="button"
              onClick={() => {
                // Prefer minting a fresh token; the parent swaps `wsUrl`,
                // which remounts this terminal cleanly. Only fall back to
                // replaying the current URL when no refresher was supplied.
                if (onReconnect) {
                  void onReconnect();
                  return;
                }
                setRetryNonce((n) => n + 1);
              }}
              className="inline-flex items-center gap-1.5 text-white/50 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Reconnect
            </button>
          )}
        </span>
      </div>
      <div ref={containerRef} className="h-[480px] w-full px-2 py-1" />
    </div>
  );
}
