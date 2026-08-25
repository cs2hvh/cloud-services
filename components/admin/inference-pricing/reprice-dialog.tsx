"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import api from "@/lib/axios/axios";
import type { RepricePreview } from "./types";

/**
 * Preview-then-apply repricing. The preview is not a summary — it is the exact
 * change list the write will make, produced by the same planner on the server,
 * so approving it approves precisely what happens. Nothing is written until
 * "Apply" is pressed; closing the dialog at any point is a no-op.
 */
export function RepriceDialog({
  open,
  onOpenChange,
  onApplied,
  underwaterCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
  underwaterCount: number;
}) {
  const [margin, setMargin] = useState("50");
  // Default to the NON-DESTRUCTIVE scope. "all" prices every model to the
  // target exactly, which LOWERS a model already above it — so it must never be
  // the default. A useState initialiser could not decide this anyway: it runs
  // once on first mount, before the catalog has loaded, when underwaterCount is
  // still 0 — which silently made "all" the permanent default (found in review).
  const [scope, setScope] = useState<"underwater" | "all">("underwater");
  const [preview, setPreview] = useState<RepricePreview | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPreview(null);
    setBusy(false);
  };

  // Choose the sensible scope when the dialog OPENS — by then the catalog has
  // loaded and underwaterCount is real. Still never lowers prices by surprise:
  // "all" is only pre-selected when nothing is underwater, and the amber
  // warning plus the preview diff both stand between it and a write.
  useEffect(() => {
    if (open) setScope(underwaterCount > 0 ? "underwater" : "all");
  }, [open, underwaterCount]);

  const loadPreview = async () => {
    const value = Number(margin);
    if (!Number.isFinite(value) || value < 0 || value >= 100) {
      toast.error("Target margin must be between 0 and 99");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/admin/inference/pricing/bulk", {
        margin_pct: value,
        only_at_or_below_cost: scope === "underwater",
      });
      setPreview(data);
      if (data.models_affected === 0) toast.message("Nothing to reprice at that margin");
    } catch {
      toast.error("Could not build the preview");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/inference/pricing/bulk", {
        margin_pct: Number(margin),
        only_at_or_below_cost: scope === "underwater",
        apply: true,
      });
      toast.success(`Repriced ${data.models_updated} model(s) to ${data.target_margin_pct}% margin`);
      if (data.failed?.length) toast.error(`${data.failed.length} model(s) failed to update`);
      onApplied();
      onOpenChange(false);
      reset();
    } catch {
      toast.error("Repricing failed — no prices were changed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Reprice models at or below cost
          </DialogTitle>
          <DialogDescription>
            Sets price = upstream cost ÷ (1 − margin). Per-unit SKUs and models without a known cost are never
            repriced — repricing those would be guesswork, and they are listed as skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reprice-scope">Apply to</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope(v as "underwater" | "all");
                setPreview(null);
              }}
            >
              <SelectTrigger id="reprice-scope" className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="underwater">Only models at or below cost ({underwaterCount})</SelectItem>
                <SelectItem value="all">Every token-billed model below target</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-margin">Target margin</Label>
            <div className="flex items-center gap-2">
              <Input
                id="target-margin"
                value={margin}
                onChange={(e) => {
                  setMargin(e.target.value);
                  setPreview(null);
                }}
                className="w-24 tabular-nums"
                inputMode="numeric"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          <Button variant="secondary" onClick={() => void loadPreview()} disabled={busy}>
            {busy && !preview ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Preview
          </Button>
        </div>

        {scope === "all" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This raises <strong>and lowers</strong> prices to hit the target exactly — a model already above the target
            will come <em>down</em>. Read the preview before applying.
          </p>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">{preview.models_affected}</span> model(s) would change ·{" "}
              <span className="text-muted-foreground">{preview.changes.length} price field(s)</span>
            </div>

            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">From</TableHead>
                    <TableHead className="text-right">To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.changes.map((c) => (
                    <TableRow key={`${c.model_id}:${c.field}`}>
                      <TableCell className="font-mono text-xs">{c.model_id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.field.replace("_cents_per_mtok", "")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{c.cost}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.from ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{c.to}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {preview.skipped.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Skipped {preview.skipped.length} model(s):{" "}
                {Object.entries(
                  preview.skipped.reduce<Record<string, number>>((acc, s2) => {
                    acc[s2.reason] = (acc[s2.reason] ?? 0) + 1;
                    return acc;
                  }, {})
                )
                  .map(([reason, count]) => `${count} ${reason}`)
                  .join(" · ")}
                . Neither can be priced by a token rule.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} disabled={busy || !preview || preview.models_affected === 0}>
            {busy && preview ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Apply to {preview?.models_affected ?? 0} model(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
