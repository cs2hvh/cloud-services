"use client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tables } from "@/lib/supabase/types";
import { EnvVar } from "./env-vars-editor";
import { instanceSizeConfigs, PricingRates, Repository } from "./new-types";

interface ReviewRow {
  label: string;
  value: React.ReactNode;
}

function Row({ label, value }: ReviewRow) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.05] last:border-0">
      <span className="shrink-0 text-sm text-white/50">{label}</span>
      <span className="min-w-0 break-all text-right text-sm font-medium text-white">{value}</span>
    </div>
  );
}

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
  isLoading: boolean;
  onPrev: () => void;
  onSubmit: () => void;
}

export function StepReview({
  projects, pricing, selectedProject, appName, selectedRepoData,
  selectedBranch, framework, size, autoDeploy, envVars, isLoading, onPrev, onSubmit,
}: Props) {
  const sizeConfig = instanceSizeConfigs[size as keyof typeof instanceSizeConfigs];
  const sizePrice = pricing?.[size];
  const projectName =
    selectedProject && selectedProject !== "none"
      ? projects.find((p) => p.id === selectedProject)?.name ?? "Unknown"
      : "No project";

  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="border-b border-white/[0.06] px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Step 4 — Review</p>
        <CardTitle className="mt-1 text-lg font-semibold text-white">Review &amp; Deploy</CardTitle>
        <p className="mt-1 text-sm text-white/48">Confirm your deployment settings before provisioning begins.</p>
      </CardHeader>

      <CardContent className="px-6 py-6 space-y-6">
        <div className="border border-white/[0.08] bg-white/[0.03] p-5">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Deployment Summary</p>
          <Row label="Project" value={projectName} />
          <Row label="Application name" value={appName} />
          <Row label="Repository" value={selectedRepoData?.fullName ?? "—"} />
          <Row label="Branch" value={selectedBranch} />
          <Row label="Framework" value={framework} />
          <Row
            label="Instance"
            value={sizeConfig ? `${size.charAt(0).toUpperCase()}${size.slice(1)} — ${sizeConfig.cpu} CPU / ${sizeConfig.ram} RAM` : size}
          />
          <Row
            label="Estimated cost"
            value={sizePrice?.price && sizePrice.price > 0 ? `$${sizePrice.price.toFixed(2)}/mo` : "Free"}
          />
          <Row label="Auto-deploy" value={<span className={autoDeploy ? "text-emerald-400" : "text-white/55"}>{autoDeploy ? "Enabled" : "Disabled"}</span>} />
          <Row label="Platform URL" value={<span className="font-mono text-blue-400">{appName || "your-app"}.galaxyhvh.com</span>} />
        </div>

        {envVars.length > 0 && (
          <div className="border border-white/[0.08] bg-white/[0.03] p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Environment Variables ({envVars.length})</p>
            <div className="space-y-1.5">
              {envVars.map((ev, i) => (
                <div key={i} className="flex items-center justify-between gap-4 text-sm">
                  <code className="text-blue-300">{ev.key}</code>
                  <span className="text-white/45">{ev.value ? "••••••" : "not set"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator className="bg-white/[0.07]" />

        <div className="border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-200/80">
            Deployment will begin immediately after clicking <strong>Deploy Application</strong>. Billing activates on the first successful build.
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between border-t border-white/[0.06] px-6 py-4">
        <Button variant="outline" onClick={onPrev} disabled={isLoading} className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/75 hover:bg-white/[0.07]">Back</Button>
        <Button onClick={onSubmit} disabled={isLoading} className="cursor-pointer rounded-md bg-white text-black hover:bg-white/90">
          {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deploying...</> : "Deploy Application"}
        </Button>
      </CardFooter>
    </Card>
  );
}
