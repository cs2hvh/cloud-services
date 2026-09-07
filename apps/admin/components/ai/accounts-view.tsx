"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, KeyRound, RefreshCw, Search, Users } from "lucide-react";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@admin/components/page-header";
import { AiTabs } from "@admin/components/ai/ai-tabs";
import { StatCard } from "@admin/components/stat-card";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Person = { id: string; label: string } | null;

type KeyRow = {
  id: string;
  orgId: string | null;
  label: string;
  masked: string;
  tier: string | null;
  internal: boolean;
  zdr: boolean;
  semanticCache: boolean;
  rateLimitRpm: number | null;
  modelAllowlist: number;
  monthlyBudgetUsd: number | null;
  hardCapUsd: number | null;
  createdBy: Person;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  usage: {
    requests: number;
    errors: number;
    tokens: number;
    revenueUsd: number;
    upstreamUsd: number;
  };
};

type OrgRow = {
  id: string;
  label: string;
  slug: string;
  owner: Person;
  members: { userId: string; label: string; role: string; status: string }[];
  monthlyBudgetUsd: number | null;
  hardCapUsd: number | null;
  zdrDefault: boolean;
  regionPin: string | null;
  createdAt: string;
  keyCount: number;
  liveKeyCount: number;
  usage: {
    requests: number;
    errors: number;
    tokens: number;
    revenueUsd: number;
    upstreamUsd: number;
    marginUsd: number;
    lastRequestAt: string | null;
  };
};

type Feed = {
  days: number;
  truncated: boolean;
  perUserSpendAvailable: boolean;
  totals: {
    orgs: number;
    activeOrgs: number;
    people: number;
    keys: number;
    liveKeys: number;
    keysUsed: number;
  };
  orgs: OrgRow[];
  keys: KeyRow[];
};

const money = (n: number, p = 2) => `$${n.toFixed(p)}`;
const compact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact" }).format(n);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d === 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
};

export function AiAccountsView({ initialOrg }: { initialOrg?: string }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState(initialOrg ?? "all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Feed>("/admin/ai/accounts", { params: { days } });
      setFeed(res.data);
      setError(null);
    } catch {
      setError("Could not load orgs and keys");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const t = feed?.totals;
  const needle = q.trim().toLowerCase();
  const orgs = (feed?.orgs ?? []).filter(
    (o) =>
      (orgFilter === "all" || o.id === orgFilter) &&
      (needle === "" ||
        o.label.toLowerCase().includes(needle) ||
        o.slug.toLowerCase().includes(needle) ||
        o.members.some((m) => m.label.toLowerCase().includes(needle))),
  );
  const keys = (feed?.keys ?? []).filter(
    (k) =>
      (orgFilter === "all" || k.orgId === orgFilter) &&
      (needle === "" ||
        k.label.toLowerCase().includes(needle) ||
        k.masked.toLowerCase().includes(needle) ||
        (k.createdBy?.label ?? "").toLowerCase().includes(needle)),
  );

  return (
    <div>
      <PageHeader
        title="Orgs, people & API keys"
        description="Who is on the gateway, what they are allowed to spend, and what each key actually used."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <AiTabs />

      {error && (
        <p className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Organisations"
          value={t ? t.orgs : "—"}
          hint={t ? `${t.activeOrgs} sent traffic in ${days}d` : undefined}
          icon={Building2}
        />
        <StatCard
          label="People"
          value={t ? t.people : "—"}
          hint="org members & key owners"
          icon={Users}
        />
        <StatCard
          label="API keys"
          value={t ? t.keys : "—"}
          hint={t ? `${t.liveKeys} live · ${t.keys - t.liveKeys} revoked` : undefined}
          icon={KeyRound}
        />
        <StatCard
          label="Keys in use"
          value={t ? t.keysUsed : "—"}
          hint={t ? `of ${t.liveKeys} live keys, last ${days}d` : undefined}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search org, person or key…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-9 text-[13px]"
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="h-9 w-[190px] text-[13px]">
            <SelectValue placeholder="Org" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All orgs</SelectItem>
            {(feed?.orgs ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-9 w-[130px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orgs */}
      <div className="mb-5 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Organisations
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Org</th>
                <th className="px-4 py-2.5 font-semibold">People</th>
                <th className="px-4 py-2.5 font-semibold">Keys</th>
                <th className="px-4 py-2.5 text-right font-semibold">Requests</th>
                <th className="px-4 py-2.5 text-right font-semibold">Tokens</th>
                <th className="px-4 py-2.5 text-right font-semibold">Billed</th>
                <th className="px-4 py-2.5 text-right font-semibold">Margin</th>
                <th className="px-4 py-2.5 font-semibold">Budget</th>
                <th className="px-4 py-2.5 font-semibold">Last call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No organisations match."}
                  </td>
                </tr>
              ) : (
                orgs.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{o.label}</div>
                      <div className={`${MONO} text-[11px] text-muted-foreground`}>
                        {o.slug}
                        {o.zdrDefault && " · ZDR"}
                        {o.regionPin && ` · ${o.regionPin}`}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {o.members.length === 0 ? (
                        "—"
                      ) : (
                        <span title={o.members.map((m) => `${m.label} (${m.role})`).join(", ")}>
                          {o.members.length}
                          <span className="ml-1.5 text-muted-foreground/70">
                            {o.owner ? `owner ${o.owner.label}` : ""}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {o.liveKeyCount}
                      {o.keyCount !== o.liveKeyCount && ` / ${o.keyCount}`}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                      {o.usage.requests.toLocaleString()}
                      {o.usage.errors > 0 && (
                        <span className="ml-1 text-red-300">·{o.usage.errors}</span>
                      )}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px] text-muted-foreground`}>
                      {compact(o.usage.tokens)}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                      {money(o.usage.revenueUsd)}
                    </td>
                    <td
                      className={`${MONO} px-4 py-2.5 text-right text-[12px] ${
                        o.usage.marginUsd < 0 ? "text-red-300" : "text-muted-foreground"
                      }`}
                    >
                      {money(o.usage.marginUsd)}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {o.monthlyBudgetUsd === null ? "—" : money(o.monthlyBudgetUsd, 0)}
                      {o.hardCapUsd !== null && ` / cap ${money(o.hardCapUsd, 0)}`}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {ago(o.usage.lastRequestAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Keys */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            API keys
          </h2>
          <span className="text-xs text-muted-foreground">{keys.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Key</th>
                <th className="px-4 py-2.5 font-semibold">Org</th>
                <th className="px-4 py-2.5 font-semibold">Created by</th>
                <th className="px-4 py-2.5 font-semibold">Limits</th>
                <th className="px-4 py-2.5 text-right font-semibold">Requests</th>
                <th className="px-4 py-2.5 text-right font-semibold">Billed</th>
                <th className="px-4 py-2.5 font-semibold">Last used</th>
                <th className="px-4 py-2.5 font-semibold">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No keys match."}
                  </td>
                </tr>
              ) : (
                keys.map((k) => {
                  const orgLabel =
                    feed?.orgs.find((o) => o.id === k.orgId)?.label ?? "—";
                  const expired =
                    k.expiresAt !== null && Date.parse(k.expiresAt) < Date.now();
                  return (
                    <tr key={k.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{k.label}</div>
                        <div className={`${MONO} text-[11px] text-muted-foreground`}>
                          {k.masked}
                          {k.tier && ` · ${k.tier}`}
                          {k.internal && " · internal"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                        {orgLabel}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                        {k.createdBy?.label ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">
                        {[
                          k.monthlyBudgetUsd !== null
                            ? `${money(k.monthlyBudgetUsd, 0)}/mo`
                            : null,
                          k.rateLimitRpm ? `${k.rateLimitRpm} rpm` : null,
                          k.modelAllowlist > 0 ? `${k.modelAllowlist} models` : null,
                          k.zdr ? "ZDR" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                        {k.usage.requests.toLocaleString()}
                      </td>
                      <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                        {k.usage.revenueUsd > 0 ? money(k.usage.revenueUsd) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                        {ago(k.lastUsedAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        {k.revokedAt ? (
                          <span className="inline-flex rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10.5px] text-red-300">
                            revoked {day(k.revokedAt)}
                          </span>
                        ) : expired ? (
                          <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] text-amber-300">
                            expired
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] text-emerald-300">
                            live
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[10.5px] text-muted-foreground">
        {feed && !feed.perUserSpendAvailable && (
          <>
            The gateway attributes every call to an org and an API key, never
            to a person (usage.user_id is unset platform-wide), so spend is
            reported per org and per key — people appear as members and key
            owners. Per-person spend would be a guess.{" "}
          </>
        )}
        Rollups cover the last {days} days.{" "}
        <Link href="/ai/requests" className="text-[#3987e5] underline-offset-2 hover:underline">
          Open the request log →
        </Link>
      </p>
    </div>
  );
}
