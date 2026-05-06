'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Globe, Info, Loader2, Plus, ServerCog, Settings, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { RegistrarSettings } from './domain-detail-types';
import { looksInternal } from './domain-detail-types';

const MIN_NAMESERVERS = 2;
const MAX_NAMESERVERS = 13;
const NAMESERVER_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

interface DomainSettingsTabProps {
  registrarLoading: boolean;
  registrarError: string | null;
  registrarSettings: RegistrarSettings | null;
  savingAutorenew: boolean;
  savingNameservers: boolean;
  onToggleAutorenew: () => void;
  onSetNameservers: (nameservers: string[]) => Promise<boolean>;
  onUseManagedNameservers: () => Promise<boolean>;
}

function PropRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="mt-0.5 text-xs text-white/40 leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function normalizeNameserver(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function NameserverSettings({
  settings,
  saving,
  onSetNameservers,
  onUseManagedNameservers,
}: {
  settings: RegistrarSettings;
  saving: boolean;
  onSetNameservers: (nameservers: string[]) => Promise<boolean>;
  onUseManagedNameservers: () => Promise<boolean>;
}) {
  const isCustomSelected = settings.nameserver_mode === 'custom';
  const isManagedSelected = settings.nameserver_mode === 'managed';
  const [nameserverMode, setNameserverMode] = useState<'managed' | 'custom'>(
    isCustomSelected ? 'custom' : 'managed'
  );
  const [customNameservers, setCustomNameservers] = useState<string[]>(['', '']);
  const [showBreakingDnsWarning, setShowBreakingDnsWarning] = useState(false);
  const currentCustomNameservers = settings.nameservers
    .map(normalizeNameserver)
    .filter(Boolean);

  useEffect(() => {
    setNameserverMode(isCustomSelected ? 'custom' : 'managed');
  }, [isCustomSelected]);

  const normalizedCustomNameservers = useMemo(
    () => customNameservers.map(normalizeNameserver).filter(Boolean),
    [customNameservers]
  );
  const uniqueCustomNameservers = useMemo(
    () => Array.from(new Set(normalizedCustomNameservers)),
    [normalizedCustomNameservers]
  );
  const hasInvalidCustomNameservers = normalizedCustomNameservers.some((value) => !NAMESERVER_RE.test(value));
  const canSaveCustom = uniqueCustomNameservers.length >= MIN_NAMESERVERS && !hasInvalidCustomNameservers;

  const updateCustomNameserver = (index: number, value: string) => {
    setCustomNameservers((prev) => prev.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const addCustomNameserver = () => {
    if (customNameservers.length >= MAX_NAMESERVERS) {
      toast.error(`You can add up to ${MAX_NAMESERVERS} nameservers.`);
      return;
    }
    setCustomNameservers((prev) => [...prev, '']);
  };

  const removeCustomNameserver = (index: number) => {
    setCustomNameservers((prev) => {
      if (prev.length <= MIN_NAMESERVERS) return prev;
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const handleNameserverModeChange = async (value: 'managed' | 'custom') => {
    if (value === 'custom') {
      if (isManagedSelected) {
        setShowBreakingDnsWarning(true);
      } else {
        setNameserverMode('custom');
        setCustomNameservers(['', '']);
      }
      return;
    }

    setNameserverMode('managed');

    if (isManagedSelected) {
      return;
    }
    const updated = await onUseManagedNameservers();
    if (!updated) {
      setNameserverMode(isCustomSelected ? 'custom' : 'managed');
    }
  };

  const handleConfirmBreakingDns = () => {
    setShowBreakingDnsWarning(false);
    setNameserverMode('custom');
    setCustomNameservers(['', '']);
  };

  const saveCustomNameservers = async () => {
    if (!canSaveCustom) {
      toast.error('Enter at least two valid nameservers.');
      return;
    }
    const updated = await onSetNameservers(uniqueCustomNameservers);
    if (updated) {
      setCustomNameservers(['', '']);
    }
  };

  return (
    <>
      <AlertDialog open={showBreakingDnsWarning} onOpenChange={setShowBreakingDnsWarning}>
        <AlertDialogContent className="border-white/[0.1] bg-[#0a0a0a]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Replace Nameservers?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-white/70">
              <span className="block">
                Changing to custom nameservers will remove the current ones. Your existing DNS records will no longer be managed by AhuraCloud.
              </span>
              <span className="block text-amber-300/90">
                Warning: this may affect your website and email if DNS records are not configured at your new DNS provider.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/[0.1] text-white hover:bg-white/[0.05]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmBreakingDns} className="bg-white text-black hover:bg-white/90">Change Nameservers</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="border-t border-white/[0.04] py-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <ServerCog className="mt-0.5 h-4 w-4 text-white/35" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white">Nameservers</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  isCustomSelected
                    ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'
                    : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                {isCustomSelected ? 'Custom active' : 'Ahura managed'}
              </span>
            </div>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-white/40">
              Choose who manages this domain&apos;s authoritative nameservers.
            </p>
          </div>

          <div className="w-full sm:w-[260px]">
            <Select
              value={nameserverMode}
              onValueChange={(value) => void handleNameserverModeChange(value as 'managed' | 'custom')}
              disabled={saving}
            >
              <SelectTrigger className="h-9 w-full border-white/[0.08] bg-black/30 text-white">
                <SelectValue placeholder="Select nameserver mode" />
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

        {nameserverMode === 'managed' ? (
          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300/80" />
              <div>
                <p className="text-sm font-medium text-white">Managed by Ahura</p>
                <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-white/40">
                  Ahura controls the registrar nameservers and can manage DNS records automatically.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4">
            {isCustomSelected && currentCustomNameservers.length > 0 && (
              <div className="mb-4 rounded-md border border-cyan-500/15 bg-cyan-500/[0.04] p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-cyan-200/70">
                  Current nameservers
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {currentCustomNameservers.map((nameserver) => (
                    <div
                      key={nameserver}
                      className="rounded border border-white/[0.06] bg-black/30 px-2.5 py-2 font-mono text-xs text-white/70"
                    >
                      {nameserver}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-white">Replace custom nameservers</p>
                <p className="mt-0.5 text-xs text-white/35">
                  Add at least two valid hostnames. Saving replaces the current nameserver set.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="self-start text-white/45 hover:text-white hover:bg-white/[0.06]"
                onClick={addCustomNameserver}
                disabled={saving || customNameservers.length >= MAX_NAMESERVERS}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add
              </Button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {customNameservers.map((nameserver, index) => {
                const normalized = normalizeNameserver(nameserver);
                const invalid = Boolean(normalized) && !NAMESERVER_RE.test(normalized);
                return (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={nameserver}
                      onChange={(e) => updateCustomNameserver(index, e.target.value)}
                      placeholder={`ns${index + 1}.provider.com`}
                      className={`h-9 bg-black/40 font-mono text-sm focus:border-white/[0.2] ${
                        invalid ? 'border-red-500/40' : 'border-white/[0.08]'
                      }`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 px-0 text-white/35 hover:text-white hover:bg-white/[0.06]"
                      onClick={() => removeCustomNameserver(index)}
                      disabled={saving || customNameservers.length <= MIN_NAMESERVERS}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5 text-xs">
                <Info className="h-3.5 w-3.5 text-white/30" />
                <span className={canSaveCustom ? 'text-white/35' : 'text-amber-300/80'}>
                  {canSaveCustom ? `${uniqueCustomNameservers.length} nameservers ready` : 'Enter at least two valid nameservers.'}
                </span>
              </div>
              <Button
                size="sm"
                className="bg-white text-black hover:bg-white/90 font-medium"
                disabled={saving}
                onClick={saveCustomNameservers}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Save custom nameservers
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function DomainSettingsTab({
  registrarLoading,
  registrarError,
  registrarSettings,
  savingAutorenew,
  savingNameservers,
  onToggleAutorenew,
  onSetNameservers,
  onUseManagedNameservers,
}: DomainSettingsTabProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <Settings className="h-4 w-4 text-white/35" />
          <p className="text-sm font-medium text-white">Domain Settings</p>
        </div>

        <div className="px-4">
          {registrarError && (
            <div className="py-3 border-b border-white/[0.04]">
              <p className="text-xs text-red-300/80">
                {looksInternal(registrarError)
                  ? 'Unable to load domain settings. Refresh to try again.'
                  : registrarError}
              </p>
            </div>
          )}

          {registrarLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading settings…
            </div>
          ) : registrarSettings?.managed ? (
            <>
              {registrarSettings.zone && (
                <div className="py-3 border-b border-white/[0.04]">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-white/30 mb-1.5">Managed Zone</p>
                  <p className="text-xs font-mono text-white/60">{registrarSettings.zone}</p>
                </div>
              )}

              {registrarSettings.expires_at && (
                <PropRow
                  label="Expiry date"
                  description="When this domain registration expires."
                >
                  <span className="text-xs font-mono text-white/70">
                    {new Date(registrarSettings.expires_at).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </PropRow>
              )}

              <PropRow
                label="Auto-renew"
                description="Automatically renew this domain before it expires."
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${
                    registrarSettings.autorenew_enabled ? 'text-emerald-400' : 'text-white/35'
                  }`}>
                    {registrarSettings.autorenew_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-white/[0.1] text-white/70 hover:bg-white/[0.06] hover:text-white text-xs"
                    disabled={
                      savingAutorenew ||
                      typeof registrarSettings.autorenew_enabled !== 'boolean'
                    }
                    onClick={onToggleAutorenew}
                  >
                    {savingAutorenew ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      registrarSettings.autorenew_enabled ? 'Disable' : 'Enable'
                    )}
                  </Button>
                </div>
              </PropRow>

              <NameserverSettings
                settings={registrarSettings}
                saving={savingNameservers}
                onSetNameservers={onSetNameservers}
                onUseManagedNameservers={onUseManagedNameservers}
              />
            </>
          ) : (
            <div className="py-4">
              <p className="text-sm text-white/60 font-medium mb-1">External domain</p>
              <p className="text-xs text-white/40 leading-relaxed max-w-md">
                This domain is registered with an external registrar. To update nameservers or renewal
                settings, log in to your domain registrar directly.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/domains/marketplace">
          <Button
            variant="outline"
            size="sm"
            className="border-white/[0.1] text-white/60 hover:bg-white/[0.05] hover:text-white"
          >
            Register Another Domain
          </Button>
        </Link>
        <Link href="/dashboard/domains">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/40 hover:text-white hover:bg-white/[0.05]"
          >
            Back to Domains
          </Button>
        </Link>
      </div>
    </div>
  );
}
