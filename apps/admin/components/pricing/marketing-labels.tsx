"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip, Table } from "@admin/components/deploy/bits";

export interface CategoryRow {
  id: number;
  slug: string;
  label: string;
  starting_price_label: string | null;
  /** Cheapest live monthly price from the price book, null when unmappable. */
  floor: number | null;
}

/**
 * The "starting at" strings the PUBLIC pricing page shows, next to what the
 * price book actually says. Hand-typed labels drift silently the first time
 * a real price changes — this card makes the drift visible and the fix a
 * one-field audited edit.
 */
export function MarketingLabels({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const save = async (row: CategoryRow) => {
    const label = (drafts[row.id] ?? row.starting_price_label ?? "").trim();
    if (!label) return;
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/pricing/categories-label", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, starting_price_label: label }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`"${row.label}" starting price updated`);
        router.refresh();
      } else toast.error(data.error ?? "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold tracking-tight">
          Public &quot;starting at&quot; labels
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          What the marketing pricing page shows visitors — hand-typed, so it
          drifts from the book unless someone looks. Book floor shown for
          comparison; edits are audited.
        </p>
      </header>
      <div className="p-4">
        <Table head={["category", "label shown", "book floor", "status", ""]}>
          {categories.map((c) => {
            const draft = drafts[c.id] ?? c.starting_price_label ?? "";
            const floorLabel = c.floor === null ? null : `${Math.round(c.floor * 100) / 100}`;
            const agrees =
              floorLabel !== null &&
              draft.replace(/[^0-9.]/g, "") === floorLabel.replace(/[^0-9.]/g, "");
            return (
              <tr key={c.id} className="border-t border-border/60">
                <td className="py-1.5 pr-4">{c.label}</td>
                <td className="py-1.5 pr-4">
                  <Input
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    className="h-8 w-28"
                  />
                </td>
                <td className="py-1.5 pr-4 text-muted-foreground">
                  {c.floor === null ? "—" : `$${c.floor.toFixed(2)}/mo`}
                </td>
                <td className="py-1.5 pr-4">
                  {c.floor === null ? (
                    <span className="text-xs text-muted-foreground">no mapping</span>
                  ) : agrees ? (
                    <StatusChip status="clean" />
                  ) : (
                    <StatusChip status="drift" />
                  )}
                </td>
                <td className="py-1.5 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === c.id || draft.trim() === (c.starting_price_label ?? "")}
                    onClick={() => save(c)}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </section>
  );
}
