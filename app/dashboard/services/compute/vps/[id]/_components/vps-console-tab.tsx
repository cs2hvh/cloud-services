'use client';

import {
  Loader2,
  Monitor,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import { type ServerData } from './types';
import { NoVncViewer } from './novnc-viewer';

interface VpsConsoleTabProps {
  server: ServerData;
  isRunning: boolean;
  consoleState: 'idle' | 'loading' | 'ready' | 'error';
  consoleWsPath: string | null;
  consoleVncPassword: string | null;
  consoleError: string | null;
  onLaunchConsole: () => void;
}

export function VpsConsoleTab({
  server,
  isRunning,
  consoleState,
  consoleWsPath,
  consoleVncPassword,
  consoleError,
  onLaunchConsole,
}: VpsConsoleTabProps) {
  if (!isRunning) {
    return (
      <div className="border border-white/[0.06] bg-[#111216] p-16 flex flex-col items-center justify-center text-center">
        <div className="h-14 w-14 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center mb-4">
          <Monitor className="h-6 w-6 text-white/20" />
        </div>
        <p className="text-sm font-semibold text-white/50">Server is offline</p>
        <p className="text-[12px] text-white/25 mt-1">Start your server to access the web console.</p>
      </div>
    );
  }

  if (consoleState === 'idle') {
    return (
      <div className="border border-white/[0.06] bg-[#111216] p-16 flex flex-col items-center justify-center text-center">
        <div className="h-14 w-14 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] flex items-center justify-center mb-4">
          <Monitor className="h-6 w-6 text-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-white/80">Web Console</p>
        <p className="text-[12px] text-white/30 mt-1 mb-5 max-w-xs">
          Launch an interactive console session directly in your browser.
          Works with all operating systems — Linux, Windows, and more.
        </p>
        <button
          onClick={onLaunchConsole}
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-blue-400/25 bg-blue-500/90 text-slate-950 text-sm font-semibold hover:bg-blue-400 transition-colors"
        >
          <Terminal className="h-4 w-4" /> Launch Console
        </button>
      </div>
    );
  }

  if (consoleState === 'loading') {
    return (
      <div className="border border-white/[0.06] bg-[#111216] p-16 flex flex-col items-center justify-center text-center">
        <Loader2 className="h-8 w-8 text-[#0095FF] animate-spin mb-4" />
        <p className="text-sm font-semibold text-white/60">Starting console session...</p>
        <p className="text-[12px] text-white/25 mt-1">Establishing secure VNC connection to your server.</p>
      </div>
    );
  }

  if (consoleState === 'error') {
    return (
      <div className="border border-red-500/15 bg-[#0d0e11] p-16 flex flex-col items-center justify-center text-center">
        <div className="h-14 w-14 rounded-xl border border-red-500/20 bg-red-500/[0.06] flex items-center justify-center mb-4">
          <Monitor className="h-6 w-6 text-red-400" />
        </div>
        <p className="text-sm font-semibold text-red-400/80">Console Error</p>
        <p className="text-[12px] text-white/30 mt-1 mb-5">{consoleError}</p>
        <button
          onClick={onLaunchConsole}
          className="inline-flex items-center gap-2 px-4 py-2 border border-white/[0.08] bg-white/[0.04] text-white/70 text-sm font-medium hover:bg-white/[0.08] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  // consoleState === 'ready'
  return (
    <div className="space-y-3">
      <NoVncViewer
        wsUrl={consoleWsPath!}
        vncPassword={consoleVncPassword || undefined}
        serverName={server.name}
        onDisconnect={(clean, reason) => {
          if (!clean) {
            console.warn('[console] VNC disconnected:', reason);
          }
        }}
      />
      <p className="text-[11px] text-white/20 text-center">
        Console sessions expire after 10 minutes of inactivity.
        Use Ctrl+Alt+Del for Windows login. Click inside the console to capture input.
      </p>
    </div>
  );
}
