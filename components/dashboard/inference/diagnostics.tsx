"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RotateCw } from "lucide-react";
import { toast } from "sonner";

import {
  ACCENT,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  SectionHead,
  StatCell,
  StatsStrip,
} from "@/components/dashboard/inference/chrome";
import { copyToClipboard } from "@/lib/utils/safe-clipboard";

export type DiagnosticStatus = "pass" | "fail" | "warn";

export interface DiagnosticCheck {
  id: string;
  name: string;
  status: DiagnosticStatus;
  detail: string;
  remediation?: string;
}

const STATUS_PALETTE: Record<
  DiagnosticStatus,
  { color: string; bg: string; label: string }
> = {
  pass: { color: "#22c55e", bg: "rgba(34,197,94,0.08)", label: "Pass" },
  warn: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", label: "Warn" },
  fail: { color: "#ef4444", bg: "rgba(239,68,68,0.08)", label: "Fail" },
};

export function Diagnostics({
  checks,
  canView,
  orgName,
  fetchedAt,
}: {
  checks: DiagnosticCheck[];
  canView: boolean;
  orgName: string;
  fetchedAt: string;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const reload = () => {
    setRefreshing(true);
    router.refresh();
    // router.refresh() is asynchronous; let the spinner show for a moment
    // so the user sees something happen even on a fast re-render.
    setTimeout(() => setRefreshing(false), 1500);
  };

  const copyBundle = async () => {
    const bundle = [
      `# AhuraCloud Inference — Diagnostics`,
      `# Org: ${orgName}`,
      `# Captured: ${new Date(fetchedAt).toISOString()}`,
      "",
      ...checks.map(
        (c) =>
          `[${c.status.toUpperCase()}] ${c.name}\n  ${c.detail}${
            c.remediation ? `\n  Fix: ${c.remediation}` : ""
          }`
      ),
    ].join("\n");
    try {
      await copyToClipboard(bundle);
      toast.success("Diagnostic bundle copied — paste in chat or a bug report");
    } catch {
      toast.error("Copy failed");
    }
  };

  if (!canView) {
    return (
      <PageCanvas>
        <Hero
          breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
          title="Service"
          accent="health"
          caption="Only org admins and owners can view the service-health page for this org. Ask your org admin if you're seeing failures."
          size="md"
        />
      </PageCanvas>
    );
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  const overall =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";
  const overallCopy: Record<DiagnosticStatus, string> = {
    pass: "All systems green",
    warn: "Some warnings — platform usable but worth investigating",
    fail: "Critical issues — fix before relying on the platform",
  };

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Diagnostics"
        accent={overall === "pass" ? "all green" : overall === "warn" ? "warnings" : "issues"}
        caption={`${overallCopy[overall]}. Re-run anytime — checks are live, not cached.`}
        size="md"
        actions={
          <>
            <GhostButton onClick={copyBundle}>
              <Copy className="h-3.5 w-3.5" />
              Copy bundle
            </GhostButton>
            <PrimaryButton onClick={reload} disabled={refreshing}>
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Re-run
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell
          label="Passing"
          value={String(passCount)}
          hint={`of ${checks.length} checks`}
          accent="#22c55e"
        />
        <StatCell
          label="Warnings"
          value={String(warnCount)}
          hint={warnCount > 0 ? "Worth a look" : "None"}
          accent={warnCount > 0 ? "#f59e0b" : undefined}
        />
        <StatCell
          label="Failures"
          value={String(failCount)}
          hint={failCount > 0 ? "Action required" : "None"}
          accent={failCount > 0 ? "#ef4444" : undefined}
        />
        <StatCell
          label="Last run"
          value={new Date(fetchedAt).toLocaleTimeString()}
          hint={overall === "pass" ? "All green" : `${failCount + warnCount} need attention`}
          accent={ACCENT}
        />
      </StatsStrip>

      <SectionHead
        eyebrow="Checks"
        title="Platform"
        accent="health"
        rightMeta={`org: ${orgName}`}
      />

      <div className="space-y-2">
        {checks.map((c) => {
          const pal = STATUS_PALETTE[c.status];
          return (
            <div
              key={c.id}
              className="rounded-[6px] border bg-[#111216] px-4 py-3"
              style={{ borderColor: c.status === "pass" ? "rgba(255,255,255,0.06)" : pal.color + "33" }}
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
                  <span className="text-[13px] font-semibold text-white">{c.name}</span>
                </div>
                <span
                  className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold px-2 py-0.5 rounded shrink-0`}
                  style={{ color: pal.color, background: pal.bg }}
                >
                  {pal.label}
                </span>
              </div>
              <p className={`${MONO} mt-1.5 text-[11px] text-white/65 leading-relaxed pl-[18px]`}>
                {c.detail}
              </p>
              {c.remediation && (
                <p
                  className={`${MONO} mt-2 text-[11px] leading-relaxed pl-[18px] break-words`}
                  style={{ color: pal.color, opacity: 0.85 }}
                >
                  → {c.remediation}
                </p>
              )}
            </div>
          );
        })}
        {checks.length === 0 && (
          <div className={`${MONO} text-[11.5px] text-white/45 px-4 py-8 text-center`}>
            No checks to display.
          </div>
        )}
      </div>

      <p className={`${MONO} mt-6 text-[10.5px] text-white/35 leading-relaxed`}>
        These checks run server-side against the Next.js process every time you reload the page.
        Some infra (the LKE ft-runner, the Cloudflare Worker secrets) lives outside this process —
        cross-side checks (like &quot;Upstash same on both sides&quot;) show as warnings with a
        manual verification command rather than a green pass, because we can&apos;t reach the other
        side from here.
      </p>
    </PageCanvas>
  );
}
