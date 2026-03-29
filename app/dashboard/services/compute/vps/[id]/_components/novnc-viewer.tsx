'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  Keyboard,
  Clipboard,
  Loader2,
} from 'lucide-react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// RFB instance interface (loaded at runtime from /novnc/rfb.js)
interface RFBInstance {
  scaleViewport: boolean;
  resizeSession: boolean;
  clipViewport: boolean;
  focusOnClick: boolean;
  background: string;
  disconnect(): void;
  sendCredentials(credentials: { password: string }): void;
  sendCtrlAltDel(): void;
  clipboardPasteFrom(text: string): void;
  focus(): void;
  addEventListener(type: string, listener: (event: CustomEvent) => void): void;
  removeEventListener(type: string, listener: (event: CustomEvent) => void): void;
}

interface NoVncViewerProps {
  wsUrl: string;
  vncPassword?: string;
  serverName: string;
  onDisconnect?: (clean: boolean, reason?: string) => void;
}

export function NoVncViewer({ wsUrl, vncPassword, serverName, onDisconnect }: NoVncViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFBInstance | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  // Abort controller to cancel in-flight connect attempts on cleanup
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    if (!containerRef.current) return;

    // Cancel any previous in-flight connect
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    // Clean up existing connection
    if (rfbRef.current) {
      try { rfbRef.current.disconnect(); } catch { /* noop */ }
      rfbRef.current = null;
    }

    // Clear previous canvas elements
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    setStatus('connecting');

    try {
      // Load noVNC at runtime from static files (bypasses webpack ESM issues)
      // @ts-expect-error — runtime path served from public/, not a TS module
      const { default: RFB } = await import(/* webpackIgnore: true */ '/novnc/rfb.js');
      if (!containerRef.current || abort.signal.aborted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const fullUrl = `${protocol}//${window.location.host}${wsUrl}`;

      const rfb = new RFB(containerRef.current, fullUrl, {
        credentials: vncPassword ? { password: vncPassword } : undefined,
      });
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.background = '#08080a';
      rfb.focusOnClick = true;
      rfb.clipViewport = false;

      rfb.addEventListener('connect', () => {
        setStatus('connected');
      });

      rfb.addEventListener('credentialsrequired', () => {
        if (vncPassword) {
          rfb.sendCredentials({ password: vncPassword });
        }
      });

      rfb.addEventListener('disconnect', (e: CustomEvent) => {
        const reason = e.detail?.reason || 'Connection closed';
        const clean = e.detail?.clean ?? false;
        console.warn(`[noVNC] Disconnected: clean=${clean}, reason=${reason}`);
        setStatus('disconnected');
        rfbRef.current = null;
        onDisconnectRef.current?.(clean, reason);
      });

      rfb.addEventListener('securityfailure', (e: CustomEvent) => {
        setStatus('disconnected');
        rfbRef.current = null;
        onDisconnectRef.current?.(false, `Security failure: ${e.detail?.reason || 'Unknown'}`);
      });

      rfbRef.current = rfb;
    } catch (err) {
      console.error('[noVNC] Failed to initialize:', err);
      setStatus('disconnected');
      onDisconnectRef.current?.(false, err instanceof Error ? err.message : 'Failed to load VNC client');
    }
  }, [wsUrl, vncPassword]);

  useEffect(() => {
    connect();
    return () => {
      // Abort any in-flight async connect
      abortRef.current?.abort();
      if (rfbRef.current) {
        try { rfbRef.current.disconnect(); } catch { /* noop */ }
        rfbRef.current = null;
      }
    };
  }, [connect]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const sendCtrlAltDel = () => rfbRef.current?.sendCtrlAltDel();

  const pasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && rfbRef.current) {
        rfbRef.current.clipboardPasteFrom(text);
      }
    } catch {
      // Clipboard API may be blocked
    }
  };

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current.requestFullscreen();
    }
  };

  const reconnect = () => {
    connect();
  };

  const statusLabel =
    status === 'connecting' ? 'Connecting...' :
    status === 'connected' ? 'Connected' : 'Disconnected';

  const statusColor =
    status === 'connecting' ? 'text-amber-400' :
    status === 'connected' ? 'text-emerald-400' : 'text-red-400';

  const statusDot =
    status === 'connecting' ? 'bg-amber-500' :
    status === 'connected' ? 'bg-emerald-500' : 'bg-red-500';

  return (
    <div ref={wrapperRef} className="flex flex-col border border-white/[0.06] rounded-lg overflow-hidden bg-[#08080a]">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          {/* Traffic lights */}
          <div className="flex gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${status === 'connected' ? 'bg-red-500/60' : 'bg-white/10'}`} />
            <span className={`h-2.5 w-2.5 rounded-full ${status === 'connected' ? 'bg-yellow-500/60' : 'bg-white/10'}`} />
            <span className={`h-2.5 w-2.5 rounded-full ${status === 'connected' ? 'bg-green-500/60' : 'bg-white/10'}`} />
          </div>
          <span className="text-[11px] text-white/20 font-mono truncate max-w-[160px]">
            {serverName} — console
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Ctrl+Alt+Del */}
          <button
            onClick={sendCtrlAltDel}
            disabled={status !== 'connected'}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Send Ctrl+Alt+Del"
          >
            <Keyboard className="h-3 w-3" />
            <span className="hidden sm:inline">Ctrl+Alt+Del</span>
          </button>

          {/* Paste clipboard */}
          <button
            onClick={pasteClipboard}
            disabled={status !== 'connected'}
            className="p-1.5 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Paste from clipboard"
          >
            <Clipboard className="h-3.5 w-3.5" />
          </button>

          {/* Reconnect */}
          <button
            onClick={reconnect}
            disabled={status === 'connecting'}
            className="p-1.5 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Reconnect"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ── VNC Canvas ── */}
      <div className="relative" style={{ height: isFullscreen ? 'calc(100vh - 68px)' : '65vh' }}>
        {status === 'connecting' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#08080a]">
            <Loader2 className="h-6 w-6 text-cyan-400 animate-spin mb-3" />
            <p className="text-xs text-white/40">Establishing VNC connection...</p>
          </div>
        )}
        {status === 'disconnected' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#08080a]">
            <p className="text-sm text-white/40 mb-3">Connection lost</p>
            <button
              onClick={reconnect}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/70 text-sm font-medium hover:bg-white/[0.08] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reconnect
            </button>
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ background: '#08080a' }}
        />
      </div>

      {/* ── Status Bar ── */}
      <div className="flex items-center justify-between px-3 py-1 bg-white/[0.015] border-t border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot} ${status === 'connecting' ? 'animate-pulse' : ''}`} />
          <span className={`text-[10px] font-medium uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <span className="text-[10px] text-white/15">
          Click inside console to capture keyboard &middot; Esc to release
        </span>
      </div>
    </div>
  );
}
