'use client';

import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { RegistrarSettings } from './domain-detail-types';
import { looksInternal } from './domain-detail-types';

interface DomainSettingsTabProps {
  registrarLoading: boolean;
  registrarError: string | null;
  registrarSettings: RegistrarSettings | null;
  nameserversDraft: string;
  savingAutorenew: boolean;
  savingNameservers: boolean;
  onNameserversDraftChange: (value: string) => void;
  onToggleAutorenew: () => void;
  onSaveNameservers: () => void;
}

export function DomainSettingsTab({
  registrarLoading,
  registrarError,
  registrarSettings,
  nameserversDraft,
  savingAutorenew,
  savingNameservers,
  onNameserversDraftChange,
  onToggleAutorenew,
  onSaveNameservers,
}: DomainSettingsTabProps) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="text-base">Domain Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-white/70">
        <p>
          These settings apply to the domain itself — independent of which app it&apos;s connected
          to.
        </p>

        {registrarError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
            {looksInternal(registrarError)
              ? 'Unable to load domain settings. Refresh to try again.'
              : registrarError}
          </div>
        )}

        {registrarLoading ? (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading domain settings...
          </div>
        ) : registrarSettings?.managed ? (
          <div className="space-y-4 rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-cyan-500/30 bg-cyan-500/20 text-cyan-100">
                Managed Zone
              </Badge>
              <span className="text-xs text-white/60">{registrarSettings.zone}</span>
            </div>

            {/* Auto-renew */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 p-3">
              <div>
                <p className="text-sm text-white">Auto-renew</p>
                <p className="text-xs text-white/55">
                  Keep your domain registration active automatically.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                disabled={
                  savingAutorenew ||
                  typeof registrarSettings.autorenew_enabled !== 'boolean'
                }
                onClick={onToggleAutorenew}
              >
                {savingAutorenew && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {registrarSettings.autorenew_enabled ? 'Disable' : 'Enable'} Auto-renew
              </Button>
            </div>

            {/* Nameservers */}
            <div className="space-y-2 rounded-md border border-white/10 p-3">
              <Label className="text-xs text-white/70">Nameservers (one per line)</Label>
              <Textarea
                value={nameserversDraft}
                onChange={(e) => onNameserversDraftChange(e.target.value)}
                rows={4}
                className="bg-black/30 border-white/10 text-white"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-white/50 max-w-sm">
                  Changing nameservers will redirect all DNS traffic for this domain. This affects
                  every app and subdomain using it.
                </p>
                <Button
                  size="sm"
                  className="bg-white text-black hover:bg-white/90"
                  disabled={savingNameservers}
                  onClick={onSaveNameservers}
                >
                  {savingNameservers && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Save Nameservers
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-white">External domain</p>
            <p className="text-xs text-white/55 mt-1">
              This domain is registered elsewhere. To update nameservers or renewal settings, log
              in to your current domain registrar.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/domains/marketplace">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
              <Plus className="h-4 w-4 mr-2" />
              Buy Another Domain
            </Button>
          </Link>
          <Link href="/dashboard/domains">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
              Back to Domains Dashboard
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
