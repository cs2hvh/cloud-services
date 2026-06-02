'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Globe, Info, Loader2, Plus, ServerCog, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyToClipboard } from '@/lib/utils/safe-clipboard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { DomainConnectionItem, RegistrarSettings } from './domain-detail-types';

const MIN_NAMESERVERS = 2;
const MAX_NAMESERVERS = 13;
const NAMESERVER_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

function normalizeNs(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function formatList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// ─── Shared confirm dialog ────────────────────────────────────────────────────

interface NsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  warning: string;
  confirmLabel: string;
}

function NsDialog({ open, onClose, onConfirm, title, body, warning, confirmLabel }: NsDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="border-white/[0.1] bg-[#0a0a0a]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-white/70">
            <span className="block">{body}</span>
            <span className="block text-amber-300/90">{warning}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/[0.1] text-white hover:bg-white/[0.05]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-white text-black hover:bg-white/90">
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Managed panel ────────────────────────────────────────────────────────────

function ManagedPanel({
  saving,
  pendingApply,
  onApply,
}: {
  saving?: boolean;
  pendingApply?: boolean;
  onApply?: () => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
      <div className="flex items-start gap-2.5">
        {saving ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-emerald-300/60" />
        ) : (
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/80" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">
            {saving ? 'Switching to managed…' : 'Managed by Ahura'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/40">
            {saving
              ? 'Updating nameservers at the registrar. This may take a moment.'
              : 'AhuraCloud controls the registrar nameservers and manages your DNS records automatically.'}
          </p>
          {pendingApply && !saving && (
            <Button
              size="sm"
              className="mt-3 bg-white font-medium text-black hover:bg-white/90"
              onClick={onApply}
            >
              Save changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Custom panel ─────────────────────────────────────────────────────────────

interface CustomPanelProps {
  hasExisting: boolean;
  currentNameservers: string[];
  inputs: string[];
  saving: boolean;
  hasDuplicates: boolean;
  hasInvalid: boolean;
  isNoOp: boolean;
  canSave: boolean;
  readyCount: number;
  onUpdate: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSave: () => void;
}

function CustomPanel({
  hasExisting,
  currentNameservers,
  inputs,
  saving,
  hasDuplicates,
  hasInvalid,
  isNoOp,
  canSave,
  readyCount,
  onUpdate,
  onAdd,
  onRemove,
  onSave,
}: CustomPanelProps) {
  const sectionTitle = hasExisting ? 'Replace nameservers' : 'Set nameservers';
  const sectionHint = hasExisting
    ? 'New entries replace the full current set. DNS propagation can take up to 48 hours.'
    : 'Add at least two valid nameserver hostnames.';
  const saveLabel = hasExisting ? 'Update nameservers' : 'Save nameservers';

  const infoText = hasDuplicates
    ? 'Remove duplicate nameservers.'
    : isNoOp
      ? 'No changes — nameservers match the current set.'
      : canSave
        ? `${readyCount} nameserver${readyCount !== 1 ? 's' : ''} ready`
        : hasInvalid
          ? 'Fix invalid nameserver hostnames.'
          : 'Enter at least two valid nameservers.';

  const infoColor = canSave || isNoOp ? 'text-white/35' : 'text-amber-300/80';

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20">
      {/* Active nameservers (read-only) */}
      {hasExisting && currentNameservers.length > 0 && (
        <div className="border-b border-white/[0.06] px-4 py-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">
              Active nameservers
            </p>
            <button
              type="button"
              onClick={() => {
                void copyToClipboard(currentNameservers.join('\n'));
                toast.success('Copied to clipboard.');
              }}
              className="flex items-center gap-1 rounded px-1 text-[11px] text-white/30 transition-colors hover:text-white/60"
              title="Copy all"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {currentNameservers.map((ns) => (
              <div
                key={ns}
                className="rounded border border-white/[0.05] bg-black/30 px-3 py-2 font-mono text-xs text-white/55"
              >
                {ns}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input section */}
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">{sectionTitle}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-white/35">{sectionHint}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 self-start text-white/40 hover:bg-white/[0.06] hover:text-white"
            onClick={onAdd}
            disabled={saving || inputs.length >= MAX_NAMESERVERS}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {inputs.map((value, index) => {
            const norm = normalizeNs(value);
            const invalid = Boolean(norm) && !NAMESERVER_RE.test(norm);
            return (
              <div key={index} className="flex items-center gap-1.5">
                <Input
                  value={value}
                  onChange={(e) => onUpdate(index, e.target.value)}
                  placeholder={`ns${index + 1}.provider.com`}
                  disabled={saving}
                  className={`h-9 flex-1 bg-black/40 font-mono text-xs transition-colors ${
                    invalid
                      ? 'border-red-500/40 focus:border-red-500/60'
                      : 'border-white/[0.08] focus:border-white/[0.2]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={saving || inputs.length <= MIN_NAMESERVERS}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/25 transition-colors hover:bg-white/[0.05] hover:text-white/55 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer: status + save */}
        <div className="mt-4 flex flex-col gap-2.5 border-t border-white/[0.06] pt-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 text-white/25" />
            <span className={`text-xs ${infoColor}`}>{infoText}</span>
          </div>
          <Button
            size="sm"
            className="w-full bg-white font-medium text-black hover:bg-white/90 sm:w-auto"
            disabled={saving || !canSave}
            onClick={onSave}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              saveLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── NameserverSettings (main export) ─────────────────────────────────────────

type ActiveDialog = 'toCustom' | 'toManaged' | 'replace' | null;

export interface NameserverSettingsProps {
  settings: RegistrarSettings;
  saving: boolean;
  connections?: DomainConnectionItem[];
  onSetNameservers: (nameservers: string[]) => Promise<boolean>;
  onUseManagedNameservers: () => Promise<boolean>;
}

export function NameserverSettings({
  settings,
  saving,
  connections = [],
  onSetNameservers,
  onUseManagedNameservers,
}: NameserverSettingsProps) {
  const isCustomActive = settings.nameserver_mode === 'custom';
  const isManagedActive = settings.nameserver_mode === 'managed';

  const [mode, setMode] = useState<'managed' | 'custom'>(isCustomActive ? 'custom' : 'managed');
  const [inputs, setInputs] = useState<string[]>(['', '']);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [switching, setSwitching] = useState(false);

  const currentNameservers = useMemo(
    () => settings.nameservers.map(normalizeNs).filter(Boolean),
    [settings.nameservers]
  );

  // Connections that are live (not failed/removed) — these are disrupted by NS changes.
  const liveConnections = useMemo(
    () => connections.filter((c) => c.status !== 'failed' && c.status !== 'removed'),
    [connections]
  );
  const uniqueAppNames = useMemo(
    () => [...new Set(liveConnections.map((c) => c.appName))],
    [liveConnections]
  );

  // Sync local mode and clear inputs when server state changes after a successful save.
  useEffect(() => {
    setMode(isCustomActive ? 'custom' : 'managed');
    setInputs(['', '']);
  }, [isCustomActive]);

  const normalizedInputs = useMemo(() => inputs.map(normalizeNs).filter(Boolean), [inputs]);
  const uniqueInputs = useMemo(() => Array.from(new Set(normalizedInputs)), [normalizedInputs]);

  const hasDuplicates = uniqueInputs.length < normalizedInputs.length;
  const hasInvalid = normalizedInputs.some((v) => !NAMESERVER_RE.test(v));
  const isNoOp =
    isCustomActive &&
    currentNameservers.length > 0 &&
    uniqueInputs.length === currentNameservers.length &&
    uniqueInputs.every((ns) => currentNameservers.includes(ns));
  const canSave =
    uniqueInputs.length >= MIN_NAMESERVERS && !hasInvalid && !hasDuplicates && !isNoOp;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleModeChange = (next: 'managed' | 'custom') => {
    if (next === 'custom') {
      if (isManagedActive) {
        setActiveDialog('toCustom');
      } else {
        setMode('custom');
        setInputs(['', '']);
      }
      return;
    }
    if (isCustomActive) {
      setActiveDialog('toManaged');
    } else {
      setMode('managed');
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    // Require extra confirmation when overwriting an existing custom set.
    if (isCustomActive && currentNameservers.length > 0) {
      setActiveDialog('replace');
    } else {
      void executeSave();
    }
  };

  const executeSave = async () => {
    const ok = await onSetNameservers(uniqueInputs);
    if (ok) setInputs(['', '']);
  };

  const executeToManaged = () => {
    setActiveDialog(null);
    setMode('managed'); // local only — API fires when user clicks Save changes
  };

  const applyManagedSwitch = async () => {
    setSwitching(true);
    const ok = await onUseManagedNameservers();
    setSwitching(false);
    if (!ok) setMode('custom'); // rollback on failure
  };

  const updateInput = (index: number, value: string) =>
    setInputs((prev) => prev.map((item, idx) => (idx === index ? value : item)));

  const addInput = () => {
    if (inputs.length >= MAX_NAMESERVERS) {
      toast.error(`Maximum ${MAX_NAMESERVERS} nameservers allowed.`);
      return;
    }
    setInputs((prev) => [...prev, '']);
  };

  const removeInput = (index: number) =>
    setInputs((prev) => {
      if (prev.length <= MIN_NAMESERVERS) return prev;
      return prev.filter((_, idx) => idx !== index);
    });

  // Badge reflects local (optimistic) mode so the user sees the pending change immediately.
  const serverMode: 'managed' | 'custom' = isCustomActive ? 'custom' : 'managed';
  const isUnsaved = mode !== serverMode;

  const n = liveConnections.length;
  const appList = formatList(uniqueAppNames);

  return (
    <>
      {/* managed → custom */}
      <NsDialog
        open={activeDialog === 'toCustom'}
        onClose={() => setActiveDialog(null)}
        onConfirm={() => {
          setActiveDialog(null);
          setMode('custom');
          setInputs(['', '']);
        }}
        title="Switch to Custom Nameservers?"
        body={
          n > 0
            ? `Changing to custom nameservers removes AhuraCloud-managed DNS records. You have ${n} active connection${n !== 1 ? 's' : ''} (${appList}) that depend on these records.`
            : "Changing to custom nameservers removes the current AhuraCloud-managed ones. DNS records won't be managed by AhuraCloud anymore."
        }
        warning={
          n > 0
            ? `Warning: ${appList} will go offline until you manually add TXT verification and A/CNAME records at your new DNS provider.`
            : "Warning: your website and email may be affected until you configure records at the new DNS provider."
        }
        confirmLabel="Switch to Custom"
      />

      {/* custom → managed */}
      <NsDialog
        open={activeDialog === 'toManaged'}
        onClose={() => setActiveDialog(null)}
        onConfirm={() => void executeToManaged()}
        title="Switch to Ahura Managed?"
        body={
          n > 0
            ? `Your custom nameservers will be replaced with AhuraCloud nameservers. AhuraCloud will take over DNS for your ${n} active connection${n !== 1 ? 's' : ''} (${appList}).`
            : "Your current custom nameservers will be replaced with AhuraCloud nameservers and DNS management returns to AhuraCloud."
        }
        warning="Warning: DNS changes can take up to 48 hours to propagate. Your site or email may be affected during this time."
        confirmLabel="Switch to Managed"
      />

      {/* replace custom → new custom */}
      <NsDialog
        open={activeDialog === 'replace'}
        onClose={() => setActiveDialog(null)}
        onConfirm={() => {
          setActiveDialog(null);
          void executeSave();
        }}
        title="Replace Nameservers?"
        body={
          n > 0
            ? `This will replace your current nameservers. Your ${n} active connection${n !== 1 ? 's' : ''} (${appList}) may be temporarily disrupted during propagation.`
            : "This will replace your current custom nameservers with the ones you entered."
        }
        warning="Warning: DNS changes can take up to 48 hours to propagate. Your site or email may be affected during this time."
        confirmLabel="Replace Nameservers"
      />

      <div className="border-t border-white/[0.04] py-5">
        {/* Header: label + badge + mode selector */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <ServerCog className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-white">Nameservers</p>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${
                    mode === 'custom'
                      ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'
                      : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                  }`}
                >
                  {mode === 'custom' ? 'Custom active' : 'Ahura managed'}
                  {isUnsaved && <span className="ml-1 opacity-50">(unsaved)</span>}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-white/40">
                Choose who manages this domain&apos;s authoritative nameservers.
              </p>
            </div>
          </div>

          <div className="w-full shrink-0 sm:w-[240px]">
            <Select
              value={mode}
              onValueChange={(v) => handleModeChange(v as 'managed' | 'custom')}
              disabled={saving}
            >
              <SelectTrigger className="h-9 w-full border-white/[0.08] bg-black/30 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/[0.08] bg-[#101010] text-white">
                <SelectItem value="managed">
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                    Managed by Ahura
                  </span>
                </SelectItem>
                <SelectItem value="custom">
                  <span className="inline-flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-cyan-300" />
                    Custom nameservers
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {mode === 'managed' ? (
          <ManagedPanel
            saving={saving || switching}
            pendingApply={isUnsaved}
            onApply={() => void applyManagedSwitch()}
          />
        ) : (
          <CustomPanel
            hasExisting={isCustomActive && currentNameservers.length > 0}
            currentNameservers={currentNameservers}
            inputs={inputs}
            saving={saving}
            hasDuplicates={hasDuplicates}
            hasInvalid={hasInvalid}
            isNoOp={isNoOp}
            canSave={canSave}
            readyCount={uniqueInputs.length}
            onUpdate={updateInput}
            onAdd={addInput}
            onRemove={removeInput}
            onSave={handleSave}
          />
        )}
      </div>
    </>
  );
}
