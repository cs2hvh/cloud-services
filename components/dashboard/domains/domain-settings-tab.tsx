'use client';

import Link from 'next/link';
import { Loader2, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { RegistrarSettings } from './domain-detail-types';
import { looksInternal } from './domain-detail-types';

interface DomainSettingsTabProps {
  registrarLoading: boolean;
  registrarError: string | null;
  registrarSettings: RegistrarSettings | null;
  savingAutorenew: boolean;
  onToggleAutorenew: () => void;
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

export function DomainSettingsTab({
  registrarLoading,
  registrarError,
  registrarSettings,
  savingAutorenew,
  onToggleAutorenew,
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
