"use client";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tables } from "@/lib/supabase/types";
import { GitProvider, Repository, PricingRates, instanceSizeConfigs } from "./new-types";

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="shrink-0 text-xs text-white/42">{label}</span>
      <div className="min-w-0 break-all text-right text-xs font-medium text-white/88">{value}</div>
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
  const hasAny = selectedProviderData || selectedRepoData || appName || selectedBranch || framework;

  const projectName =
    selectedProject && selectedProject !== "none"
      ? projects.find((p) => p.id === selectedProject)?.name ?? "Assigned"
      : null;

  return (
    <div className="sticky top-6 space-y-4">
      <Card className="glass-panel overflow-hidden">
        <CardHeader className="border-b border-white/[0.06] px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Summary</p>
          <CardTitle className="mt-1 text-base font-semibold text-white">Deployment Config</CardTitle>
        </CardHeader>

        <CardContent className="px-5 py-4">
          {hasAny ? (
            <div className="divide-y divide-white/[0.05]">
              {selectedProviderData && <SummaryRow label="Provider" value={selectedProviderData.name} />}
              {selectedRepoData && <SummaryRow label="Repository" value={selectedRepoData.name} />}
              {(selectedBranch || selectedRepoData?.defaultBranch) && (
                <SummaryRow label="Branch" value={selectedBranch || selectedRepoData?.defaultBranch} />
              )}
              {appName && <SummaryRow label="App name" value={appName} />}
              {framework && <SummaryRow label="Framework" value={framework} />}
              {projectName && <SummaryRow label="Project" value={projectName} />}
              <SummaryRow
                label="Instance"
                value={`${size.charAt(0).toUpperCase()}${size.slice(1)} / ${sizeConfig.cpu} / ${sizeConfig.ram}`}
              />
              <SummaryRow label="Auto deploy" value={autoDeploy ? "Enabled" : "Manual"} />
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-white/35">Complete the steps to see a summary here.</p>
          )}

          <Separator className="my-4 bg-white/[0.07]" />

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
        </CardContent>
      </Card>
    </div>
  );
}
