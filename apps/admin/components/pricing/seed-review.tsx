"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip, Table } from "@admin/components/deploy/bits";
import {
  formatRate,
  hourlyEquivalent,
  monthlyEquivalent,
  type SeedCandidate,
} from "@admin/lib/pricing";

const money = (n: number, places = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places })}`;

export function SeedReview({
  candidates,
  pricedKeys,
}: {
  candidates: SeedCandidate[];
  /** `${service_type}:${plan_key}` of plans that already carry a live price. */
  pricedKeys: string[];
}) {
  const router = useRouter();
  const priced = useMemo(() => new Set(pricedKeys), [pricedKeys]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, SeedCandidate[]>();
    for (const c of candidates) {
      const list = m.get(c.service_type) ?? [];
      list.push(c);
      m.set(c.service_type, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [candidates]);

  const apply = async (serviceType: string) => {
    setApplying(serviceType);
    setConfirming(null);
    try {
      const res = await fetch("/api/admin/pricing/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceType }),
      });
      const data = await res.json();
      if (data.failures?.length) {
        toast.error(
          `${serviceType}: ${data.applied} applied, ${data.failures.length} refused — first: ${data.failures[0].planKey} (${data.failures[0].error})`,
        );
      } else if (data.success) {
        toast.success(
          `${serviceType}: ${data.applied} price(s) seeded${data.skipped ? `, ${data.skipped} already priced` : ""}`,
        );
      } else {
        toast.error(data.error ?? "Seed failed");
      }
      router.refresh();
    } catch {
      toast.error("Seed request failed");
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="space-y-6">
      {groups.map(([serviceType, rows]) => {
        const pending = rows.filter((r) => !priced.has(`${r.service_type}:${r.plan_key}`));
        return (
          <section key={serviceType} className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="font-heading text-sm font-semibold tracking-tight">
                  {serviceType}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {pending.length} to seed
                  {pending.length !== rows.length &&
                    ` · ${rows.length - pending.length} already priced`}
                </p>
              </div>
              {pending.length > 0 &&
                (confirming === serviceType ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-300">
                      Writes {pending.length} real price(s)
                    </span>
                    <Button size="sm" onClick={() => apply(serviceType)}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={applying !== null}
                    onClick={() => setConfirming(serviceType)}
                  >
                    {applying === serviceType && (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    )}
                    Apply {pending.length} price(s)
                  </Button>
                ))}
            </header>
            <div className="p-4">
              <Table head={["plan", "key", "rate (as archived)", "≈ hourly", "≈ monthly", "source", "note"]}>
                {rows.map((c) => {
                  const done = priced.has(`${c.service_type}:${c.plan_key}`);
                  const hourly = hourlyEquivalent(c.rate_model, c.unit, Number(c.amount));
                  const monthly = monthlyEquivalent(c.rate_model, c.unit, Number(c.amount));
                  const perGb = c.rate_model === "per_gb_hour" ? "/GB" : "";
                  return (
                    <tr
                      key={c.plan_key}
                      className={`border-t border-border/60 ${done ? "opacity-50" : ""}`}
                    >
                      <td className="py-1.5 pr-4">{c.plan_name}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{c.plan_key}</td>
                      <td className="py-1.5 pr-4">{formatRate(c)}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">
                        {hourly === null ? "—" : `${money(hourly, 4)}${perGb}`}
                      </td>
                      <td className="py-1.5 pr-4 text-muted-foreground">
                        {monthly === null ? "—" : `${money(monthly)}${perGb}`}
                      </td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{c.source}</td>
                      <td className="py-1.5">
                        {done ? (
                          <StatusChip status="recorded" />
                        ) : c.review_flag ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                            <Info className="h-3 w-3 shrink-0" />
                            {c.review_flag}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
