"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/axios/axios";
import {
  TOKEN_FIELDS,
  TOKEN_FIELD_LABELS,
  isTokenBilled,
  perUnitRates,
  priceForMargin,
  readPrice,
  unitLabel,
  type TokenField,
} from "@/lib/admin/inference-pricing";
import type { CatalogRow } from "./types";

/** 3000 cents per Mtok reads as "$30.00 per 1M tokens" — the unit customers think in. */
const perMillion = (cents: number | null) => (cents === null ? "—" : `$${(cents / 100).toFixed(2)}`);

function marginOf(price: number | null, cost: number | null): number | null {
  if (price === null || cost === null || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

function MarginText({ price, cost }: { price: number | null; cost: number | null }) {
  const margin = marginOf(price, cost);
  if (margin === null) return <span className="text-xs text-neutral-500">—</span>;
  const tone = margin <= 0 ? "text-red-400" : margin < 20 ? "text-amber-400" : "text-emerald-400";
  return <span className={`text-sm font-medium tabular-nums ${tone}`}>{margin.toFixed(0)}%</span>;
}

/**
 * Per-model price editing.
 *
 * The table used to expose three bare number inputs in a dense row, in cents
 * per million tokens, with no cost or margin beside them — you had to know the
 * unit and do the arithmetic yourself. Here each price sits next to what it
 * costs us, what margin it produces, and what it means in dollars, plus a
 * "set every price to N% margin" helper so the common case is one action.
 */
export function EditPriceDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: CatalogRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [tokenDraft, setTokenDraft] = useState<Partial<Record<TokenField, string>>>({});
  const [unitDraft, setUnitDraft] = useState<Record<string, string>>({});
  const [targetMargin, setTargetMargin] = useState("50");
  const [saving, setSaving] = useState(false);

  // Reset whenever a different model is opened.
  useEffect(() => {
    setTokenDraft({});
    setUnitDraft({});
    setSaving(false);
  }, [row?.model_id]);

  const tokenBilled = row ? isTokenBilled(row) : true;
  const rates = useMemo(() => (row ? perUnitRates(row.pricing) : []), [row]);

  if (!row) return null;

  const priceOf = (field: TokenField): number | null => {
    const draft = tokenDraft[field];
    if (draft === undefined) return readPrice(row.pricing, field);
    if (draft.trim() === "") return null;
    const value = Number(draft);
    return Number.isFinite(value) ? value : null;
  };

  const valueOf = (field: TokenField): string => {
    const draft = tokenDraft[field];
    if (draft !== undefined) return draft;
    const stored = readPrice(row.pricing, field);
    return stored === null ? "" : String(stored);
  };

  const dirty = Object.keys(tokenDraft).length > 0 || Object.keys(unitDraft).length > 0;

  /** Fill every field that has a known cost from the target margin. */
  const applyTargetMargin = () => {
    const target = Number(targetMargin);
    if (!Number.isFinite(target) || target < 0 || target >= 100) {
      toast.error("Target margin must be between 0 and 99");
      return;
    }
    const next: Partial<Record<TokenField, string>> = { ...tokenDraft };
    let filled = 0;
    for (const field of TOKEN_FIELDS) {
      const cost = readPrice(row.upstream_pricing, field);
      if (cost === null || cost <= 0) continue;
      next[field] = String(priceForMargin(cost, target));
      filled++;
    }
    if (filled === 0) {
      toast.message("No upstream cost for this model — nothing to compute from");
      return;
    }
    setTokenDraft(next);
  };

  const save = async (force = false) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { model_id: row.model_id, force };
      for (const field of TOKEN_FIELDS) {
        const draft = tokenDraft[field];
        if (draft === undefined) continue;
        payload[field] = draft.trim() === "" ? null : Number(draft);
      }
      if (Object.keys(unitDraft).length > 0) {
        payload.unit_prices = Object.fromEntries(
          Object.entries(unitDraft).map(([key, value]) => [key, value.trim() === "" ? null : Number(value)])
        );
      }
      await api.put("/admin/inference/pricing", payload);
      toast.success(`Saved ${row.model_id}`);
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const res = (
        err as { response?: { status?: number; data?: { error?: string; violations?: Array<{ field: string; value: number; cost: number }> } } }
      )?.response;
      if (res?.status === 409) {
        const detail = (res.data?.violations ?? [])
          .map((v) => `${v.field.replace("_cents_per_mtok", "")}: ${v.value} vs cost ${v.cost}`)
          .join("\n");
        if (window.confirm(`This prices ${row.model_id} BELOW cost:\n\n${detail}\n\nSave as a deliberate loss-leader?`)) {
          await save(true);
          return;
        }
        toast.message("Not saved — price left unchanged");
      } else {
        toast.error(res?.data?.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  const belowCost = TOKEN_FIELDS.some((field) => {
    const price = priceOf(field);
    const cost = readPrice(row.upstream_pricing, field);
    return price !== null && cost !== null && price < cost;
  });

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row.display_name ?? row.model_id}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{row.model_id}</DialogDescription>
        </DialogHeader>

        {tokenBilled ? (
          <>
            {/* Quick action first: the common case is "put this on N% margin". */}
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-target-margin" className="text-xs">
                  Set every price to
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-target-margin"
                    value={targetMargin}
                    onChange={(e) => setTargetMargin(e.target.value)}
                    className="h-8 w-20 border-white/15 bg-black/40 tabular-nums"
                    inputMode="numeric"
                  />
                  <span className="text-sm text-neutral-400">% margin</span>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={applyTargetMargin} disabled={!row.cost_known}>
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Calculate
              </Button>
              {!row.cost_known && (
                <p className="text-xs text-neutral-500">No upstream cost known — prices must be set by hand.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_5rem_7rem_4rem] items-center gap-3 px-1 text-xs text-neutral-500">
                <span />
                <span className="text-right">Our cost</span>
                <span className="text-right">We charge</span>
                <span className="text-right">Margin</span>
              </div>

              {TOKEN_FIELDS.map((field) => {
                const cost = readPrice(row.upstream_pricing, field);
                const price = priceOf(field);
                return (
                  <div key={field} className="grid grid-cols-[1fr_5rem_7rem_4rem] items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                    <div>
                      <div className="text-sm text-white">{TOKEN_FIELD_LABELS[field]}</div>
                      <div className="text-xs text-neutral-500">{perMillion(price)} per 1M tokens</div>
                    </div>
                    <div className="text-right text-sm tabular-nums text-neutral-400">{cost ?? "—"}</div>
                    <Input
                      value={valueOf(field)}
                      onChange={(e) => setTokenDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                      className="h-8 border-white/15 bg-black/40 text-right tabular-nums"
                      inputMode="numeric"
                      aria-label={`${TOKEN_FIELD_LABELS[field]} price`}
                    />
                    <div className="text-right">
                      <MarginText price={price} cost={cost} />
                    </div>
                  </div>
                );
              })}
              <p className="px-1 text-xs text-neutral-500">All values in cents per million tokens — the unit the biller reads.</p>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-neutral-400">
              This model is billed per unit, not per token. Rates are in cents.
            </p>
            {rates.map(({ key, value }) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <span className="text-sm text-white">per {unitLabel(key)}</span>
                <div className="flex items-center gap-2">
                  <Input
                    value={unitDraft[key] ?? String(value)}
                    onChange={(e) => setUnitDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="h-8 w-24 border-white/15 bg-black/40 text-right tabular-nums"
                    inputMode="numeric"
                    aria-label={`${unitLabel(key)} rate`}
                  />
                  <span className="text-sm text-neutral-400">¢</span>
                </div>
              </div>
            ))}
            {rates.length === 0 && <p className="text-sm text-neutral-500">No rates configured for this model.</p>}
          </div>
        )}

        {belowCost && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-200">
              At least one price is below what the model costs us. Saving will ask you to confirm it as a deliberate
              loss-leader.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
