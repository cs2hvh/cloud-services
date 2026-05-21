"use client";

import { Loader2 } from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { EnvVar } from "./env-vars-editor";
import { instanceSizeConfigs, PricingRates, Repository } from "./new-types";

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

interface Props {
  projects: Tables<"projects">[];
  pricing?: Record<string, PricingRates>;
  selectedProject: string;
  appName: string;
  selectedRepoData: Repository | undefined;
  selectedBranch: string;
  framework: string;
  size: string;
  autoDeploy: boolean;
  envVars: EnvVar[];
  containerPort?: number;
  isLoading: boolean;
  onPrev: () => void;
  onSubmit: () => void;
}

export function StepReview({
  projects, pricing, selectedProject, appName, selectedRepoData,
  selectedBranch, framework, size, autoDeploy, envVars, containerPort,
  isLoading, onPrev, onSubmit,
}: Props) {
  const sizeConfig = instanceSizeConfigs[size as keyof typeof instanceSizeConfigs];
  const sizePrice = pricing?.[size];
  const projectName =
    selectedProject && selectedProject !== "none"
      ? projects.find((p) => p.id === selectedProject)?.name ?? "Unknown"
      : "No project";

  const hostname = `${appName || "your-app"}.galaxyhvh.com`;

  return (
    <section className="border border-white/[0.06] bg-[#111216]">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-5">
        <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
          04 · Deploy
        </p>
        <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-white">
          Review & deploy
        </h2>
        <p className="mt-1 text-[12.5px] text-white/50">
          Confirm your configuration — your app will be live in under 30 seconds.
        </p>
      </header>

      <div className="px-6 py-6 space-y-5">
        {/* ── URL preview ──────────────────────────────────── */}
        <div className="flex items-center gap-3 border border-white/[0.06] bg-[#0d0e11] px-4 py-3.5">
          <span
            className="h-2 w-2 rounded-full shrink-0 animate-pulse"
            style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
          />
          <div className={`${MONO} flex-1 text-[13px] truncate`}>
            <span style={{ color: ACCENT }}>https://</span>
            <span className="text-white">{appName || "your-app"}</span>
            <span className="text-white/45">.galaxyhvh.com</span>
          </div>
          <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-emerald-300/85`}>
            Reserved
          </span>
        </div>

        {/* ── Review grid ──────────────────────────────────── */}
        <div className="border border-white/[0.06] bg-[#0d0e11]">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <ReviewCell
              label="Source"
              value={
                <span>
                  GitHub
                  {selectedRepoData?.fullName?.split("/")[0] && (
                    <span className={`${MONO} ml-1.5 text-[11px] text-white/45`}>
                      @{selectedRepoData.fullName.split("/")[0]}
                    </span>
                  )}
                </span>
              }
              borderRight borderBottom
            />
            <ReviewCell
              label="Repository"
              value={<span className={`${MONO} text-[12.5px]`}>{selectedRepoData?.fullName ?? "—"}</span>}
              borderBottom
            />
            <ReviewCell
              label="Branch"
              value={
                <span>
                  <span className={`${MONO} text-[12.5px]`}>{selectedBranch || "main"}</span>
                  {autoDeploy && (
                    <span className={`${MONO} ml-1.5 text-[11px] text-white/45`}>auto-deploy</span>
                  )}
                </span>
              }
              borderRight borderBottom
            />
            <ReviewCell
              label="Framework"
              value={framework || "—"}
              borderBottom
            />
            <ReviewCell
              label="Project"
              value={projectName}
              borderRight borderBottom
            />
            <ReviewCell
              label="Instance"
              value={
                <span>
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                  {sizeConfig && (
                    <span className={`${MONO} ml-1.5 text-[11px] text-white/45`}>
                      {sizeConfig.cpu} vCPU · {sizeConfig.ram}
                    </span>
                  )}
                </span>
              }
              borderBottom
            />
            {containerPort !== undefined && (
              <ReviewCell
                label="App port"
                value={<span className={`${MONO} text-[12.5px]`}>{containerPort}</span>}
                borderRight borderBottom
              />
            )}
            <ReviewCell
              label="Env variables"
              value={
                <span>
                  {envVars.length > 0 ? `${envVars.length} set` : "None"}
                  {envVars.length > 0 && (
                    <span className={`${MONO} ml-1.5 text-[11px] text-white/45`}>encrypted</span>
                  )}
                </span>
              }
              borderBottom={containerPort !== undefined}
            />
            {containerPort === undefined && (
              <ReviewCell
                label="Estimated cost"
                value={
                  sizePrice?.price && sizePrice.price > 0 ? (
                    <span style={SERIF_STYLE} className="text-[16px] font-bold tabular-nums">
                      ${sizePrice.price.toFixed(2)}
                      <span className={`${MONO} ml-1 text-[10.5px] font-normal text-white/45`}>/mo</span>
                    </span>
                  ) : (
                    <span className="text-emerald-300/85">Free</span>
                  )
                }
                borderRight={false}
              />
            )}
            {containerPort !== undefined && (
              <ReviewCell
                label="Estimated cost"
                value={
                  sizePrice?.price && sizePrice.price > 0 ? (
                    <span style={SERIF_STYLE} className="text-[16px] font-bold tabular-nums">
                      ${sizePrice.price.toFixed(2)}
                      <span className={`${MONO} ml-1 text-[10.5px] font-normal text-white/45`}>/mo</span>
                    </span>
                  ) : (
                    <span className="text-emerald-300/85">Free</span>
                  )
                }
              />
            )}
          </div>
        </div>

        {/* ── Env vars preview ─────────────────────────────── */}
        {envVars.length > 0 && (
          <div className="border border-white/[0.06] bg-[#0d0e11] p-4">
            <p className={`${MONO} mb-3 text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
              Environment variables ({envVars.length})
            </p>
            <div className="space-y-1.5">
              {envVars.map((ev, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <code className={`${MONO} text-[12px]`} style={{ color: ACCENT }}>{ev.key}</code>
                  <span className={`${MONO} text-[11.5px] text-white/40`}>
                    {ev.value ? "••••••••" : "not set"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Deploy CTA ───────────────────────────────────── */}
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className={`${MONO} group w-full inline-flex items-center justify-center gap-2.5 py-4 text-[12.5px] uppercase tracking-[0.18em] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 relative overflow-hidden`}
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
            color: "#ffffff",
            boxShadow:
              "0 12px 32px rgba(0,149,255,0.30), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
          onMouseEnter={(e) => {
            if (isLoading) return;
            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow =
              "0 16px 40px rgba(0,149,255,0.40), inset 0 1px 0 rgba(255,255,255,0.2)";
          }}
          onMouseLeave={(e) => {
            if (isLoading) return;
            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
            e.currentTarget.style.transform = "none";
            e.currentTarget.style.boxShadow =
              "0 12px 32px rgba(0,149,255,0.30), inset 0 1px 0 rgba(255,255,255,0.15)";
          }}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Deploying…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Deploy {appName || "application"}
              <span aria-hidden>→</span>
            </>
          )}
        </button>

        <p className={`${MONO} text-center text-[10.5px] text-white/35 tracking-[0.06em]`}>
          Billing activates on first successful build
          <span className="mx-1.5 opacity-50">·</span>
          Free tier covers small instances
        </p>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={isLoading}
          className={`${MONO} h-9 px-3.5 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50`}
        >
          ← Back to configuration
        </button>
        <div className={`${MONO} text-[10.5px] text-white/50`}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle" />
          {hostname.length > 0 ? "All checks passed" : "Awaiting input"}
        </div>
      </footer>
    </section>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────

function ReviewCell({
  label,
  value,
  borderRight,
  borderBottom,
}: {
  label: string;
  value: React.ReactNode;
  borderRight?: boolean;
  borderBottom?: boolean;
}) {
  return (
    <div
      className={`p-4 ${
        borderBottom ? "border-b border-white/[0.06]" : ""
      } ${borderRight ? "sm:border-r sm:border-white/[0.06]" : ""}`}
    >
      <div className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35 mb-1.5`}>
        {label}
      </div>
      <div className="text-[13px] font-medium text-white truncate">{value}</div>
    </div>
  );
}
