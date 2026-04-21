"use client";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tables } from "@/lib/supabase/types";
import { GitProvider, Repository, PricingRates, instanceSizeConfigs } from "./new-types";

function SummaryRow({ label, value, icon, empty }: { label: string; value: React.ReactNode; icon?: string; empty?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-2">
        {icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" width={14} height={14} className={`h-3.5 w-3.5 shrink-0 object-contain ${empty ? "opacity-20" : "opacity-50"}`} />
        )}
        <span className={`text-sm ${empty ? "text-white/28" : "text-white/42"}`}>{label}</span>
      </div>
      <span className={`text-right text-sm ${empty ? "text-white/20" : "font-medium text-white/88"}`}>{value}</span>
    </div>
  );
}

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
}

export function SummarySidebar({
  projects, pricing, selectedProviderData, selectedRepoData,
  selectedBranch, appName, framework, selectedProject, size, autoDeploy,
}: Props) {
  const sizeConfig = instanceSizeConfigs[size as keyof typeof instanceSizeConfigs] ?? instanceSizeConfigs.small;
  const sizePrice = pricing?.[size];
  const projectName =
    selectedProject && selectedProject !== "none"
      ? projects.find((p) => p.id === selectedProject)?.name ?? "Assigned"
      : null;

  return (
    <div className="glass-panel overflow-hidden lg:sticky lg:top-8">
      <div className="border-b border-white/[0.06] px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Summary</p>
        <h3 className="mt-2 text-lg font-semibold text-white">Configuration</h3>
      </div>

      <div className="px-6 py-4">
          <div className="space-y-0.5">
            <SummaryRow icon="/dashboard icons/provider .png" label="Git provider" value={selectedProviderData?.name ?? "—"} empty={!selectedProviderData} />
            <SummaryRow icon="/dashboard icons/repository.png" label="Repository" value={selectedRepoData?.name ?? "—"} empty={!selectedRepoData} />
            <SummaryRow label="Branch" value={(selectedBranch || selectedRepoData?.defaultBranch) ?? "—"} empty={!(selectedBranch || selectedRepoData?.defaultBranch)} />
            <SummaryRow icon="/dashboard icons/name.png" label="App name" value={appName || "—"} empty={!appName} />
            <SummaryRow icon="/dashboard icons/apptype .png" label="Framework" value={framework || "—"} empty={!framework} />
          </div>

          <div className="my-3 border-t border-white/[0.05]" />

          <div className="space-y-0.5">
            <SummaryRow icon="/dashboard icons/plan _1.png" label="Instance" value={`${size.charAt(0).toUpperCase()}${size.slice(1)} / ${sizeConfig.cpu} CPU / ${sizeConfig.ram} RAM`} />
            <SummaryRow label="Auto deploy" value={autoDeploy ? "Enabled" : "Manual only"} />
            {projectName && (
              <SummaryRow icon="/dashboard icons/project _1.png" label="Project" value={projectName} />
            )}
          </div>

          <Separator className="my-4 bg-white/[0.08]" />

          <div className="border border-blue-400/20 bg-blue-500/10 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200/75">Estimated cost</p>
            {sizePrice?.price && sizePrice.price > 0 ? (
              <>
                <div className="mt-2 text-2xl font-semibold text-white">
                  ${sizePrice.price.toFixed(2)}
                  <span className="ml-1 text-sm font-normal text-white/45">/mo</span>
                </div>
                <p className="mt-1 text-xs text-white/50">
                  {sizePrice.hourlyRate > 0 ? `$${sizePrice.hourlyRate.toFixed(4)}/hour` : "Billed hourly on usage."}
                </p>
                {(sizePrice.initialCost ?? 0) > 0 && (
                  <p className="mt-1.5 text-xs text-white/45">+ ${sizePrice.initialCost.toFixed(2)} one-time setup</p>
                )}
              </>
            ) : (
              <>
                <div className="mt-2 text-2xl font-semibold text-emerald-300">Free</div>
                <p className="mt-1 text-xs text-white/45">Included in current platform profile.</p>
              </>
            )}
          </div>
        </div>
      </div>
  );
}
