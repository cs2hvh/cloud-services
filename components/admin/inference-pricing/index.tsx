"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeDollarSign, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios/axios";
import { isTokenBilled, priceTone } from "@/lib/admin/inference-pricing";
import { FilterBar } from "./filter-bar";
import { EditPriceDialog } from "./edit-price-dialog";
import { PricingTable } from "./pricing-table";
import { RepriceDialog } from "./reprice-dialog";
import { SummaryCards } from "./summary-cards";
import type {
  BillingShape,
  CatalogFilter,
  CatalogRow,
  CatalogSummary,
  SortKey,
  StatusFilter,
} from "./types";

const EMPTY_SUMMARY: CatalogSummary = {
  total: 0,
  active: 0,
  cost_unknown: 0,
  per_unit: 0,
  at_or_below_cost: 0,
  thin_margin: 0,
};

/** Provider prefix of a model id: "anthropic/claude-opus" -> "anthropic". */
function providerOf(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(0, slash);
}

/**
 * Container for the model pricing admin: owns fetching, filters, draft edits
 * and the save/reprice/enable flows. Presentation lives in the sibling
 * components; every pricing rule lives in lib/admin/inference-pricing.ts.
 */
export default function InferencePricingAdmin() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [summary, setSummary] = useState<CatalogSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [repriceOpen, setRepriceOpen] = useState(false);

  // Filters
  const [tone, setTone] = useState<CatalogFilter>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [provider, setProvider] = useState("any");
  const [shape, setShape] = useState<BillingShape>("any");
  const [sort, setSort] = useState<SortKey>("margin_asc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/inference/pricing");
      setRows(data.rows ?? []);
      setSummary(data.summary ?? EMPTY_SUMMARY);
    } catch {
      toast.error("Failed to load the model catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Operations ─────────────────────────────────────────────────────────────
  const applyRow = (updated: CatalogRow) =>
    setRows((prev) => prev.map((r) => (r.model_id === updated.model_id ? { ...r, ...updated } : r)));

  const toggleActive = async (row: CatalogRow, next: boolean) => {
    setSavingId(row.model_id);
    // Optimistic: the switch should feel instant; reverted on failure.
    applyRow({ ...row, is_active: next });
    try {
      const { data } = await api.put("/admin/inference/pricing", { model_id: row.model_id, is_active: next });
      applyRow(data);
      toast.success(`${next ? "Enabled" : "Disabled"} ${row.model_id}`);
      void load();
    } catch {
      applyRow({ ...row, is_active: !next });
      toast.error(`Could not ${next ? "enable" : "disable"} ${row.model_id}`);
    } finally {
      setSavingId(null);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => providerOf(r.model_id)))).sort(),
    [rows]
  );

  const filtered = search !== "" || status !== "active" || provider !== "any" || shape !== "any" || tone !== "all";

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const out = rows.filter((row) => {
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (provider !== "any" && providerOf(row.model_id) !== provider) return false;
      if (shape === "token" && !isTokenBilled(row)) return false;
      if (shape === "unit" && isTokenBilled(row)) return false;
      if (tone === "unit" && isTokenBilled(row)) return false;
      // Margin tones apply to token-billed models only — a per-unit SKU has no
      // token margin to be "unknown" about; it has its own rates.
      if (tone !== "all" && tone !== "unit") {
        if (!isTokenBilled(row)) return false;
        if (priceTone(row.margin_pct, row.cost_known) !== tone) return false;
      }
      if (term) {
        const haystack = `${row.model_id} ${row.display_name ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    // Unknown margins sort last in both directions — they aren't "worst", they
    // just can't be judged, and burying the real problems under them would
    // defeat the point of "worst first".
    const rank = (row: CatalogRow) => (row.margin_pct === null || !row.cost_known ? null : row.margin_pct);
    return out.sort((a, b) => {
      if (sort === "model_id") return a.model_id.localeCompare(b.model_id);
      const ra = rank(a);
      const rb = rank(b);
      if (ra === null && rb === null) return a.model_id.localeCompare(b.model_id);
      if (ra === null) return 1;
      if (rb === null) return -1;
      return sort === "margin_asc" ? ra - rb : rb - ra;
    });
  }, [rows, search, status, provider, shape, tone, sort]);

  const clearFilters = () => {
    setSearch("");
    setStatus("active");
    setProvider("any");
    setShape("any");
    setTone("all");
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-green-500/20 p-2">
            <BadgeDollarSign className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">AI Model Pricing</h1>
            <p className="mt-0.5 max-w-3xl text-sm text-neutral-400">
              What we charge per model, what it costs us upstream, and the margin between. A price below known cost is
              refused unless you confirm it as a deliberate loss-leader.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="border-white/10" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <SummaryCards summary={summary} active={tone} onSelect={setTone} />

      {summary.at_or_below_cost > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>{summary.at_or_below_cost}</strong> active model(s) are priced at or below what they cost us —
              every call on them loses money.
            </span>
            <Button size="sm" variant="secondary" onClick={() => setRepriceOpen(true)}>
              Reprice them…
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Always reachable. The bulk action used to live only inside the alert
          above, so once nothing was underwater there was no way to open it —
          and the thin-margin models could never be lifted to policy. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl">
        <p className="text-sm text-neutral-400">
          Use <strong className="text-white">Edit</strong> on any row to change one model&apos;s prices with its cost and
          margin side by side, or bulk-reprice many models to a target margin.
        </p>
        <Button size="sm" variant="outline" onClick={() => setRepriceOpen(true)}>
          <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
          Bulk reprice…
        </Button>
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        status={status}
        onStatus={setStatus}
        provider={provider}
        onProvider={setProvider}
        providers={providers}
        shape={shape}
        onShape={setShape}
        sort={sort}
        onSort={setSort}
        shown={visible.length}
        total={rows.length}
        loading={loading}
        onRefresh={() => void load()}
        onClear={clearFilters}
        filtered={filtered}
      />

      <PricingTable
        rows={visible}
        savingId={savingId}
        onEdit={setEditing}
        onToggleActive={(row, next) => void toggleActive(row, next)}
        loading={loading}
      />

      <EditPriceDialog
        row={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => void load()}
      />

      <RepriceDialog
        open={repriceOpen}
        onOpenChange={setRepriceOpen}
        onApplied={() => void load()}
        underwaterCount={summary.at_or_below_cost}
      />
    </div>
  );
}
