'use client';

// Weblish terminal — xterm.js over the Lish websocket returned by
// POST /linode/instances/{id}/lish. The Linode counterpart of novnc-viewer.

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';

interface LinodeWeblishProps {
  wsUrl: string;
  serverName: string;
  onDisconnect?: (clean: boolean, reason?: string) => void;
}

export function LinodeWeblish({ wsUrl, serverName, onDisconnect }: LinodeWeblishProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [connState, setConnState] = useState<'connecting' | 'open' | 'closed' | 'error'>(
    'connecting'
  );
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
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
          term.write(evt.data);
        } else {
          term.write(new Uint8Array(evt.data as ArrayBuffer));
        }
      };
      socket.onclose = (evt) => {
        if (disposed) return;
        setConnState('closed');
        onDisconnect?.(evt.wasClean, evt.reason);
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
  }, [wsUrl, onDisconnect, retryNonce]);

  return (
    <div className="border border-white/[0.08] bg-[#0d0e11] rounded-[6px] overflow-hidden">
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
              onClick={() => setRetryNonce((n) => n + 1)}
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
