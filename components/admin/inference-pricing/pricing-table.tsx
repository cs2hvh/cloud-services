"use client";

import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TOKEN_FIELDS,
  TOKEN_FIELD_LABELS,
  isTokenBilled,
  perUnitRates,
  readPrice,
  unitLabel,
} from "@/lib/admin/inference-pricing";
import { MarginBadge } from "./margin-badge";
import type { CatalogRow } from "./types";

/**
 * The catalog at a glance: what we charge, what it costs, the margin between.
 *
 * Read-only on purpose. This used to hold three bare number inputs per row, in
 * cents per million tokens, with no cost or margin beside them — dense and easy
 * to mistype. Editing now happens in a dialog that shows price, cost and margin
 * together, so the table's job is scanning, not data entry.
 */
export function PricingTable({
  rows,
  savingId,
  onEdit,
  onToggleActive,
  loading,
}: {
  rows: CatalogRow[];
  savingId: string | null;
  onEdit: (row: CatalogRow) => void;
  onToggleActive: (row: CatalogRow, next: boolean) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
        No models match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <Table>
        <TableHeader className="[&_tr]:border-white/10">
          <TableRow>
            <TableHead className="min-w-[240px]">Model</TableHead>
            {TOKEN_FIELDS.map((field) => (
              <TableHead key={field} className="text-right">
                {TOKEN_FIELD_LABELS[field]}
                <span className="ml-1 font-normal text-neutral-500">¢/Mtok</span>
              </TableHead>
            ))}
            <TableHead className="text-right">Our cost</TableHead>
            <TableHead className="text-right">Margin</TableHead>
            <TableHead className="text-center">Active</TableHead>
            <TableHead className="w-[90px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const cost = readPrice(row.upstream_pricing, "output_cents_per_mtok");
            const tokenBilled = isTokenBilled(row);
            const rates = perUnitRates(row.pricing);

            return (
              <TableRow
                key={row.model_id}
                className={`border-white/5 hover:bg-white/[0.03] ${row.is_active ? "" : "opacity-60"}`}
              >
                <TableCell>
                  <div className="font-mono text-xs">{row.model_id}</div>
                  {row.display_name && <div className="mt-0.5 text-xs text-neutral-400">{row.display_name}</div>}
                </TableCell>

                {tokenBilled ? (
                  TOKEN_FIELDS.map((field) => {
                    const price = readPrice(row.pricing, field);
                    return (
                      <TableCell key={field} className="text-right tabular-nums">
                        {price === null ? <span className="text-neutral-600">—</span> : price}
                      </TableCell>
                    );
                  })
                ) : (
                  <TableCell colSpan={TOKEN_FIELDS.length}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-white/15 text-[10px]">
                        per-unit
                      </Badge>
                      {rates.length > 0 ? (
                        rates.map(({ key, value }) => (
                          <span key={key} className="text-xs text-neutral-400">
                            {unitLabel(key)} <span className="tabular-nums text-white">{value}¢</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-neutral-500">no price set</span>
                      )}
                    </div>
                  </TableCell>
                )}

                <TableCell className="text-right tabular-nums text-neutral-400">
                  {tokenBilled ? (cost ?? "—") : <span className="text-xs">n/a</span>}
                </TableCell>

                <TableCell className="text-right">
                  {tokenBilled ? (
                    <MarginBadge margin={row.margin_pct} costKnown={row.cost_known} />
                  ) : (
                    <span className="text-xs text-neutral-500">not token-priced</span>
                  )}
                </TableCell>

                <TableCell className="text-center">
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={(next) => onToggleActive(row, next)}
                    disabled={savingId === row.model_id}
                    aria-label={`${row.is_active ? "Disable" : "Enable"} ${row.model_id}`}
                  />
                </TableCell>

                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/15"
                    onClick={() => onEdit(row)}
                    aria-label={`Edit pricing for ${row.model_id}`}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
