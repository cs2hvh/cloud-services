"use client";

// Pull list prices from OpenRouter, review them, then apply.
//
// This one action can move the price of every model we sell, so it is built
// as a preview that writes nothing until each row has been seen and ticked.
// The table shows all four layers side by side - what we pay, what the
// market lists, how far under we sit, and what the customer ends up paying -
// because a list price on its own tells you nothing about whether the
// resulting price is sane.
//
// The discount is set HERE rather than afterwards. Applying a list price at
// whatever discount each row happens to carry is how every model quietly
// jumps to somebody else's rack rate; the sell column updates as the
// discount is typed, so what is approved is the final number.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Pair = { input: number | null; output: number | null };

type PreviewRow = {
  id: string;
  modelId: string;
  displayName: string | null;
  matchedBy: string;
  matchKey: string;
  isActive: boolean;
  provider: string | null;
  discountPct: number;
  currentDiscountPct: number;
  currentList: Pair;
  newList: Pair & { cached: number | null };
  currentSell: Pair;
  newSell: Pair;
  sellChangePct: Pair;
  realCost: Pair;
  newMarginPct: Pair;
  belowCost: boolean;
  zeroList: boolean;
};

type Preview = {
  fetchedAt: string;
  catalogueSize: number;
  proposedDiscountPct: number | null;
  summary: {
    proxyModels: number;
    matched: number;
    unmatched: number;
    wouldChange: number;
    wouldRise: number;
    wouldFall: number;
    belowCost: number;
    zeroList: number;
  };
  rows: PreviewRow[];
  unmatched: {
    id: string;
    modelId: string;
    displayName: string | null;
    matchKey: string;
    isActive: boolean;
  }[];
};

const c = (n: number | null) => (n === null ? "—" : `${n}¢`);

function ChangeChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(pct) < 0.01) return <span className="text-muted-foreground">no change</span>;
  const up = pct > 0;
  return (
    <span className={up ? "text-amber-300" : "text-emerald-300"}>
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

export function SyncOpenRouterDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (changed: boolean) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Blank means "leave each model's own discount alone".
  const [discount, setDiscount] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Preview>("/admin/ai/models/sync-openrouter", {
        params: discount.trim() === "" ? {} : { discount: discount.trim() },
      });
      setPreview(res.data);
      // Default selection is deliberately conservative: live models whose
      // price would actually move, minus the ones flagged as dangerous. A
      // free-tier list price or a below-cost result has to be ticked by hand.
      setSelected(
        new Set(
          res.data.rows
            .filter(
              (r) =>
                r.isActive &&
                !r.zeroList &&
                !r.belowCost &&
                (Math.abs(r.sellChangePct.input ?? 0) > 0.01 ||
                  Math.abs(r.sellChangePct.output ?? 0) > 0.01),
            )
            .map((r) => r.id),
        ),
      );
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      setError(msg || "Could not reach OpenRouter");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [discount]);

  useEffect(() => {
    if (open) void load();
    // Re-previewing on every keystroke of the discount would hammer
    // OpenRouter; the operator refreshes when ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rows = useMemo(
    () => (preview?.rows ?? []).filter((r) => !activeOnly || r.isActive),
    [preview, activeOnly],
  );

  const apply = async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Nothing selected");
      return;
    }
    setApplying(true);
    try {
      const res = await api.post<{ applied: number; skipped: { reason: string }[] }>(
        "/admin/ai/models/sync-openrouter",
        {
          ids,
          discount_pct: discount.trim() === "" ? undefined : Number(discount),
        },
      );
      const skipped = res.data.skipped?.length ?? 0;
      toast.success(
        `List prices applied to ${res.data.applied} model(s)` +
          (skipped > 0 ? `, ${skipped} skipped` : ""),
      );
      onClose(true);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      toast.error(msg || "Sync failed");
    } finally {
      setApplying(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const s = preview?.summary;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-h-[92vh] w-[min(1200px,96vw)] max-w-none overflow-hidden">
        <DialogHeader>
          <DialogTitle>Sync list prices from OpenRouter</DialogTitle>
        </DialogHeader>

        <p className="text-[11.5px] text-muted-foreground">
          OpenRouter is the <strong>list price</strong> — what the market
          charges for these models. It is not what we pay and not what we
          charge. The customer price is list × (1 − discount), recomputed when
          either side moves. Nothing is written until you apply.
        </p>

        <div className="flex flex-wrap items-end gap-3 border-y border-white/[0.06] py-3">
          <div className="space-y-1">
            <Label htmlFor="disc" className="text-[11px]">
              Discount to apply (%)
            </Label>
            <Input
              id="disc"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="keep each model's own"
              className={`h-8 w-[190px] text-[12px] ${MONO}`}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Preview
          </Button>
          <label className="flex items-center gap-2 pb-1 text-[11.5px] text-muted-foreground">
            <Checkbox
              checked={activeOnly}
              onCheckedChange={(v) => setActiveOnly(Boolean(v))}
            />
            Live models only
          </label>
          {s && (
            <div className="ml-auto pb-1 text-[11.5px] text-muted-foreground">
              {s.matched} of {s.proxyModels} matched · {s.unmatched} unmatched
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {/* The one outcome worth interrupting for. */}
        {s && s.wouldRise > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>{s.wouldRise} live model(s) would get more expensive</strong>
              {s.wouldFall > 0 && ` and ${s.wouldFall} cheaper`} at this
              discount. A rise reaches customers on their next request. If
              today&apos;s prices already sit under list, set the discount that
              reproduces them before applying.
            </span>
          </div>
        )}
        {s && s.belowCost > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>{s.belowCost} model(s) would sell below what we pay</strong>{" "}
              for them. Those rows are not selected by default.
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-white/[0.06]">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 z-10 bg-[#0d0d0f] text-left text-muted-foreground">
              <tr className="border-b border-white/[0.06]">
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 font-medium">Model</th>
                <th className="px-2 py-2 text-right font-medium">
                  Real cost
                  <span className="ml-1 rounded border border-white/[0.15] px-1 text-[9px] uppercase tracking-wide text-white/50">
                    internal
                  </span>
                </th>
                <th className="px-2 py-2 text-right font-medium">List now</th>
                <th className="px-2 py-2 text-right font-medium">List new</th>
                <th className="px-2 py-2 text-right font-medium">Disc.</th>
                <th className="px-2 py-2 text-right font-medium">Sell now</th>
                <th className="px-2 py-2 text-right font-medium">Sell new</th>
                <th className="px-2 py-2 text-right font-medium">Change</th>
                <th className="px-2 py-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">
                    No matched models to show.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-white/[0.04] ${
                    selected.has(r.id) ? "bg-white/[0.03]" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 align-top">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className={MONO}>{r.modelId}</span>
                      {!r.isActive && (
                        <span className="rounded border border-white/[0.15] px-1 text-[9px] text-white/50">
                          delisted
                        </span>
                      )}
                      {r.zeroList && (
                        <span
                          className="rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[9px] text-amber-300"
                          title="OpenRouter lists this model at zero. Applying would set our price to nothing."
                        >
                          free on list
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {r.provider ?? "—"}
                      {r.matchedBy === "model_id"
                        ? " · matched by model id"
                        : " · matched by openrouter id"}
                    </div>
                  </td>
                  <td className={`px-2 py-1.5 text-right align-top tabular-nums text-muted-foreground ${MONO}`}>
                    {c(r.realCost.input)} / {c(r.realCost.output)}
                  </td>
                  <td className={`px-2 py-1.5 text-right align-top tabular-nums text-muted-foreground ${MONO}`}>
                    {c(r.currentList.input)} / {c(r.currentList.output)}
                  </td>
                  <td className={`px-2 py-1.5 text-right align-top tabular-nums ${MONO}`}>
                    {c(r.newList.input)} / {c(r.newList.output)}
                  </td>
                  <td className={`px-2 py-1.5 text-right align-top tabular-nums ${MONO}`}>
                    {r.discountPct}%
                    {r.discountPct !== r.currentDiscountPct && (
                      <div className="text-[9.5px] text-muted-foreground">
                        was {r.currentDiscountPct}%
                      </div>
                    )}
                  </td>
                  <td className={`px-2 py-1.5 text-right align-top tabular-nums text-muted-foreground ${MONO}`}>
                    {c(r.currentSell.input)} / {c(r.currentSell.output)}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right align-top tabular-nums ${MONO} ${
                      r.belowCost ? "text-red-300" : ""
                    }`}
                  >
                    {c(r.newSell.input)} / {c(r.newSell.output)}
                  </td>
                  <td className="px-2 py-1.5 text-right align-top tabular-nums">
                    <ChangeChip pct={r.sellChangePct.input} />
                  </td>
                  <td className="px-2 py-1.5 text-right align-top tabular-nums">
                    {r.newMarginPct.input === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={
                          r.newMarginPct.input < 0 ? "text-red-300" : "text-emerald-300"
                        }
                      >
                        {r.newMarginPct.input.toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unmatched rows are listed rather than counted: a model missing from
            OpenRouter keeps whatever price it has, and the operator should
            know which ones those are. */}
        {preview && preview.unmatched.length > 0 && (
          <details className="rounded-md border border-white/[0.06] px-3 py-2 text-[11.5px]">
            <summary className="cursor-pointer text-muted-foreground">
              {preview.unmatched.filter((u) => u.isActive).length} live model(s)
              not found on OpenRouter — unchanged
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preview.unmatched
                .filter((u) => u.isActive)
                .map((u) => (
                  <span
                    key={u.id}
                    className={`rounded border border-white/[0.1] px-1.5 py-0.5 ${MONO} text-[10.5px] text-muted-foreground`}
                    title={`Looked for "${u.matchKey}". Set an OpenRouter id on the model to match it.`}
                  >
                    {u.modelId}
                  </span>
                ))}
            </div>
          </details>
        )}

        <DialogFooter className="gap-2">
          <span className="mr-auto text-[11.5px] text-muted-foreground">
            {selected.size} selected
            {preview && ` · catalogue of ${preview.catalogueSize}`}
          </span>
          <Button variant="ghost" onClick={() => onClose(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} disabled={applying || selected.size === 0}>
            {applying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Apply to {selected.size} model{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
