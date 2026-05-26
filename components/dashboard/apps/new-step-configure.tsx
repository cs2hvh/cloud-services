"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnvVarsEditor, EnvVar } from "./env-vars-editor";
import { Tables } from "@/lib/supabase/types";
import { frameworkConfigs, instanceSizeConfigs, PricingRates, Repository, Branch } from "./new-types";

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const BORDER_ACCENT = "rgba(0,149,255,0.4)";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

// Maps framework key to a short letter + accent for the auto-detect card.
function frameworkBadge(name: string): { letter: string; color: string } {
  const n = name.toLowerCase();
  if (n.includes("next")) return { letter: "▲", color: "#ffffff" };
  if (n.includes("nuxt")) return { letter: "N", color: "#00DC82" };
  if (n.includes("vite")) return { letter: "V", color: "#646cff" };
  if (n.includes("vue")) return { letter: "V", color: "#41b883" };
  if (n.includes("svelte")) return { letter: "S", color: "#ff3e00" };
  if (n.includes("angular")) return { letter: "A", color: "#dd0031" };
  if (n.includes("react")) return { letter: "R", color: "#61dafb" };
  if (n.includes("express")) return { letter: "E", color: "#a1a1aa" };
  if (n.includes("node")) return { letter: "N", color: "#5fa04e" };
  if (n.includes("django")) return { letter: "D", color: "#0c4b33" };
  if (n.includes("flask")) return { letter: "F", color: "#a1a1aa" };
  if (n.includes("fastapi")) return { letter: "F", color: "#009688" };
  if (n.includes("python")) return { letter: "P", color: "#3776ab" };
  if (n.includes("java")) return { letter: "J", color: "#b07219" };
  if (n.includes("docker")) return { letter: "D", color: "#0db7ed" };
  return { letter: name.charAt(0).toUpperCase() || "•", color: "#a1a1aa" };
}

interface Props {
  projects: Tables<"projects">[];
  pricing?: Record<string, PricingRates>;
  selectedProject: string;
  onSelectProject: (v: string) => void;
  appName: string;
  onAppNameChange: (v: string) => void;
  selectedBranch: string;
  onSelectBranch: (v: string) => void;
  branches: Branch[];
  loadingBranches: boolean;
  framework: string;
  onFrameworkChange: (v: string) => void;
  detectingFramework: boolean;
  hasDockerfile: boolean;
  containerPort: number | undefined;
  onContainerPortChange: (v: number | undefined) => void;
  detectedPort: number | undefined;
  healthcheckPath: string;
  onHealthcheckPathChange: (v: string) => void;
  size: string;
  onSizeChange: (v: string) => void;
  autoDeploy: boolean;
  onAutoDeployChange: (v: boolean) => void;
  envVars: EnvVar[];
  onEnvVarsChange: (v: EnvVar[]) => void;
  selectedRepoData: Repository | undefined;
  selectedProvider: string;
  onDetectFramework: () => void;
  onRefreshBranches: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function StepConfigure({
  projects, pricing, selectedProject, onSelectProject,
  appName, onAppNameChange, selectedBranch, onSelectBranch,
  branches, loadingBranches, framework, onFrameworkChange,
  detectingFramework, hasDockerfile, containerPort, onContainerPortChange,
  detectedPort, healthcheckPath, onHealthcheckPathChange,
  size, onSizeChange, autoDeploy, onAutoDeployChange,
  envVars, onEnvVarsChange, selectedRepoData, onDetectFramework,
  onRefreshBranches, onPrev, onNext,
}: Props) {
  const selectedFrameworkConfig = framework ? frameworkConfigs[framework] : undefined;
  const showPortInput = hasDockerfile || framework === "Dockerfile" || framework === "Java";
  const badge = framework ? frameworkBadge(framework) : null;

  return (
    <section className="border border-white/[0.06] bg-[#111216]">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-5">
        <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
          03 · Configure
        </p>
        <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-white">
          Configure your build
        </h2>
        <p className="mt-1 text-[12.5px] text-white/50">
          We detected your framework automatically. Most defaults work out of the box.
        </p>
      </header>

      <div className="px-6 py-5 space-y-5">
        {/* ── Framework auto-detect card ─────────────────────── */}
        {badge && selectedFrameworkConfig && (
          <div
            className="relative border px-3 py-2.5 flex items-center gap-3"
            style={{
              borderColor: BORDER_ACCENT,
              background: "linear-gradient(135deg, #0d0e11 0%, rgba(0,149,255,0.06) 100%)",
              boxShadow: `0 0 0 1px ${ACCENT}, 0 6px 20px rgba(0,149,255,0.08)`,
            }}
          >
            <span
              className={`${MONO} h-7 w-7 shrink-0 flex items-center justify-center text-[14px] font-bold border border-white/[0.08] bg-[#0d0e11]`}
              style={{ color: badge.color }}
            >
              {badge.letter}
            </span>
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <span className="text-[13px] font-semibold text-white truncate">{framework}</span>
              <span
                className={`${MONO} shrink-0 text-[8.5px] uppercase tracking-[0.14em] font-semibold px-1.5 py-px`}
                style={{ background: ACCENT, color: "#001930" }}
              >
                {hasDockerfile ? "Dockerfile" : "Detected"}
              </span>
              <span className={`${MONO} hidden lg:inline text-[10.5px] text-white/45 truncate`}>
                · {selectedFrameworkConfig.description}
              </span>
            </div>
            {detectingFramework ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white/60 shrink-0" />
            ) : (
              <button
                type="button"
                onClick={onDetectFramework}
                className={`${MONO} shrink-0 text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors`}
                style={{ color: ACCENT }}
                onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT_BRIGHT; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = ACCENT; }}
              >
                Re-detect →
              </button>
            )}
          </div>
        )}

        {/* ── Project section ───────────────────────────────── */}
        <FormSection
          title="Project"
          opt={appName ? "required" : "required"}
        >
          <FieldRow>
            <Field label="App name" hint="slug">
              <Input
                value={appName}
                onChange={(e) => onAppNameChange(e.target.value)}
                placeholder="my-awesome-app"
                mono
              />
            </Field>
            <Field label="Project association">
              <Select value={selectedProject} onValueChange={onSelectProject}>
                <SelectTrigger className="h-9 border-white/[0.08] bg-[#0d0e11] text-[12.5px] text-white focus-visible:ring-0 focus-visible:border-white/25">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldRow>

          <FieldRow>
            <Field label="Deploy branch">
              {loadingBranches ? (
                <div className={`${MONO} h-9 flex items-center gap-2 px-3 border border-white/[0.08] bg-[#0d0e11] text-[12px] text-white/40`}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading branches…
                </div>
              ) : branches.length > 0 ? (
                <Select value={selectedBranch} onValueChange={onSelectBranch}>
                  <SelectTrigger className={`${MONO} h-9 border-white/[0.08] bg-[#0d0e11] text-[12px] text-white focus-visible:ring-0 focus-visible:border-white/25`}>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                    {branches.map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.protected ? `${b.name} (protected)` : b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={selectedBranch}
                  onChange={(e) => onSelectBranch(e.target.value)}
                  placeholder="main"
                  mono
                />
              )}
            </Field>
            <Field label="Auto-deploy" hint="on git push">
              <button
                type="button"
                onClick={() => onAutoDeployChange(!autoDeploy)}
                className="h-9 px-3 inline-flex items-center justify-between border border-white/[0.08] bg-[#0d0e11] text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="text-[13px] text-white">
                  {autoDeploy ? "Enabled" : "Manual only"}
                </span>
                <span
                  className="ml-auto inline-flex items-center w-9 h-5 px-0.5 transition-colors"
                  style={{ background: autoDeploy ? ACCENT : "rgba(255,255,255,0.1)" }}
                >
                  <span
                    className="h-4 w-4 bg-white transition-transform"
                    style={{ transform: autoDeploy ? "translateX(16px)" : "translateX(0)" }}
                  />
                </span>
              </button>
            </Field>
          </FieldRow>
        </FormSection>

        {/* ── Build profile ────────────────────────────────── */}
        <FormSection
          title="Build profile"
          opt="framework & runtime"
        >
          <FieldRow single>
            <Field label="Framework or pipeline">
              <div className="flex gap-2">
                <Select value={framework} onValueChange={onFrameworkChange}>
                  <SelectTrigger className="flex-1 h-9 border-white/[0.08] bg-[#0d0e11] text-[12.5px] text-white focus-visible:ring-0 focus-visible:border-white/25">
                    <SelectValue placeholder="Select framework" />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.1] bg-[#111216] text-white">
                    <SelectItem value="simple-test">Simple test (no build)</SelectItem>
                    <SelectItem value="Java">Java (Maven / Dockerfile)</SelectItem>
                    <SelectItem value="Dockerfile">Dockerfile (existing)</SelectItem>
                    <SelectItem value="Next.js">Next.js</SelectItem>
                    <SelectItem value="Nuxt.js">Nuxt.js</SelectItem>
                    <SelectItem value="Vite-React">React + Vite</SelectItem>
                    <SelectItem value="Vue.js">Vue.js</SelectItem>
                    <SelectItem value="Angular">Angular</SelectItem>
                    <SelectItem value="SvelteKit">SvelteKit</SelectItem>
                    <SelectItem value="express">Express.js</SelectItem>
                    <SelectItem value="Node.js">Node.js (bring Dockerfile)</SelectItem>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="django">Django</SelectItem>
                    <SelectItem value="flask">Flask</SelectItem>
                    <SelectItem value="fastapi">FastAPI</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={onRefreshBranches}
                  disabled={loadingBranches || !selectedRepoData}
                  className={`${MONO} h-10 px-3 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.03] transition-colors disabled:opacity-50`}
                >
                  {loadingBranches ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
                </button>
              </div>
            </Field>
          </FieldRow>

          {selectedFrameworkConfig && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {selectedFrameworkConfig.installCommand && (
                <CmdCard label="Install" cmd={selectedFrameworkConfig.installCommand} />
              )}
              <CmdCard
                label={hasDockerfile ? "Default build" : "Build"}
                cmd={selectedFrameworkConfig.buildCommand || "—"}
              />
              <CmdCard
                label={hasDockerfile ? "Default output" : "Output"}
                cmd={selectedFrameworkConfig.outputDir || "."}
              />
            </div>
          )}

          {showPortInput && (
            <div className="mt-3 border border-white/[0.06] bg-[#0d0e11] p-3.5">
              <Field label="Application port" hint={detectedPort ? `detected: ${detectedPort}` : "set manually"}>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={containerPort ?? ""}
                  onChange={(e) =>
                    onContainerPortChange(e.target.value ? parseInt(e.target.value, 10) : undefined)
                  }
                  placeholder={detectedPort ? String(detectedPort) : "3000"}
                  mono
                />
              </Field>
              {detectedPort && (
                <p className={`${MONO} mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-300/85`}>
                  <CheckCircle2 className="h-3 w-3" />
                  EXPOSE {detectedPort}
                </p>
              )}
              {!detectedPort && containerPort === undefined && (
                <p className={`${MONO} mt-2 text-[11px] text-amber-300/85`}>
                  Port not auto-detected — confirm before deploying.
                </p>
              )}
            </div>
          )}

          <div className="mt-3 border border-white/[0.06] bg-[#0d0e11] p-3.5">
            <Field label="Health check path" hint="optional · HTTP GET">
              <Input
                value={healthcheckPath}
                onChange={(e) => onHealthcheckPathChange(e.target.value)}
                placeholder="/health"
                mono
              />
            </Field>
            <p className={`${MONO} mt-2 text-[11px] text-white/35`}>
              The platform will probe this endpoint to confirm the app is live before routing traffic.
            </p>
          </div>
        </FormSection>

        {/* ── Instance size ────────────────────────────────── */}
        <FormSection title="Instance size">
          <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-5 gap-2">
            {(["small", "medium", "large", "xlarge", "xxlarge"] as const).map((opt) => {
              const cfg = instanceSizeConfigs[opt];
              const sizePrice = pricing?.[opt];
              const selected = size === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onSizeChange(opt)}
                  className="border px-3 py-2.5 text-left transition-all flex items-center justify-between gap-3"
                  style={
                    selected
                      ? { borderColor: BORDER_ACCENT, background: ACCENT_DIM, boxShadow: `0 0 0 1px ${BORDER_ACCENT}` }
                      : { borderColor: "rgba(255,255,255,0.06)", background: "#0d0e11" }
                  }
                  onMouseEnter={(e) => {
                    if (selected) return;
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  }}
                  onMouseLeave={(e) => {
                    if (selected) return;
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-white capitalize">{opt}</div>
                    <div className={`${MONO} mt-0.5 text-[10px] text-white/45 truncate`}>
                      {cfg.cpu} vCPU · {cfg.ram} · {cfg.replicas} inst
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {sizePrice?.price && sizePrice.price > 0 ? (
                      <div className="flex items-baseline justify-end gap-1">
                        <span
                          style={SERIF_STYLE}
                          className="text-[16px] leading-none text-white font-bold tabular-nums"
                        >
                          ${sizePrice.price.toFixed(0)}
                        </span>
                        <span className={`${MONO} text-[9.5px] text-white/35`}>/mo</span>
                      </div>
                    ) : (
                      <span style={SERIF_STYLE} className="text-[16px] leading-none text-emerald-300 font-bold">
                        Free
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </FormSection>

        {/* ── Environment variables ───────────────────────── */}
        <FormSection
          title="Environment variables"
          opt="optional · encrypted at rest"
        >
          <div className="border border-white/[0.06] bg-[#0d0e11] p-2.5">
            <EnvVarsEditor value={envVars} onChange={onEnvVarsChange} />
          </div>
        </FormSection>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4">
        <button
          type="button"
          onClick={onPrev}
          className={`${MONO} h-9 px-3.5 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors`}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold transition-all`}
          style={{ background: ACCENT, color: "#001930", boxShadow: "0 6px 18px rgba(0,149,255,0.15)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT_BRIGHT; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
        >
          Review deployment
          <span aria-hidden>→</span>
        </button>
      </footer>
    </section>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────

function FormSection({
  title,
  opt,
  children,
}: {
  title: string;
  opt?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[12.5px] font-semibold text-white">{title}</h3>
        {opt && (
          <span className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/35`}>
            · {opt}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function FieldRow({
  children,
  single,
}: {
  children: React.ReactNode;
  single?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${single ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/45`}>
          {label}
        </span>
        {hint && (
          <span className={`${MONO} text-[9.5px] text-white/30`}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  const { mono, className, ...rest } = props;
  return (
    <input
      {...rest}
      className={`h-9 w-full px-3 border border-white/[0.08] bg-[#0d0e11] text-[12.5px] text-white placeholder:text-white/30 outline-none focus:border-white/25 ${
        mono ? MONO + " text-[12px]" : ""
      } ${className ?? ""}`}
    />
  );
}

function CmdCard({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div className="border border-white/[0.06] bg-[#0d0e11] px-2.5 py-1.5">
      <div className={`${MONO} text-[9px] uppercase tracking-[0.14em] text-white/35`}>
        {label}
      </div>
      <code className={`${MONO} mt-0.5 block break-all text-[10.5px] text-white/80 leading-snug`}>
        {cmd}
      </code>
    </div>
  );
}
