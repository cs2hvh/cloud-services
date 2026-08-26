"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  FlaskConical,
  Rocket,
  Layers,
  AlertTriangle,
} from "lucide-react";
import api from "@/lib/axios/axios";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@admin/components/page-header";
import { StatCard } from "@admin/components/stat-card";
import { STATUS } from "@admin/lib/chart-theme";

type Summary = {
  ftActive: number;
  ftFailed: number;
  ftSpend: number;
  depActive: number;
  depBuilding: number;
  depFailed: number;
  depStale: number;
  batchInFlight: number;
  batchStuck: number;
  batchFailed: number;
};

type FtRow = {
  id: string;
  org_label: string;
  name: string;
  base_model_id: string;
  method: string;
  status: string;
  gpu_sku: string | null;
  training_seconds: number | null;
  cost_cents: number | null;
  error_message: string | null;
  created_at: string;
};

type DepRow = {
  id: string;
  org_label: string;
  name: string;
  source: string;
  source_ref: string;
  gpu_sku: string;
  autoscale: { min_workers?: number; max_workers?: number } | null;
  status: string;
  last_metered_at: string | null;
  metering_stale: boolean;
  created_at: string;
};

type BatchRow = {
  id: string;
  org_label: string;
  endpoint: string;
  status: string;
  request_counts: { total?: number; completed?: number; failed?: number } | null;
  created_at: string;
  expires_at: string | null;
  stuck: boolean;
};

const TONE: Record<string, string> = {
  // shared across the three workload types; anything unknown renders neutral
  running: STATUS.good,
  active: STATUS.good,
  completed: STATUS.good,
  queued: STATUS.neutral,
  preparing: STATUS.warning,
  building: STATUS.warning,
  deploying: STATUS.warning,
  validating: STATUS.warning,
  in_progress: STATUS.warning,
  finalizing: STATUS.warning,
  cancelling: STATUS.warning,
  paused: STATUS.neutral,
  cancelled: STATUS.neutral,
  failed: STATUS.critical,
  expired: STATUS.critical,
};

function WorkloadStatus({ status, warn }: { status: string; warn?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2 py-0.5 text-xs capitalize">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: TONE[status] ?? STATUS.neutral }}
        />
        {status.replace(/_/g, " ")}
      </span>
      {warn && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
          <AlertTriangle className="h-3 w-3" /> {warn}
        </span>
      )}
    </span>
  );
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "—";
const duration = (seconds: number | null) => {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export function AiWorkloads() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [finetunes, setFinetunes] = useState<FtRow[]>([]);
  const [deployments, setDeployments] = useState<DepRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/ai/workloads");
      setSummary(res.data.summary ?? null);
      setFinetunes(res.data.finetunes ?? []);
      setDeployments(res.data.deployments ?? []);
      setBatches(res.data.batches ?? []);
    } catch {
      /* toasted by interceptor */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const s = summary;

  return (
    <div>
      <PageHeader
        title="GPU workloads"
        description="Fine-tune jobs, always-on deployments and batch runs across every org."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/ai">
                <ArrowLeft className="mr-2 h-3.5 w-3.5" /> AI Labs overview
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Fine-tunes in flight"
          value={s ? s.ftActive : "—"}
          icon={FlaskConical}
          hint={s ? `${s.ftFailed} failed · ${money(s.ftSpend)} total GPU spend` : undefined}
        />
        <StatCard
          label="Active deployments"
          value={s ? s.depActive : "—"}
          icon={Rocket}
          hint={s ? `${s.depBuilding} building · ${s.depFailed} failed` : undefined}
        />
        <StatCard
          label="Metering stale"
          value={s ? s.depStale : "—"}
          icon={AlertTriangle}
          tone={s && s.depStale > 0 ? "critical" : undefined}
          hint="active deployments with a quiet billing heartbeat"
        />
        <StatCard
          label="Batches in flight"
          value={s ? s.batchInFlight : "—"}
          icon={Layers}
          tone={s && s.batchStuck > 0 ? "warning" : undefined}
          hint={s ? `${s.batchStuck} stuck past window · ${s.batchFailed} failed/expired` : undefined}
        />
      </div>

      <Tabs defaultValue="finetunes" className="mt-4">
        <TabsList>
          <TabsTrigger value="finetunes">Fine-tuning</TabsTrigger>
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="finetunes">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>GPU</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && finetunes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      No fine-tune jobs yet.
                    </TableCell>
                  </TableRow>
                )}
                {finetunes.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {f.base_model_id}
                      </div>
                      {f.status === "failed" && f.error_message && (
                        <div className="mt-0.5 max-w-96 truncate text-xs text-red-400">
                          {f.error_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{f.org_label}</TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">
                      {f.method}
                    </TableCell>
                    <TableCell className="text-xs">{f.gpu_sku ?? "—"}</TableCell>
                    <TableCell>
                      <WorkloadStatus status={f.status} />
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {duration(f.training_seconds)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {f.cost_cents != null ? money(Number(f.cost_cents) / 100) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {when(f.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="deployments">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deployment</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>GPU</TableHead>
                  <TableHead>Autoscale</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last metered</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && deployments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      No deployments yet.
                    </TableCell>
                  </TableRow>
                )}
                {deployments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm font-medium">{d.name}</TableCell>
                    <TableCell className="text-sm">{d.org_label}</TableCell>
                    <TableCell>
                      <div className="text-xs">{d.source}</div>
                      <div className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                        {d.source_ref}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{d.gpu_sku}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.autoscale
                        ? `${d.autoscale.min_workers ?? 0}–${d.autoscale.max_workers ?? "?"} workers`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <WorkloadStatus
                        status={d.status}
                        warn={d.metering_stale ? "metering stale" : undefined}
                      />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {when(d.last_metered_at)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {when(d.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="batches">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && batches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      No batches yet.
                    </TableCell>
                  </TableRow>
                )}
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.id}</TableCell>
                    <TableCell className="text-sm">{b.org_label}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {b.endpoint}
                    </TableCell>
                    <TableCell>
                      <WorkloadStatus
                        status={b.status}
                        warn={b.stuck ? "stuck past window" : undefined}
                      />
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {b.request_counts
                        ? `${b.request_counts.completed ?? 0}/${b.request_counts.total ?? 0}${
                            b.request_counts.failed ? ` · ${b.request_counts.failed} failed` : ""
                          }`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {when(b.created_at)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {when(b.expires_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
