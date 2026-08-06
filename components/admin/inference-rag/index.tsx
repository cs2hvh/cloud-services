"use client";

/**
 * RAG / vector storage admin — §3 of nextstespsAI/21-admin-platform.md lists
 * vector collections as having no operator surface at all. This is the `see` half.
 *
 * The quota figure shown is the one the code ENFORCES (sum of row_count), so
 * support quotes customers the same number that refuses their upload.
 */

import { Fragment, useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Database, HardDrive, Info, Layers, RefreshCw, ScanSearch, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TablePagination, usePagedRows } from "@/components/admin/table-pagination";
import api from "@/lib/axios/axios";
import {
  humanBytes,
  type BillingIntegrity,
  type OrgRag,
  type QuotaState,
  type RagQuotaInfo,
  type RagSummary,
} from "@/lib/admin/rag-ops";

interface Payload {
  /** Imported, not re-declared — see RagQuotaInfo for why. */
  quota: RagQuotaInfo;
  billing_integrity: BillingIntegrity;
  verify: { requested: boolean; counted: boolean; truncated: boolean; note: string };
  summary: RagSummary;
  orgs: OrgRag[];
}

const QUOTA_TONE: Record<QuotaState, string> = {
  ok: "border-white/15 bg-white/5 text-neutral-300",
  watch: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  near: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  full: "border-red-500/30 bg-red-500/10 text-red-300",
};
const QUOTA_LABEL: Record<QuotaState, string> = {
  ok: "OK",
  watch: "Half used",
  near: "Near limit",
  full: "At limit",
};

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function Card({
  label, value, hint, icon: Icon, tone = "neutral",
}: {
  label: string; value: string; hint: string;
  icon: typeof Database; tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const accent = {
    neutral: "border-white/10 from-neutral-500/20 to-neutral-600/20 text-neutral-400",
    good: "border-emerald-500/30 from-emerald-500/20 to-green-500/20 text-emerald-400",
    warn: "border-amber-500/30 from-amber-500/20 to-yellow-500/20 text-amber-400",
    bad: "border-red-500/30 from-red-500/20 to-orange-500/20 text-red-400",
  }[tone];
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-neutral-400">{label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-white")}>
            {value}
          </p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">{hint}</p>
        </div>
        <div className={cn("rounded-lg border bg-gradient-to-br p-2", accent)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function OrgDetail({ org, verified }: { org: OrgRag; verified: boolean }) {
  return (
    <div className="space-y-4 border-t border-white/5 bg-black/20 px-4 py-4">
      <div>
        <p className="mb-2 text-xs text-neutral-500">Collections ({org.collections.length})</p>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <Table>
            <TableHeader className="[&_tr]:border-white/10">
              <TableRow>
                <TableHead className="min-w-[160px]">Name</TableHead>
                <TableHead className="text-right">Vectors</TableHead>
                {verified && <TableHead className="text-right">Actual</TableHead>}
                {verified && <TableHead className="text-right">Drift</TableHead>}
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Dims</TableHead>
                <TableHead className="min-w-[180px]">Embedding model</TableHead>
                <TableHead className="text-right">Connectors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.collections.map((c) => (
                <TableRow key={c.id} className="border-white/5">
                  <TableCell className="text-xs">
                    {c.name ?? "(unnamed)"}
                    {c.empty && <Badge variant="outline" className="ml-2 border-white/15 text-[10px]">empty</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.counted}</TableCell>
                  {verified && <TableCell className="text-right tabular-nums text-neutral-400">{c.actual ?? "—"}</TableCell>}
                  {verified && (
                    <TableCell className="text-right tabular-nums">
                      {c.drift === null ? "—" : c.drift === 0 ? <span className="text-neutral-600">0</span> : <span className="text-amber-400">{c.drift > 0 ? `+${c.drift}` : c.drift}</span>}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums text-neutral-400">{humanBytes(Number(c.size_bytes) || 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-neutral-400">{c.dimensions ?? "—"}</TableCell>
                  <TableCell className="font-mono text-[11px] text-neutral-400">{c.embedding_model_id ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-neutral-400">{c.connector_ids.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {org.connectors.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-neutral-500">Connectors ({org.connectors.length})</p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <Table>
              <TableHeader className="[&_tr]:border-white/10">
                <TableRow>
                  <TableHead className="min-w-[140px]">Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Docs</TableHead>
                  <TableHead className="min-w-[200px]">Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.connectors.map((k) => (
                  <TableRow key={k.id} className="border-white/5">
                    <TableCell className="text-xs">{k.display_name ?? "(unnamed)"}</TableCell>
                    <TableCell className="text-xs text-neutral-400">{k.kind ?? "—"}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", k.status === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : k.status === "syncing" ? "border-blue-500/30 bg-blue-500/10 text-blue-300" : "border-white/15 bg-white/5 text-neutral-300")}>
                        {k.status ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-neutral-400">{k.sync_schedule ?? "manual"}</TableCell>
                    <TableCell className="text-right tabular-nums text-neutral-400">
                      {k.docs_total ?? 0}
                      {(k.docs_failed ?? 0) > 0 && <span className="text-red-400"> ({k.docs_failed} failed)</span>}
                    </TableCell>
                    <TableCell className="break-words text-[11px] text-neutral-500">{k.last_error ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {org.embedding_models.length > 1 && (
        // Bounded and sticky: this panel sits inside a table wider than the
        // viewport, so an unconstrained warning stretched to 1415px and its right
        // edge landed off-screen at 1720px — measured at 1600/1366/1280.
        <p className="sticky left-0 flex max-w-3xl items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This org mixes <strong>{org.embedding_models.length} embedding models</strong> ({org.embedding_models.join(", ")}).
            Models with different dimensions produce incompatible vectors — a query embedded with one cannot
            search a collection built with another.
          </span>
        </p>
      )}
    </div>
  );
}

export default function InferenceRagAdmin() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // The only page in the AI admin with no way to find anything. Fine at 11
  // collections, unusable the moment a real customer base exists.
  const [search, setSearch] = useState("");
  // Stopping a charge is a money mutation, so it goes through a confirmation
  // with a typed reason — the same discipline as the capability switches.
  const [closing, setClosing] = useState<BillingIntegrity["issues"][number] | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);

  const load = useCallback(async (verify: boolean) => {
    setLoading(true);
    if (verify) setVerifying(true);
    try {
      const res = await api.get(`/admin/inference/rag${verify ? "?verify=1" : ""}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load vector storage");
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const s = data?.summary;
  const verified = data?.verify.counted ?? false;

  // Matches on the org AND on anything inside it, so searching a collection or
  // connector name finds the customer that owns it rather than returning nothing.
  const visibleOrgs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!data) return [];
    if (!term) return data.orgs;
    return data.orgs.filter((o) =>
      `${o.org_name} ${o.org_id}`.toLowerCase().includes(term) ||
      o.collections.some((c) => `${c.name ?? ""} ${c.embedding_model_id ?? ""}`.toLowerCase().includes(term)) ||
      o.connectors.some((k) => `${k.display_name ?? ""} ${k.kind ?? ""} ${k.status ?? ""}`.toLowerCase().includes(term))
    );
  }, [data, search]);

  // The org list grows with the customer base. Same shared pager as the other
  // admin tables; keyed on the search so narrowing never strands the operator.
  const pagedOrgs = usePagedRows(visibleOrgs, 25, search);

  const stopCharge = async () => {
    if (!closing) return;
    setClosingBusy(true);
    try {
      const res = await api.post("/admin/inference/rag", {
        service_id: closing.id,
        reason: closeReason.trim(),
      });
      toast.success(res.data.note ?? "Meter closed", { duration: 9_000 });
      setClosing(null);
      setCloseReason("");
      await load(false);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not close the meter";
      toast.error(message);
    } finally {
      setClosingBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2">
            <Database className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Vector Storage</h1>
            <p className="mt-0.5 text-sm text-neutral-400">Collections, connectors and quota, per customer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-white/10" onClick={() => void load(false)} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && !verifying && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-purple-500/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"
            onClick={() => void load(true)}
            disabled={loading}
            title="Count vector rows to check the cached counter the quota relies on."
          >
            <ScanSearch className={cn("mr-1.5 h-3.5 w-3.5", verifying && "animate-pulse")} />
            {verifying ? "Counting…" : "Verify counts"}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl bg-white/5" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl bg-white/5" />
        </div>
      ) : !data || !s ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not load vector storage.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              label="Vectors stored"
              value={compact(s.vectors_used)}
              hint={`across ${s.collections} collection(s), ${s.orgs} org(s)`}
              icon={Layers}
            />
            <Card
              label="Orgs near their limit"
              value={String(s.orgs_near_quota + s.orgs_full)}
              hint={s.orgs_full > 0 ? `${s.orgs_full} at the limit` : "none at the limit"}
              icon={AlertTriangle}
              tone={s.orgs_full > 0 ? "bad" : s.orgs_near_quota > 0 ? "warn" : "good"}
            />
            <Card
              label="Broken ingestion"
              value={String(s.broken_connectors + s.failed_documents)}
              hint={`${s.broken_connectors} connector(s) in error, ${s.failed_documents} doc(s) failed`}
              icon={AlertTriangle}
              tone={s.broken_connectors + s.failed_documents > 0 ? "warn" : "good"}
            />
            <Card
              label="Storage"
              value={humanBytes(s.size_bytes)}
              hint={s.empty_collections > 0 ? `${s.empty_collections} empty collection(s)` : "no empty collections"}
              icon={HardDrive}
            />
          </div>

          {/* The quota used to be a constant in three files, and this banner said
              so. It is per-org data now (migration 20260804000001), so the banner
              states the DEFAULT and points at the lever — and the per-customer
              ceiling lives in each org's row, because that is the number that
              actually refuses them. */}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 backdrop-blur-xl">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <div className="space-y-1 text-sm text-blue-100">
              <p>
                <strong>{s.vectors_used.toLocaleString()}</strong> vectors stored across all customers.
                The default ceiling is <strong>{data.quota.default_per_org.toLocaleString()}</strong> per
                org, enforced from the{" "}
                <span className="font-mono text-xs">{data.quota.enforced_from}</span>. Each row below shows
                that customer&apos;s own limit, which may be an override.
              </p>
              <p className="text-xs text-blue-200/80">{data.quota.adjustable_note}</p>
            </div>
          </div>

          {/* Billing integrity. Creating a collection registers a meter; deleting
              one is supposed to close it, but that close is best-effort and its
              failure only reaches a console.warn. This is the only place the
              resulting drift is visible — and it drifts in both directions. */}
          {!data.billing_integrity.checked ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 backdrop-blur-xl">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-100">
                <strong>Billing integrity could not be checked.</strong> {data.billing_integrity.error} — this is
                not the same as &ldquo;no problems found&rdquo;.
              </p>
            </div>
          ) : data.billing_integrity.issues.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-sm text-red-100">
                  <strong>
                    {data.billing_integrity.orphaned_meters > 0
                      ? `${data.billing_integrity.orphaned_meters} customer(s) are being charged for collections that no longer exist`
                      : `${data.billing_integrity.unbilled_collections} collection(s) are stored without a billing meter`}
                    .
                  </strong>{" "}
                  {data.billing_integrity.wrongly_charged_monthly_cents > 0 && (
                    <>
                      That is{" "}
                      <strong>
                        ${(data.billing_integrity.wrongly_charged_monthly_cents / 100).toFixed(2)}/month
                      </strong>{" "}
                      billed for nothing.{" "}
                    </>
                  )}
                  Comparing {data.billing_integrity.meters_active} active meter(s) against{" "}
                  {data.billing_integrity.collections} collection(s).
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
                <Table>
                  <TableHeader className="[&_tr]:border-white/10">
                    <TableRow>
                      <TableHead className="min-w-[150px]">Problem</TableHead>
                      <TableHead className="min-w-[240px]">Id</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="min-w-[300px]">What it means</TableHead>
                      <TableHead className="text-right">Fix</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.billing_integrity.issues.map((issue) => (
                      <TableRow key={`${issue.kind}-${issue.id}`} className="border-white/5">
                        <TableCell>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-xs",
                              issue.kind === "orphaned_meter"
                                ? "border-red-500/30 bg-red-500/15 text-red-200"
                                : "border-amber-500/30 bg-amber-500/15 text-amber-200"
                            )}
                          >
                            {issue.kind === "orphaned_meter" ? "Charging for nothing" : "Not billed"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="font-mono text-[11px] text-neutral-400">{issue.id}</p>
                          {issue.name && <p className="text-xs text-neutral-300">{issue.name}</p>}
                          {issue.org_name && <p className="text-[11px] text-neutral-500">{issue.org_name}</p>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {issue.monthly_cents === null ? (
                            <span className="text-neutral-600">—</span>
                          ) : (
                            <span className="text-red-300">${(issue.monthly_cents / 100).toFixed(2)}/mo</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal text-xs text-neutral-400">{issue.detail}</TableCell>
                        <TableCell className="text-right">
                          {/* Only the charging-for-nothing side is fixable from here.
                              Registering a missing meter would start charging a
                              customer who has never been billed for that collection —
                              a decision, not a cleanup. */}
                          {issue.kind === "orphaned_meter" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-white/10 px-2 text-xs text-red-300 hover:text-red-200"
                              onClick={() => setClosing(issue)}
                            >
                              Stop charge
                            </Button>
                          ) : (
                            <span
                              className="cursor-help text-xs text-neutral-600"
                              title="Registering a meter would start charging a customer who has not been billed for this collection. That is a pricing decision, not a cleanup — do it deliberately."
                            >
                              manual
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          {verified && s.drifted_collections > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-xl">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-100">
                <strong>{s.drifted_collections} collection(s)</strong> have a cached <code>row_count</code> that
                disagrees with the real number of vector rows (net {s.total_drift! > 0 ? "+" : ""}
                {s.total_drift}). That cached value is what the quota check reads, so a customer is currently being
                given {s.total_drift! < 0 ? "less" : "more"} headroom than they should have.
              </p>
            </div>
          )}

          {!verified && (
            <p className="text-xs text-neutral-500">{data.verify.note}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a customer, collection, connector or embedding model…"
                className="h-9 border-white/10 bg-black/40 pl-8"
              />
            </div>
            <span className="text-sm tabular-nums text-neutral-400">
              {visibleOrgs.length} of {data.orgs.length}
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="[&_tr]:border-white/10">
                  <TableRow>
                    <TableHead className="min-w-[170px]">Customer</TableHead>
                    <TableHead className="min-w-[110px]">Quota</TableHead>
                    <TableHead className="text-right">Vectors</TableHead>
                    <TableHead className="text-right">Collections</TableHead>
                    <TableHead className="text-right">Connectors</TableHead>
                    <TableHead className="text-right">Problems</TableHead>
                    <TableHead className="text-right">Storage</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedOrgs.pageRows.map((o) => {
                    const isOpen = open === o.org_id;
                    const problems = o.broken_connectors + o.failed_documents;
                    return (
                      <Fragment key={o.org_id}>
                        {/* Keyboard-operable — the detail panel is only reachable
                            through this row, so Tab + Enter/Space must work. */}
                        <TableRow
                          role="button"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          aria-label={`${o.org_name}: ${o.vectors_used} vectors, quota ${QUOTA_LABEL[o.quota_state]}. Activate for collections and connectors.`}
                          className="cursor-pointer border-white/5 hover:bg-white/[0.03] focus:outline-none focus-visible:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-purple-400/60"
                          onClick={() => setOpen(isOpen ? null : o.org_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpen(isOpen ? null : o.org_id);
                            }
                          }}
                        >
                          <TableCell>
                            <p className="font-medium text-white">{o.org_name}</p>
                            {/* Full id available to copy, and a jump to this org's
                                admin page — otherwise an operator retypes a uuid. */}
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="font-mono text-[10px] text-neutral-500">{o.org_id.slice(0, 8)}</span>
                              <Link
                                href={`/dashboard/admin/inference-orgs?q=${encodeURIComponent(o.org_id)}`}
                                onClick={(e: MouseEvent) => e.stopPropagation()}
                                className="text-[10px] text-purple-300 underline-offset-2 hover:underline"
                                title="Open this customer in Inference Orgs"
                              >
                                keys &amp; limits
                              </Link>
                              <Link
                                href={`/dashboard/admin/inference-traces?org=${encodeURIComponent(o.org_id)}`}
                                onClick={(e: MouseEvent) => e.stopPropagation()}
                                className="text-[10px] text-purple-300 underline-offset-2 hover:underline"
                                title="Open this customer's latency and failures"
                              >
                                traffic
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={cn("rounded-full border px-2 py-0.5 text-xs", QUOTA_TONE[o.quota_state])}>
                              {QUOTA_LABEL[o.quota_state]}
                            </span>
                            {/* The org's OWN ceiling, and a marker when it is an
                                override. Support's first question is "what is
                                this customer actually limited to" — a state badge
                                and a percentage never answered it. */}
                            <p className="mt-0.5 text-[10px] text-neutral-500">
                              {o.quota_pct.toFixed(o.quota_pct < 1 ? 3 : 1)}% of {o.quota.toLocaleString()}
                            </p>
                            {o.quota !== data.quota.default_per_org && (
                              <p className="text-[10px] font-medium text-purple-300" title="This org has a per-org override; the platform default does not apply.">
                                custom limit
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{o.vectors_used}</TableCell>
                          <TableCell className="text-right tabular-nums text-neutral-400">
                            {o.collections.length}
                            {o.empty_collections > 0 && <span className="text-neutral-600"> ({o.empty_collections} empty)</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-neutral-400">{o.connectors.length}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {problems === 0 ? <span className="text-neutral-600">0</span> : <span className="text-amber-400">{problems}</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-neutral-400">{humanBytes(o.size_bytes)}</TableCell>
                          <TableCell>
                            <ChevronDown className={cn("h-4 w-4 text-neutral-500 transition-transform", isOpen && "rotate-180")} />
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="border-white/5 hover:bg-transparent">
                            <TableCell colSpan={8} className="p-0">
                              <OrgDetail org={o} verified={verified} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination paged={pagedOrgs} noun="customer" className="px-4 pb-3" />
            </div>
            {visibleOrgs.length === 0 && (
              <p className="p-10 text-center text-sm text-neutral-400">
                Nothing matches &ldquo;{search}&rdquo;. Searches cover customer name and id, collection and
                embedding-model names, and connector names, kinds and statuses.
              </p>
            )}
          </div>

          <p className="text-xs text-neutral-500">
            Click a customer for their collections and connectors. Vector counts come from the same cached
            counter the quota check reads, so they match what a customer is actually held to.
          </p>
        </>
      )}

      <AlertDialog
        open={closing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setClosing(null);
            setCloseReason("");
          }
        }}
      >
        <AlertDialogContent className="border-white/10 bg-neutral-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="h-4 w-4" />
              Stop this charge?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-neutral-300">
                <p>
                  Closes the billing meter for{" "}
                  <span className="font-mono text-xs text-white">{closing?.id}</span>, whose collection no
                  longer exists.
                  {closing?.monthly_cents != null && (
                    <>
                      {" "}
                      This stops a{" "}
                      <strong className="text-white">
                        ${(closing.monthly_cents / 100).toFixed(2)}/month
                      </strong>{" "}
                      charge.
                    </>
                  )}
                </p>
                {/* Say the limit out loud. An operator who thinks this refunds
                    the customer will not go on to raise the credit. */}
                <p className="text-xs text-amber-200/90">
                  This stops future charges only. Anything already billed is not refunded — issue that
                  separately if the customer is owed it.
                </p>
                <Input
                  autoFocus
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="Why are you closing this? (recorded in the audit log)"
                  className="border-white/10 bg-black/40"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent">Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={closeReason.trim().length < 3 || closingBusy}
              className="bg-red-600 hover:bg-red-500"
              onClick={(e) => {
                e.preventDefault();
                void stopCharge();
              }}
            >
              {closingBusy ? "Closing…" : "Stop charge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
