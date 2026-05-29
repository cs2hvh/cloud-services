'use client';

// Settings tab — numbered sections matching the editorial design.
// Server details (read-only metadata), hostname rename, lifecycle
// toggle preferences (placeholder for future server-side wiring),
// and danger-zone destroy with name-confirmation.

import {
  AlertTriangle, Loader2, Pencil, Trash2,
} from 'lucide-react';
import { type ServerData } from './types';
import { VpsResizeSection } from './vps-resize-section';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';

interface VpsSettingsTabProps {
  server: ServerData;
  onRefresh?: () => void;
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

function SectionHead({
  num,
  title,
  description,
  danger,
  action,
}: {
  num: string;
  title: string;
  description?: string;
  danger?: boolean;
  action?: { label: string; icon?: React.ReactNode; onClick?: () => void };
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-3.5 min-w-0">
        <span
          className={`${MONO} pt-0.5 text-[11px] font-semibold tracking-[0.06em] min-w-[24px]`}
          style={{ color: danger ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.35)' }}
        >
          {num}
        </span>
        <div className="min-w-0">
          <h3
            className="text-[15px] font-semibold tracking-[-0.015em] mb-0.5"
            style={{ color: danger ? '#fca5a5' : '#ffffff' }}
          >
            {title}
          </h3>
          {description && <p className="text-[12px] text-white/50">{description}</p>}
        </div>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`${MONO} inline-flex items-center gap-1.5 h-7 px-2.5 text-[10px] uppercase tracking-[0.12em] text-white/55 hover:text-white border border-white/[0.08] hover:border-white/[0.14] bg-transparent hover:bg-white/[0.03] rounded-[4px] transition-colors shrink-0`}
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}

export function VpsSettingsTab({
  server,
  onRefresh,
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
  const inputCls = `${MONO} h-9 w-full max-w-md px-3 border border-white/[0.08] bg-[#0d0e11] text-[12.5px] text-white placeholder:text-white/25 outline-none focus:border-white/25 rounded-[5px]`;

  return (
    <div className="space-y-7">
      {/* ── 01 · Server details ──────────────────────────── */}
      <section>
        <SectionHead
          num="01"
          title="Server details"
          description="Identity and provisioning metadata."
        />

        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
          {[
            { label: 'Server ID', value: String(server.id), mono: true },
            { label: 'VMID', value: server.vmid !== null && server.vmid !== undefined ? String(server.vmid) : '—', mono: true },
            { label: 'Node', value: server.node || '—', mono: true },
            { label: 'Region', value: server.displayRegion || server.region || '—' },
            { label: 'Operating system', value: server.os || '—' },
            { label: 'Created', value: new Date(server.created_at).toLocaleString() },
            ...(server.billing_start
              ? [{ label: 'Billing start', value: new Date(server.billing_start).toLocaleString() }]
              : []),
          ].map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[140px_1fr] gap-3 items-center px-5 py-2.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors"
            >
              <span className={`${MONO} text-[10px] uppercase tracking-[0.08em] font-semibold text-white/40`}>
                {row.label}
              </span>
              <span className={`text-[12.5px] text-white/85 truncate ${row.mono ? MONO : ''}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 02 · Hostname ────────────────────────────────── */}
      <section>
        <SectionHead
          num="02"
          title="Hostname"
          description="Name used in the dashboard, console, and logs."
        />

        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4">
          {showRenameInput ? (
            <div className="space-y-3">
              <div>
                <label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>
                  New hostname
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. prod-web-01"
                  className={inputCls}
                />
                <p className={`${MONO} mt-1.5 text-[10px] text-white/30`}>
                  Alphanumeric and hyphens · 1–63 characters
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRename}
                  disabled={renaming || !editName.trim()}
                  className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
                  style={{ background: ACCENT, color: '#001930' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT_BRIGHT; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
                >
                  {renaming ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowRenameInput(false)}
                  className={`${MONO} h-9 px-3.5 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className={`${MONO} text-[14px] text-white truncate`}>{server.name}</p>
                <p className={`${MONO} mt-1 text-[10px] text-white/30`}>
                  Alphanumeric and hyphens · 1–63 characters
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditName(server.name);
                  setShowRenameInput(true);
                }}
                className={`${MONO} shrink-0 inline-flex h-9 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
              >
                <Pencil className="h-3 w-3" /> Rename
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── 03 · Resize ──────────────────────────────────── */}
      <section>
        <SectionHead
          num="03"
          title="Resize"
          description="Move to a larger or different plan. Reboots the server; storage can only grow."
        />
        <VpsResizeSection server={server} onRefresh={onRefresh} />
      </section>

      {/* ── 04 · Danger zone ─────────────────────────────── */}
      <section>
        <SectionHead
          num="04"
          title="Danger zone"
          description="Destructive actions cannot be undone."
          danger
        />

        <div
          className="border rounded-[6px] px-5 py-5"
          style={{
            background: 'linear-gradient(135deg, #111216, rgba(248,113,113,0.03))',
            borderColor: 'rgba(248,113,113,0.18)',
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 shrink-0 flex items-center justify-center border border-red-500/25 bg-red-500/[0.06] rounded-[5px]">
              <AlertTriangle className="h-4 w-4 text-red-300" />
            </div>
            <div className="min-w-0">
              <h4 className="text-[13.5px] font-semibold text-red-200">Destroy this server</h4>
              <p className={`${MONO} mt-1 text-[11px] text-white/50 leading-relaxed`}>
                Permanently deletes the VM, removes its IP route, and frees all attached resources.
                Snapshots tied to this server are also discarded.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>
                Type{' '}
                <span
                  className={`${MONO} normal-case tracking-normal text-red-300 bg-red-500/10 px-1.5 py-0.5 border border-red-500/15 rounded-[3px]`}
                >
                  {server.name}
                </span>{' '}
                to confirm
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={server.name}
                className={`${inputCls} border-red-500/15 placeholder:text-white/15 focus:border-red-400/40`}
              />
            </div>
            <button
              type="button"
              onClick={onDestroy}
              disabled={destroying || confirmName !== server.name}
              className={`${MONO} inline-flex h-9 items-center gap-2 px-4 border border-red-500/30 bg-red-500/90 text-white text-[11px] uppercase tracking-[0.14em] font-semibold hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-[5px] transition-colors`}
            >
              {destroying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Destroy server
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

