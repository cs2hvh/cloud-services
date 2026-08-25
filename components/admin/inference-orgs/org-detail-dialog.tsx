"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/axios/axios";
import type { KeyView, OrgView } from "./types";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`;

function KeyStateBadge({ state }: { state: KeyView["state"] }) {
  if (state === "revoked") return <Badge variant="outline" className="border-white/15 text-neutral-500">revoked</Badge>;
  if (state === "expired") return <Badge variant="destructive">expired</Badge>;
  if (state === "unused") return <Badge variant="outline" className="border-white/15 text-amber-400">never used</Badge>;
  return <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400">active</Badge>;
}

/**
 * Everything support needs about one customer: who is in the org, what keys it
 * holds, and what limits apply. The two write paths — spend caps on the org,
 * and per-key revoke / cap / rate-limit / internal-service — are the operations
 * that previously required hand-written SQL.
 */
export function OrgDetailDialog({
  org,
  onOpenChange,
  onSaved,
}: {
  org: OrgView | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [hardCap, setHardCap] = useState("");
  const [monthly, setMonthly] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    setHardCap(org?.hard_cap_cents == null ? "" : String(org.hard_cap_cents));
    setMonthly(org?.monthly_budget_cents == null ? "" : String(org.monthly_budget_cents));
  }, [org?.id, org?.hard_cap_cents, org?.monthly_budget_cents]);

  if (!org) return null;

  const saveCaps = async () => {
    setSaving(true);
    try {
      await api.put("/admin/inference/orgs", {
        org_id: org.id,
        hard_cap_cents: hardCap.trim() === "" ? null : Number(hardCap),
        monthly_budget_cents: monthly.trim() === "" ? null : Number(monthly),
      });
      toast.success("Spend caps updated");
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? "Could not update caps");
    } finally {
      setSaving(false);
    }
  };

  const updateKey = async (key: KeyView, patch: Record<string, unknown>, label: string) => {
    setBusyKey(key.id);
    try {
      await api.put("/admin/inference/orgs/keys", { key_id: key.id, ...patch });
      toast.success(label);
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? "Could not update the key");
    } finally {
      setBusyKey(null);
    }
  };

  const revoke = (key: KeyView) => {
    if (!window.confirm(`Revoke "${key.name ?? key.key_prefix}"?\n\nThis cannot be undone — the plaintext is gone, so the customer must be issued a new key.`)) return;
    void updateKey(key, { revoke: true }, "Key revoked");
  };

  return (
    <Dialog open={!!org} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{org.name ?? org.slug ?? "Untitled org"}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{org.id}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="limits">
          <TabsList className="border border-white/10 bg-black/40 p-1">
            <TabsTrigger value="limits" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              Limits
            </TabsTrigger>
            <TabsTrigger value="keys" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              Keys ({org.keys.length})
            </TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Members ({org.members.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Limits ─────────────────────────────────────────────────────── */}
          <TabsContent value="limits" className="mt-4 space-y-4">
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <p className="mb-3 text-sm text-neutral-400">
                Spend so far in the usage window: <strong className="text-white">{money(org.summary.spend_cents)}</strong>
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="hard-cap" className="text-xs">Hard cap (cents)</Label>
                  <Input
                    id="hard-cap"
                    value={hardCap}
                    onChange={(e) => setHardCap(e.target.value)}
                    placeholder="no cap"
                    className="h-8 w-40 border-white/15 bg-black/40 tabular-nums"
                    inputMode="numeric"
                  />
                  <p className="text-xs text-neutral-500">{hardCap.trim() === "" ? "unbounded" : money(Number(hardCap))}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="monthly-budget" className="text-xs">Monthly budget (cents)</Label>
                  <Input
                    id="monthly-budget"
                    value={monthly}
                    onChange={(e) => setMonthly(e.target.value)}
                    placeholder="none"
                    className="h-8 w-40 border-white/15 bg-black/40 tabular-nums"
                    inputMode="numeric"
                  />
                  <p className="text-xs text-neutral-500">{monthly.trim() === "" ? "unbounded" : money(Number(monthly))}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Leave a field empty to remove that limit. An org with no cap is unbounded, not safe.
              </p>
            </div>

            {org.byok_keys.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <p className="mb-2 text-sm text-white">Bring-your-own-key providers</p>
                {org.byok_keys.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="text-white">{b.provider}</span>
                    <span>····{b.key_last_four}</span>
                    {b.is_valid === false && <Badge variant="destructive">invalid</Badge>}
                    {b.last_verify_error && <span className="text-red-400">{b.last_verify_error}</span>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Keys ───────────────────────────────────────────────────────── */}
          <TabsContent value="keys" className="mt-4 max-h-[420px] space-y-2 overflow-auto">
            {org.keys.length === 0 && <p className="text-sm text-neutral-500">This org has no API keys.</p>}
            {org.keys.map((key) => (
              <div key={key.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white">{key.name ?? "unnamed"}</span>
                      <KeyStateBadge state={key.state} />
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-neutral-500">
                      {key.key_prefix}····{key.key_last_four}
                      {key.idle_days !== null && <span className="ml-2">· last used {key.idle_days}d ago</span>}
                      {key.idle_days === null && <span className="ml-2">· never used</span>}
                    </div>
                  </div>
                  {key.state !== "revoked" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => revoke(key)}
                      disabled={busyKey === key.id}
                    >
                      {busyKey === key.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                      Revoke
                    </Button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-neutral-400">
                  <span>cap {money(key.hard_cap_cents)}</span>
                  <span>monthly {money(key.monthly_budget_cents)}</span>
                  <span>{key.rate_limit_rpm ? `${key.rate_limit_rpm} rpm` : "no rate limit"}</span>
                  {key.state !== "revoked" && (
                    <label className="ml-auto flex items-center gap-2">
                      <span title="Bills the customer org rather than the platform">internal service</span>
                      <Switch
                        checked={!!key.is_internal_service}
                        onCheckedChange={(next) =>
                          void updateKey(key, { is_internal_service: next }, next ? "Marked internal" : "Cleared internal flag")
                        }
                        disabled={busyKey === key.id}
                        aria-label={`Toggle internal service for ${key.name ?? key.key_prefix}`}
                      />
                    </label>
                  )}
                </div>

                {key.risks.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ShieldAlert className="h-3 w-3 text-amber-400" />
                    {key.risks.map((risk) => (
                      <Badge key={risk} variant="outline" className="border-amber-500/30 text-[10px] text-amber-400">
                        {risk}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          {/* ── Members ────────────────────────────────────────────────────── */}
          <TabsContent value="members" className="mt-4 max-h-[420px] space-y-2 overflow-auto">
            {org.members.length === 0 && <p className="text-sm text-neutral-500">No members recorded.</p>}
            {org.members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <div>
                  <div className="text-sm text-white">{m.username ?? "—"}</div>
                  <div className="font-mono text-[10px] text-neutral-500">{m.user_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  {m.user_id === org.owner_user_id && (
                    <Badge variant="outline" className="border-white/15 text-[10px]">owner</Badge>
                  )}
                  {m.user_id === org.billing_user_id && (
                    <Badge variant="outline" className="border-white/15 text-[10px]">billing</Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">{m.role}</Badge>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => void saveCaps()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save limits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
