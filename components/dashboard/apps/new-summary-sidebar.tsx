"use client";

import { Tables } from "@/lib/supabase/types";
import { GitProvider, Repository, PricingRates, instanceSizeConfigs } from "./new-types";

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

interface Props {
  projects: Tables<"projects">[];
  pricing?: Record<string, PricingRates>;
  selectedProviderData: GitProvider | undefined;
  selectedRepoData: Repository | undefined;
  selectedBranch: string;
  appName: string;
  framework: string;
  selectedProject: string;
  size: string;
  autoDeploy: boolean;
  containerPort?: number;
}

export function SummarySidebar({
  projects, pricing, selectedProviderData, selectedRepoData,
  selectedBranch, appName, framework, selectedProject, size, autoDeploy, containerPort,
}: Props) {
  const sizeConfig = instanceSizeConfigs[size as keyof typeof instanceSizeConfigs] ?? instanceSizeConfigs.small;
  const sizePrice = pricing?.[size];
  const projectName =
    selectedProject && selectedProject !== "none"
      ? projects.find((p) => p.id === selectedProject)?.name ?? "Assigned"
      : null;

  const isDraft = !selectedRepoData || !appName || !framework;

  return (
    <aside className="border border-white/[0.06] bg-[#0d0e11] xl:sticky xl:top-6 xl:self-start">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div className="min-w-0">
          <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35`}>
            Configuration
          </p>
          <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-white">
            Your{" "}
            <span style={SERIF_STYLE} className="text-white/55 font-normal">
              deployment
            </span>
          </h3>
        </div>
        <span
          className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold`}
          style={{ color: isDraft ? ACCENT : "#34d399" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: isDraft ? ACCENT : "#34d399",
              boxShadow: isDraft ? `0 0 6px ${ACCENT}` : "0 0 6px #34d399",
            }}
          />
          {isDraft ? "Draft" : "Ready"}
        </span>
      </header>

      {/* Detail rows */}
      <div className="px-5 py-3">
        <SumRow label="Provider" value={selectedProviderData?.name} />
        <SumRow
          label="Repository"
          value={selectedRepoData?.name}
          mono
        />
        <SumRow
          label="Branch"
          value={selectedBranch || selectedRepoData?.defaultBranch}
          mono
        />
        <SumRow label="Framework" value={framework} />
        <SumRow label="App name" value={appName} mono />
        {containerPort !== undefined && (
          <SumRow label="Port" value={String(containerPort)} mono />
        )}
        <SumRow
          label="Instance"
          value={`${size.charAt(0).toUpperCase()}${size.slice(1)} · ${sizeConfig.cpu} vCPU · ${sizeConfig.ram}`}
        />
        <SumRow label="Auto deploy" value={autoDeploy ? "Enabled" : "Manual"} />
        {projectName && <SumRow label="Project" value={projectName} />}
      </div>

      {/* Cost block */}
      <div className="border-t border-white/[0.06] bg-[#08090b] px-5 py-4">
        <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35 mb-2`}>
          Estimated cost
        </p>
        {sizePrice?.price && sizePrice.price > 0 ? (
          <>
            <div className="flex items-baseline gap-1">
              <span style={SERIF_STYLE} className="text-[18px] text-white/55 font-medium">$</span>
              <span style={SERIF_STYLE} className="text-[34px] leading-none text-white font-bold tracking-[-0.03em] tabular-nums">
                {sizePrice.price.toFixed(2)}
              </span>
              <span className={`${MONO} ml-1.5 text-[11px] text-white/45`}>/mo</span>
            </div>
            <p className={`${MONO} mt-2 text-[10.5px] text-white/45`}>
              {sizePrice.hourlyRate > 0
                ? `$${sizePrice.hourlyRate.toFixed(4)}/hr · billed by usage`
                : "Billed hourly on usage"}
            </p>
            {(sizePrice.initialCost ?? 0) > 0 && (
              <p className={`${MONO} mt-1 text-[10.5px] text-white/40`}>
                + ${sizePrice.initialCost.toFixed(2)} one-time setup
              </p>
            )}
          </>
        ) : (
          <>
            <span style={SERIF_STYLE} className="text-[28px] leading-none text-emerald-300 font-bold">
              Free
            </span>
            <p className={`${MONO} mt-2 text-[10.5px] text-white/45`}>
              Included in current platform profile
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────

function SumRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  const empty = !value;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-white/[0.06] last:border-b-0">
      <span className={`${MONO} text-[10.5px] uppercase tracking-[0.04em] text-white/40`}>
        {label}
      </span>
      <span
        className={`text-[11.5px] text-right truncate max-w-[180px] ${mono ? MONO : ""} ${
          empty ? "text-white/25 italic" : "text-white/85"
        }`}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}
