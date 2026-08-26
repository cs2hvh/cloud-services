"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, RefreshCw, Pencil, Star } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@admin/components/page-header";

type Pricing = {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
  cached_cents_per_mtok?: number;
} | null;

type ModelRow = {
  id: string;
  model_id: string;
  display_name: string | null;
  modality: string;
  serving_type: string;
  upstream_model_id: string | null;
  org_id: string | null;
  pricing: Pricing;
  upstream_pricing: Pricing;
  is_active: boolean;
  is_featured: boolean;
  upstream_available: boolean | null;
  margin: { input: number | null; output: number | null };
};

type CatalogSummary = {
  total: number;
  active: number;
  orphaned: number;
  upstreamChecked: boolean;
  upstreamCount: number | null;
};

const perMtok = (cents?: number) =>
  typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "—";

function MarginBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    value < 0
      ? "text-red-400"
      : value < 10
        ? "text-amber-300"
        : "text-emerald-400";
  return (
    <span className={`tabular-nums ${tone}`}>
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

export function AiModelsTable() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [draft, setDraft] = useState({ input: "", output: "", cached: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/ai/models");
      setRows(res.data.data ?? []);
      setSummary(res.data.summary ?? null);
    } catch {
      /* toasted by interceptor */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((m) => {
      if (filter === "active" && !m.is_active) return false;
      if (filter === "inactive" && m.is_active) return false;
      if (filter === "orphaned" && !(m.is_active && m.upstream_available === false))
        return false;
      if (!q) return true;
      return (
        m.model_id.toLowerCase().includes(q) ||
        (m.display_name ?? "").toLowerCase().includes(q) ||
        m.modality.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const patch = async (
    model: ModelRow,
    payload: Record<string, unknown>,
    successMessage: string,
  ) => {
    setBusyId(model.id);
    try {
      const res = await api.patch(`/admin/ai/models/${model.id}`, payload);
      if (res.data?.data) {
        toast.success(successMessage);
        await load();
      }
    } catch {
      /* toasted by interceptor */
    } finally {
      setBusyId(null);
    }
  };

  const openPricing = (model: ModelRow) => {
    setDraft({
      input:
        model.pricing?.input_cents_per_mtok != null
          ? String(model.pricing.input_cents_per_mtok / 100)
          : "",
      output:
        model.pricing?.output_cents_per_mtok != null
          ? String(model.pricing.output_cents_per_mtok / 100)
          : "",
      cached:
        model.pricing?.cached_cents_per_mtok != null
          ? String(model.pricing.cached_cents_per_mtok / 100)
          : "",
    });
    setEditing(model);
  };

  const savePricing = async () => {
    if (!editing) return;
    const model = editing;
    const pricing: Record<string, number> = {};
    const map: [string, string][] = [
      ["input_cents_per_mtok", draft.input],
      ["output_cents_per_mtok", draft.output],
      ["cached_cents_per_mtok", draft.cached],
    ];
    for (const [key, raw] of map) {
      if (raw.trim() === "") continue;
      const dollars = Number(raw);
      if (!Number.isFinite(dollars) || dollars < 0) {
        toast.error("Prices must be numbers ≥ 0 (USD per Mtok)");
        return;
      }
      pricing[key] = Math.round(dollars * 100 * 10000) / 10000;
    }
    setEditing(null);
    await patch(model, { pricing }, `${model.model_id} pricing updated`);
  };

  return (
    <div>
      <PageHeader
        title="Model catalog"
        description="Customer pricing, upstream cost basis and availability for every gateway model."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/ai">
              <ArrowLeft className="mr-2 h-3.5 w-3.5" /> AI Labs overview
            </Link>
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model id, name, modality"
              className="w-72 pl-8"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="all">All models</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="orphaned">Active, not on Wokey</SelectItem>
            </SelectContent>
          </Select>
          {summary?.upstreamChecked && summary.orphaned > 0 && (
            <button
              type="button"
              onClick={() => setFilter("orphaned")}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300"
            >
              {summary.orphaned} active without upstream
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {filtered.length} of {rows.length} models
              {summary?.upstreamCount != null &&
                ` · Wokey serves ${summary.upstreamCount}`}
            </span>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Modality</TableHead>
                <TableHead>Serving</TableHead>
                <TableHead className="text-right">Price in/out ($/Mtok)</TableHead>
                <TableHead className="text-right">Upstream in/out</TableHead>
                <TableHead className="text-right">Margin in/out</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    No models match.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((m) => (
                <TableRow key={m.id} className={busyId === m.id ? "opacity-50" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {m.is_featured && (
                        <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                      )}
                      {m.display_name || m.model_id}
                      {m.org_id && (
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          org-private
                        </span>
                      )}
                      {m.is_active && m.upstream_available === false && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                          not on Wokey
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{m.model_id}</div>
                  </TableCell>
                  <TableCell className="text-sm capitalize">{m.modality}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.serving_type}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {perMtok(m.pricing?.input_cents_per_mtok)} /{" "}
                    {perMtok(m.pricing?.output_cents_per_mtok)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {perMtok(m.upstream_pricing?.input_cents_per_mtok)} /{" "}
                    {perMtok(m.upstream_pricing?.output_cents_per_mtok)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    <MarginBadge value={m.margin.input} /> /{" "}
                    <MarginBadge value={m.margin.output} />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_featured}
                      disabled={busyId === m.id}
                      onCheckedChange={(checked) =>
                        patch(m, { is_featured: checked }, checked ? "Featured" : "Unfeatured")
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_active}
                      disabled={busyId === m.id}
                      onCheckedChange={(checked) =>
                        patch(
                          m,
                          { is_active: checked },
                          checked ? `${m.model_id} activated` : `${m.model_id} deactivated`,
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openPricing(m)}
                      disabled={busyId === m.id}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pricing — {editing?.model_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(
              [
                ["input", "Input ($ per Mtok)"],
                ["output", "Output ($ per Mtok)"],
                ["cached", "Cached input ($ per Mtok)"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`price-${key}`}>{label}</Label>
                <Input
                  id={`price-${key}`}
                  inputMode="decimal"
                  value={draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder="unchanged"
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Upstream basis:{" "}
              {perMtok(editing?.upstream_pricing?.input_cents_per_mtok)} in /{" "}
              {perMtok(editing?.upstream_pricing?.output_cents_per_mtok)} out.
              Blank fields stay unchanged. Running servers are unaffected —
              usage is priced at request time from this catalog.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={savePricing}>Save pricing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
