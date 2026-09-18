"use client";

// Price editor for per-unit models (image / video).
//
// Token models are priced per million tokens; these are priced per image or
// per second of video, with optional per-tier overrides by size or
// resolution. The two shapes share a table but not a form — a single editor
// that tried to do both would ask about Mtok on a model that has no tokens.
//
// Upstream cost is shown beside every field, and margin is computed live, so
// a price is chosen against what it actually costs rather than in the dark.

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { centsToUsd, unitNoun, unitPriceKey } from "@admin/lib/model-pricing";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Model = {
  id: string;
  model_id: string;
  modality: string;
  pricing: Record<string, unknown> | null;
  upstream_pricing: Record<string, unknown> | null;
};

const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function marginOf(price: string, cost: number | null): string {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0 || cost === null) return "—";
  return `${(((p - cost) / p) * 100).toFixed(0)}%`;
}

export function MediaPricingDialog({
  model,
  onClose,
}: {
  model: Model | null;
  onClose: (changed: boolean) => void;
}) {
  const [flat, setFlat] = useState("");
  const [tiers, setTiers] = useState<{ name: string; cents: string }[]>([]);
  // Upstream cost is editable too: margin is only ever as accurate as what
  // we believe the partner charges, and that was previously seed-only.
  const [costFlat, setCostFlat] = useState("");
  const [costTiers, setCostTiers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const unitKey = model ? unitPriceKey(model.modality) : null;
  const noun = model ? unitNoun(model.modality) : "unit";
  const upstream = model?.upstream_pricing ?? null;
  const upstreamFlat = unitKey ? asNum(upstream?.[unitKey]) : null;
  const upstreamTiers =
    upstream?.tiers && typeof upstream.tiers === "object"
      ? (upstream.tiers as Record<string, unknown>)
      : {};

  useEffect(() => {
    if (!model || !unitKey) return;
    setFlat(
      asNum(model.pricing?.[unitKey]) !== null
        ? String(asNum(model.pricing?.[unitKey]))
        : "",
    );
    const t =
      model.pricing?.tiers && typeof model.pricing.tiers === "object"
        ? (model.pricing.tiers as Record<string, unknown>)
        : {};
    setTiers(
      Object.entries(t).map(([name, cents]) => ({
        name,
        cents: String(asNum(cents) ?? ""),
      })),
    );
    setCostFlat(
      asNum(model.upstream_pricing?.[unitKey]) !== null
        ? String(asNum(model.upstream_pricing?.[unitKey]))
        : "",
    );
    const ut =
      model.upstream_pricing?.tiers &&
      typeof model.upstream_pricing.tiers === "object"
        ? (model.upstream_pricing.tiers as Record<string, unknown>)
        : {};
    setCostTiers(
      Object.fromEntries(
        Object.entries(ut).map(([name, cents]) => [name, String(asNum(cents) ?? "")]),
      ),
    );
  }, [model, unitKey]);

  const submit = async () => {
    if (!model || !unitKey) return;
    const pricing: Record<string, unknown> = {};

    if (flat.trim() !== "") {
      const n = Number(flat);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(`Price per ${noun} must be a number ≥ 0 (in cents)`);
        return;
      }
      pricing[unitKey] = n;
    }

    const seen = new Set<string>();
    const tierMap: Record<string, number> = {};
    for (const t of tiers) {
      const name = t.name.trim();
      if (name === "" && t.cents.trim() === "") continue;
      if (!/^[A-Za-z0-9._-]{1,20}$/.test(name)) {
        toast.error(`"${name || "(blank)"}" is not a valid tier name`);
        return;
      }
      if (seen.has(name)) {
        toast.error(`Tier "${name}" is listed twice`);
        return;
      }
      seen.add(name);
      const n = Number(t.cents);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(`Tier "${name}" must be a number ≥ 0 (in cents)`);
        return;
      }
      tierMap[name] = n;
    }
    // Always send tiers, so removing the last one actually clears it.
    pricing.tiers = tierMap;

    // Upstream cost, same two shapes.
    const upstream: Record<string, unknown> = {};
    if (costFlat.trim() !== "") {
      const n = Number(costFlat);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(`Upstream cost per ${noun} must be a number >= 0 (cents)`);
        return;
      }
      upstream[unitKey] = n;
    }
    const upstreamTierMap: Record<string, number> = {};
    for (const [name, raw] of Object.entries(costTiers)) {
      if (raw.trim() === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(`Upstream cost for "${name}" must be a number >= 0 (cents)`);
        return;
      }
      upstreamTierMap[name] = n;
    }
    upstream.tiers = upstreamTierMap;

    setSaving(true);
    try {
      await api.patch(`/admin/ai/models/${model.id}`, {
        pricing,
        upstream_pricing: upstream,
      });
      toast.success(`${model.model_id} pricing updated`);
      onClose(true);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      toast.error(msg || "Could not update pricing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!model} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pricing — {model?.model_id}</DialogTitle>
        </DialogHeader>

        <p className="text-[11.5px] text-muted-foreground">
          Priced per {noun}, in <strong>cents</strong>. Tiers override the
          default for the sizes they name; anything not listed bills the
          default. The second field on each row is what the partner charges
          us — margin is only as accurate as that, and a change applies to
          requests made after it.
        </p>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="flat">Default — cents per {noun}</Label>
            <div className="flex items-center gap-3">
              <Input
                id="flat"
                inputMode="decimal"
                value={flat}
                onChange={(e) => setFlat(e.target.value)}
                placeholder="unset"
                className={`h-9 ${MONO}`}
              />
              <Input
                inputMode="decimal"
                value={costFlat}
                onChange={(e) => setCostFlat(e.target.value)}
                placeholder="cost"
                className={`h-9 w-[90px] ${MONO}`}
                title="What the partner charges us, in cents"
              />
              <span className="w-[90px] shrink-0 text-[11.5px] text-muted-foreground">
                margin {marginOf(flat, costFlat.trim() === "" ? null : Number(costFlat))}
              </span>
            </div>
            {flat.trim() !== "" && Number(flat) > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {centsToUsd(Number(flat))} per {noun}
                {noun === "second" && ` · ${centsToUsd(Number(flat) * 5)} for a 5s clip`}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tiers</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTiers((t) => [...t, { name: "", cents: "" }])}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add tier
              </Button>
            </div>
            {tiers.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">
                No tiers — every request bills the default above.
              </p>
            ) : (
              <div className="space-y-2">
                {tiers.map((t, i) => {
                  const cost = asNum(upstreamTiers[t.name.trim()]) ?? upstreamFlat;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={t.name}
                        onChange={(e) =>
                          setTiers((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="720p"
                        className={`h-9 w-[110px] ${MONO}`}
                      />
                      <Input
                        inputMode="decimal"
                        value={t.cents}
                        onChange={(e) =>
                          setTiers((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, cents: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="cents"
                        className={`h-9 w-[100px] ${MONO}`}
                      />
                      <Input
                        inputMode="decimal"
                        value={costTiers[t.name.trim()] ?? ""}
                        onChange={(e) =>
                          setCostTiers((prev) => ({
                            ...prev,
                            [t.name.trim()]: e.target.value,
                          }))
                        }
                        placeholder="cost"
                        className={`h-9 w-[90px] ${MONO}`}
                        title="What the partner charges us for this tier, in cents"
                      />
                      <span className="flex-1 text-[11.5px] text-muted-foreground">
                        margin{" "}
                        {marginOf(
                          t.cents,
                          (costTiers[t.name.trim()] ?? "").trim() === ""
                            ? cost
                            : Number(costTiers[t.name.trim()]),
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-red-300 hover:text-red-200"
                        onClick={() =>
                          setTiers((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save pricing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
