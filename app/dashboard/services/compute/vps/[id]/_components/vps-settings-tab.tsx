'use client';

import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type ServerData } from './types';

interface VpsSettingsTabProps {
  server: ServerData;
  editName: string;
  setEditName: (v: string) => void;
  showRenameInput: boolean;
  setShowRenameInput: (v: boolean) => void;
  renaming: boolean;
  onRename: () => void;
  confirmName: string;
  setConfirmName: (v: string) => void;
  destroying: boolean;
  onDestroy: () => void;
}

export function VpsSettingsTab({
  server,
  editName,
  setEditName,
  showRenameInput,
  setShowRenameInput,
  renaming,
  onRename,
  confirmName,
  setConfirmName,
  destroying,
  onDestroy,
}: VpsSettingsTabProps) {
  return (
    <div className="space-y-6">
      {/* Server metadata — table */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30 mb-4">Server Details</p>
        <div className="border border-white/[0.06] rounded-lg bg-[#08080a] divide-y divide-white/[0.04]">
          {[
            { label: 'Server ID', value: String(server.id), mono: true },
            { label: 'Created', value: new Date(server.created_at).toLocaleString(), mono: false },
            ...(server.billing_start ? [{ label: 'Billing Start', value: new Date(server.billing_start).toLocaleString(), mono: false }] : []),
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.015] transition-colors">
              <span className="text-[12px] text-white/30">{row.label}</span>
              <span className={`text-[13px] text-white/70 ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rename */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30 mb-4">Server Name</p>
        <div className="border border-white/[0.06] rounded-lg bg-[#08080a] px-5 py-5">
          {showRenameInput ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/45 mb-2 block">New hostname</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. prod-web-01"
                  className="w-full max-w-md bg-white/[0.04] border border-white/[0.08] rounded-md px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-white/20 focus:outline-none focus:border-blue-400/40 focus:ring-1 focus:ring-blue-400/10 transition-all"
                />
                <p className="mt-1.5 text-[11px] text-white/20">Alphanumeric and hyphens only, 1-63 characters.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={onRename}
                  disabled={renaming || !editName.trim()}
                  className="border border-cyan-400/25 bg-cyan-500/90 text-slate-950 hover:bg-cyan-400 rounded-md font-semibold"
                >
                  {renaming ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                  Save Changes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRenameInput(false)}
                  className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] rounded-md"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-mono text-white">{server.name}</p>
                <p className="mt-1 text-[11px] text-white/20">Alphanumeric and hyphens only, 1-63 characters.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditName(server.name);
                  setShowRenameInput(true);
                }}
                className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] rounded-md"
              >
                <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-400/60 mb-4">Danger Zone</p>
        <div className="border border-red-500/12 rounded-lg overflow-hidden">
          <div className="relative px-5 py-5">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/[0.03] to-transparent" />
            <div className="relative">
              <div className="flex items-start gap-4 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-red-400">Destroy this server</h3>
                  <p className="mt-1.5 text-[13px] text-white/40 leading-relaxed">
                    This will permanently delete the VM, remove its IP route, and free all associated resources.
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="space-y-3 ml-14">
                <div>
                  <label className="text-xs text-white/45 mb-2 block">
                    Type <span className="font-mono text-red-300 bg-red-500/10 px-1.5 py-0.5 border border-red-500/15 rounded-md">{server.name}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder={server.name}
                    className="w-full max-w-md bg-white/[0.04] border border-red-500/15 rounded-md px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-white/12 focus:outline-none focus:border-red-400/40 focus:ring-1 focus:ring-red-400/10 transition-all"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={onDestroy}
                  disabled={destroying || confirmName !== server.name}
                  className="border border-red-500/30 bg-red-500/90 text-white hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-md font-semibold"
                >
                  {destroying ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                  )}
                  Destroy Server
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
