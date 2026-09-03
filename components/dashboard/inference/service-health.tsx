"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

import {
  ACCENT,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  SectionHead,
  StatCell,
  StatsStrip,
} from "@/components/dashboard/inference/chrome";

export type ServiceHealthStatus = "operational" | "degraded" | "down";

export interface ServiceHealthCategory {
  id: string;
  label: string;
  status: ServiceHealthStatus;
  /** Customer-facing summary — vendor-neutral. Never includes upstream
   *  provider names or internal mechanics. */
  summary: string;
}

const STATUS_PALETTE: Record<
  ServiceHealthStatus,
  { color: string; bg: string; label: string }
> = {
  operational: { color: "#22c55e", bg: "rgba(34,197,94,0.08)", label: "Operational" },
  degraded: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", label: "Degraded" },
  down: { color: "#ef4444", bg: "rgba(239,68,68,0.08)", label: "Disruption" },
};

/**
 * Customer-facing service-health view. Intentionally generic — no
 * upstream provider names, no remediation commands, no internal
 * mechanics. The detailed operator diagnostics live behind an
 * operator-allowlist gate; everything else routes here.
 */
export function ServiceHealth({
  categories,
  orgName,
  fetchedAt,
}: {
  categories: ServiceHealthCategory[];
  orgName: string;
  fetchedAt: string;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const reload = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1500);
  };

  const downCount = categories.filter((c) => c.status === "down").length;
  const degradedCount = categories.filter((c) => c.status === "degraded").length;
  const opCount = categories.filter((c) => c.status === "operational").length;

  const overall: ServiceHealthStatus =
    downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "operational";
  const overallCopy: Record<ServiceHealthStatus, string> = {
    operational: "All AhuraCloud Inference systems are operating normally.",
    degraded:
      "Some subsystems are degraded but the platform remains usable. We're monitoring.",
    down:
      "One or more subsystems are experiencing a disruption. We're actively investigating.",
  };

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Service"
        accent="health"
        caption={overallCopy[overall]}
        size="md"
        actions={
          <PrimaryButton onClick={reload} disabled={refreshing}>
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Re-check
          </PrimaryButton>
        }
      />

      <StatsStrip>
        <StatCell
          label="Operational"
          value={String(opCount)}
          hint={`of ${categories.length} subsystems`}
          accent="#22c55e"
        />
        <StatCell
          label="Degraded"
          value={String(degradedCount)}
          hint={degradedCount > 0 ? "Reduced capacity" : "None"}
          accent={degradedCount > 0 ? "#f59e0b" : undefined}
        />
        <StatCell
          label="Disruption"
          value={String(downCount)}
          hint={downCount > 0 ? "Active incident" : "None"}
          accent={downCount > 0 ? "#ef4444" : undefined}
        />
        <StatCell
          label="Last checked"
          value={new Date(fetchedAt).toLocaleTimeString()}
          hint="Live · not cached"
          accent={ACCENT}
        />
      </StatsStrip>

      <SectionHead
        title="By"
        accent="subsystem"
        rightMeta={`org: ${orgName}`}
      />

      <div className="space-y-2">
        {categories.map((c) => {
          const pal = STATUS_PALETTE[c.status];
          return (
            <div
              key={c.id}
              className="rounded-[6px] border bg-[#111216] px-4 py-3"
              style={{
                borderColor:
                  c.status === "operational"
                    ? "rgba(255,255,255,0.06)"
                    : pal.color + "33",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      background: pal.color,
                      boxShadow: `0 0 8px ${pal.color}`,
                    }}
                  />
                  <span className="text-[13px] font-semibold text-white">{c.label}</span>
                </div>
                <span
                  className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold px-2 py-0.5 rounded shrink-0`}
                  style={{ color: pal.color, background: pal.bg }}
                >
                  {pal.label}
                </span>
              </div>
              <p
                className={`${MONO} mt-1.5 text-[11px] text-white/65 leading-relaxed pl-[18px]`}
              >
                {c.summary}
              </p>
            </div>
          );
        })}
      </div>

      <p className={`${MONO} mt-6 text-[10.5px] text-white/40 leading-relaxed`}>
        Seeing problems that don&apos;t reflect here? Open a support ticket and
        reference the time above — we&apos;ll dig into the platform-side details.
      </p>
    </PageCanvas>
  );
}
