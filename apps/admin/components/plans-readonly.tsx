"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeDollarSign, Loader2 } from "lucide-react";
import type { Tables } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Table } from "@admin/components/deploy/bits";
import { HOURS_IN_MONTH } from "@admin/lib/pricing";

/**
 * Read-only "current plans & prices" view shared by the service sections.
 * Prices are SET in exactly one place — the price book (/pricing, via
 * billing.set_price) — so this component deliberately has no edit chrome;
 * it replaced four v1 tabs whose add/edit/delete buttons wrote to a table
 * that no longer exists. The Edit prices button deep-links into the price
 * book pre-filtered to this service.
 */

/** legacy fetch key → price-book service_type */
const SERVICE_KEY: Record<string, string> = {
  database: "database",
  kubernetes: "kubernetes",
  "object-storage": "objectspace",
  "network-ddos": "spectrum",
};

interface PlanRow {
  id: string;
  name: string;
  sub?: string | null;
  price?: number | null;
  resources?: { cpu?: number; ram?: number; storage?: number } | null;
}

export function PlansReadonly({
  serviceType,
  initialPlans,
}: {
  /** Legacy type key: database | kubernetes | object-storage | network-ddos */
  serviceType: string;
  initialPlans?: Tables<"products">[];
}) {
  const [plans, setPlans] = useState<PlanRow[] | null>(
    (initialPlans as unknown as PlanRow[]) ?? null,
  );

  useEffect(() => {
    if (plans !== null) return;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/products?type=${serviceType}`);
        const data = await res.json();
        setPlans(res.ok ? ((data.data ?? []) as PlanRow[]) : []);
      } catch {
        setPlans([]);
      }
    })();
  }, [plans, serviceType]);

  const bookHref = `/pricing?service=${SERVICE_KEY[serviceType] ?? serviceType}`;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Plans &amp; prices
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Catalog from service_plans, prices from the live price book —
            read-only here by design.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={bookHref}>
            <BadgeDollarSign className="mr-1.5 h-3.5 w-3.5" />
            Edit prices
          </Link>
        </Button>
      </div>
      <div className="p-4">
        {plans === null ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : plans.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No active plans for this service.
          </p>
        ) : (
          <Table head={["plan", "engine/tier", "specs", "per month", "≈ per hour"]}>
            {plans.map((p) => {
              const monthly = Number(p.price) || 0;
              const r = p.resources ?? {};
              const specs = [
                r.cpu && `${r.cpu} vCPU`,
                r.ram && `${r.ram} GB RAM`,
                r.storage && `${r.storage} GB`,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{p.name}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{p.sub ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{specs || "—"}</td>
                  <td className="py-1.5 pr-4">${monthly.toFixed(2)}</td>
                  <td className="py-1.5 text-muted-foreground">
                    ${(monthly / HOURS_IN_MONTH).toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
    </div>
  );
}
