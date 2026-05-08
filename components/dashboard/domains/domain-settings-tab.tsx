'use client';

import { Loader2, Settings } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { DomainConnectionItem, RegistrarSettings } from './domain-detail-types';
import { looksInternal } from './domain-detail-types';
import { NameserverSettings } from './nameserver-settings';

export interface DomainSettingsTabProps {
  registrarLoading: boolean;
  registrarError: string | null;
  registrarSettings: RegistrarSettings | null;
  savingAutorenew: boolean;
  savingNameservers: boolean;
  connections?: DomainConnectionItem[];
  onToggleAutorenew: () => void;
  onSetNameservers: (nameservers: string[]) => Promise<boolean>;
  onUseManagedNameservers: () => Promise<boolean>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PropRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-white/[0.04] py-4 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-white/40">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-5 px-4 py-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-2.5 w-44 animate-pulse rounded bg-white/[0.04]" />
          </div>
          <div className="h-7 w-20 animate-pulse rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function DomainSettingsTab({
  registrarLoading,
  registrarError,
  registrarSettings,
  savingAutorenew,
  savingNameservers,
  connections = [],
  onToggleAutorenew,
  onSetNameservers,
  onUseManagedNameservers,
}: DomainSettingsTabProps) {
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
        {/* Card header */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <Settings className="h-4 w-4 text-white/35" />
          <p className="text-sm font-medium text-white">Domain Settings</p>
        </div>

        {registrarLoading ? (
          <SettingsSkeleton />
        ) : (
          <div className="px-4">
            {/* Inline error banner */}
            {registrarError && (
              <div className="border-b border-white/[0.04] py-3">
                <p className="text-xs text-red-300/80">
                  {looksInternal(registrarError)
                    ? 'Unable to load domain settings. Refresh to try again.'
                    : registrarError}
                </p>
              </div>
            )}

            {registrarSettings?.managed ? (
              <>
                {/* Managed zone */}
                {registrarSettings.zone && (
                  <div className="border-b border-white/[0.04] py-3">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/30">
                      Managed Zone
                    </p>
                    <p className="font-mono text-xs text-white/60">{registrarSettings.zone}</p>
                  </div>
                )}

                {/* Expiry date */}
                {registrarSettings.expires_at && (
                  <PropRow
                    label="Expiry date"
                    description="When this domain registration expires."
                  >
                    <span className="font-mono text-xs text-white/70">
                      {new Date(registrarSettings.expires_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </PropRow>
                )}

                {/* Auto-renew */}
                <PropRow
                  label="Auto-renew"
                  description="Automatically renew this domain before it expires."
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs ${
                        registrarSettings.autorenew_enabled ? 'text-emerald-400' : 'text-white/35'
                      }`}
                    >
                      {registrarSettings.autorenew_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 min-w-[60px] border-white/[0.1] text-xs text-white/70 hover:bg-white/[0.06] hover:text-white"
                      disabled={
                        savingAutorenew ||
                        typeof registrarSettings.autorenew_enabled !== 'boolean'
                      }
                      onClick={onToggleAutorenew}
                    >
                      {savingAutorenew ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : registrarSettings.autorenew_enabled ? (
                        'Disable'
                      ) : (
                        'Enable'
                      )}
                    </Button>
                  </div>
                </PropRow>

                {/* Nameservers */}
                <NameserverSettings
                  settings={registrarSettings}
                  saving={savingNameservers}
                  connections={connections}
                  onSetNameservers={onSetNameservers}
                  onUseManagedNameservers={onUseManagedNameservers}
                />
              </>
            ) : !registrarError ? (
              /* External / unmanaged domain — only shown when there's no error */
              <div className="py-5">
                <p className="mb-1 text-sm font-medium text-white/60">External domain</p>
                <p className="max-w-md text-xs leading-relaxed text-white/40">
                  This domain is registered with an external registrar. To update nameservers or
                  renewal settings, log in to your domain registrar directly.
                </p>
              </div>
            ) : null}
          </div>
        )}
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
            className="text-white/40 hover:bg-white/[0.05] hover:text-white"
          >
            Back to Domains
          </Button>
        </Link>
      </div>
    </div>
  );
}
