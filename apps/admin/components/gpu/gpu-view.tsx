"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Cpu,
  DollarSign,
  AlertTriangle,
  Search,
  RefreshCw,
  Power,
  Loader2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@admin/components/stat-card";
import {
  Callout,
  FindingRow,
  StatusChip,
  Table,
  money,
} from "@admin/components/deploy/bits";
import type {
  GpuCatalogRow,
  GpuFinding,
  GpuInventoryRow,
  GpuMeter,
  GpuPod,
  GpuPodEvent,
  GpuQuotePricingRow,
  GpuTemplateRow,
  GpuVolume,
} from "@admin/lib/gpu";

interface Props {
  pods: GpuPod[];
  volumes: GpuVolume[];
  events: GpuPodEvent[];
  catalog: GpuCatalogRow[];
  templates: GpuTemplateRow[];
  quotePricing: GpuQuotePricingRow[];
  chargeMarkup: number | null;
  inventory: GpuInventoryRow[];
  meters: GpuMeter[];
  findings: GpuFinding[];
  walletOwners: string[];
  deployEnabled: boolean;
}

const age = (iso: string) => {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
};

export function GpuView(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const catalogName = useMemo(
    () => new Map(props.catalog.map((c) => [c.id, c.display_name])),
    [props.catalog],
  );
  // Keyed by type:serviceId — a pod is fully billed only when BOTH its
  // gpu_pod and gpu_pod_storage meters are open.
  const openMeterIds = useMemo(
    () =>
      new Set(
        props.meters
          .filter((m) => m.ended_at === null)
          .map((m) => `${m.service_type}:${m.service_id}`),
      ),
    [props.meters],
  );
  const wallets = useMemo(() => new Set(props.walletOwners), [props.walletOwners]);

  const running = props.pods.filter((p) => p.status === "running");
  const upstreamMonthly = running.reduce(
    (s, p) => s + (Number(p.runpod_cost_per_hr) || 0) * 730,
    0,
  );
  const revenueMonthly = running.reduce(
    (s, p) => s + (Number(p.hourly_cost_usd) || 0) * 730,
    0,
  );
  const margin = revenueMonthly - upstreamMonthly;
  const newestObservation = props.inventory.reduce(
    (max, r) => (r.observed_at > max ? r.observed_at : max),
    "1970-01-01",
  );

  const toggleDeploys = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/gpu/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !props.deployEnabled }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`GPU deploys ${data.enabled ? "enabled" : "disabled (marked out of stock)"}`);
        router.refresh();
      } else toast.error(data.error ?? "Toggle failed");
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/gpu/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Inventory sync kicked");
        router.refresh();
      } else toast.error(data.error ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Pods"
          value={`${running.length} / ${props.pods.length}`}
          hint="running / total"
          icon={Cpu}
        />
        <StatCard
          label="Upstream cost"
          value={`${money(upstreamMonthly)}/mo`}
          hint="running pods, RunPod rates"
          icon={DollarSign}
        />
        <StatCard
          label="Margin"
          value={`${money(margin)}/mo`}
          hint={margin === 0 ? "at cost — deliberate (2026-08-26)" : "revenue − upstream"}
          icon={DollarSign}
          tone={margin < 0 ? "critical" : undefined}
        />
        <StatCard
          label="Unbillable"
          value={props.findings.length}
          hint="resources billing cannot collect"
          icon={AlertTriangle}
          tone={props.findings.some((f) => f.severity === "critical") ? "critical" : props.findings.length ? "warning" : "good"}
        />
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Deploys</span>
            <StatusChip status={props.deployEnabled ? "live" : "suspended"} />
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={toggleDeploys}>
            <Power className="mr-1.5 h-3.5 w-3.5" />
            {props.deployEnabled ? "Mark out of stock" : "Enable deploys"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pods">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="pods">Pods ({props.pods.length})</TabsTrigger>
          <TabsTrigger value="unbillable">
            Unbillable ({props.findings.length})
          </TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="volumes">Volumes ({props.volumes.length})</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>

        <TabsContent value="pods">
          <PodsTab
            pods={props.pods}
            events={props.events}
            catalogName={catalogName}
            openMeterIds={openMeterIds}
            wallets={wallets}
          />
        </TabsContent>

        <TabsContent value="unbillable">
          {props.findings.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-xs text-muted-foreground">
              Every live pod and volume has an open meter and a wallet to bill.
            </p>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4">
              <ul>
                {props.findings.map((f, i) => (
                  <FindingRow
                    key={i}
                    status={f.severity}
                    label={f.title}
                    detail={f.detail}
                    action={f.action}
                  />
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="inventory">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              gpu_inventory_latest — last observation {age(newestObservation)} ago.
              Inventory (GraphQL) and pod deploys (REST) are different RunPod
              APIs; a model listed here is not guaranteed deployable.
            </p>
            <Button size="sm" variant="outline" disabled={busy} onClick={syncNow}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Sync now
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <Table head={["model", "cloud", "datacenter", "stock", "on-demand/hr", "spot/hr", "observed"]}>
              {props.inventory.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{catalogName.get(r.gpu_catalog_id) ?? r.gpu_catalog_id}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.cloud_type}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.data_center_id}</td>
                  <td className="py-1.5 pr-4"><StatusChip status={r.stock_status} /></td>
                  <td className="py-1.5 pr-4">{r.on_demand_per_hr === null ? "—" : money(Number(r.on_demand_per_hr), 4)}</td>
                  <td className="py-1.5 pr-4">{r.spot_per_hr === null ? "—" : money(Number(r.spot_per_hr), 4)}</td>
                  <td className="py-1.5 text-muted-foreground">{age(r.observed_at)} ago</td>
                </tr>
              ))}
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="pricing">
          <PricingTab
            quotePricing={props.quotePricing}
            chargeMarkup={props.chargeMarkup}
            catalogName={catalogName}
          />
        </TabsContent>

        <TabsContent value="volumes">
          <div className="rounded-xl border border-border bg-card p-4">
            <Table head={["volume", "owner", "size", "datacenter", "ours/mo", "upstream/mo", "billing", "status"]}>
              {props.volumes.map((v) => (
                <tr key={v.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{v.name}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{v.owner_email ?? v.owner_id.slice(0, 8)}</td>
                  <td className="py-1.5 pr-4">{v.size_gb} GB</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{v.data_center_id ?? "—"}</td>
                  <td className="py-1.5 pr-4">{money(Number(v.monthly_cost_usd) || 0)}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{money(Number(v.runpod_cost_per_month_usd) || 0)}</td>
                  <td className="py-1.5 pr-4">
                    {v.billing_service_id && openMeterIds.has(`gpu_volume:${v.billing_service_id}`) ? (
                      wallets.has(v.owner_id) ? (
                        <StatusChip status="live" />
                      ) : (
                        <StatusChip status="unbillable" />
                      )
                    ) : (
                      <StatusChip status="unmetered" />
                    )}
                  </td>
                  <td className="py-1.5"><StatusChip status={v.status} /></td>
                </tr>
              ))}
            </Table>
            {props.volumes.length === 0 && (
              <p className="text-xs text-muted-foreground">No network volumes.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="catalog">
          <CatalogTab catalog={props.catalog} templates={props.templates} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ─── Pods tab ────────────────────────────────────────────────────────────────

function PodsTab({
  pods,
  events,
  catalogName,
  openMeterIds,
  wallets,
}: {
  pods: GpuPod[];
  events: GpuPodEvent[];
  catalogName: Map<string, string>;
  openMeterIds: Set<string>;
  wallets: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<GpuPod | null>(null);

  const statuses = useMemo(
    () => [...new Set(pods.map((p) => p.status))].sort(),
    [pods],
  );
  const filtered = pods.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return `${p.name} ${p.owner_email ?? ""} ${p.gpu_catalog_id} ${p.data_center_id ?? ""}`
      .toLowerCase()
      .includes(needle);
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, owner, GPU…" className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {pods.length}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <Table head={["pod", "owner", "gpu", "cloud/dc", "charged/hr", "upstream/hr", "margin/hr", "billing", "status", ""]}>
          {filtered.map((p) => {
            const charged = Number(p.hourly_cost_usd) || 0;
            const upstream = Number(p.runpod_cost_per_hr) || 0;
            const m = charged - upstream;
            return (
              <tr key={p.id} className="border-t border-border/60">
                <td className="py-1.5 pr-4">{p.name}</td>
                <td className="py-1.5 pr-4 text-muted-foreground">{p.owner_email ?? p.owner_id.slice(0, 8)}</td>
                <td className="py-1.5 pr-4">
                  {p.gpu_count}× {catalogName.get(p.gpu_catalog_id) ?? p.gpu_catalog_id}
                  {p.interruptible && <span className="text-muted-foreground"> · spot</span>}
                </td>
                <td className="py-1.5 pr-4 text-muted-foreground">{p.cloud_type}{p.data_center_id ? ` / ${p.data_center_id}` : ""}</td>
                <td className="py-1.5 pr-4">{money(charged, 4)}</td>
                <td className="py-1.5 pr-4 text-muted-foreground">{money(upstream, 4)}</td>
                <td className="py-1.5 pr-4">
                  {m === 0 ? <span className="text-muted-foreground">$0 (at cost)</span> : money(m, 4)}
                </td>
                <td className="py-1.5 pr-4">
                  {(() => {
                    if (p.status === "terminated")
                      return <span className="text-xs text-muted-foreground">closed</span>;
                    const compute = p.billing_service_id && openMeterIds.has(`gpu_pod:${p.billing_service_id}`);
                    const storage = p.billing_service_id && openMeterIds.has(`gpu_pod_storage:${p.billing_service_id}`);
                    if (!compute && !storage) return <StatusChip status="unmetered" />;
                    if (!compute || !storage) return <StatusChip status="half-billed" />;
                    return wallets.has(p.owner_id) ? <StatusChip status="live" /> : <StatusChip status="unbillable" />;
                  })()}
                </td>
                <td className="py-1.5 pr-4"><StatusChip status={p.status} /></td>
                <td className="py-1.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(p)}>
                    <Eye className="mr-1 h-3.5 w-3.5" /> View
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>
        {filtered.length === 0 && (
          <p className="py-3 text-center text-xs text-muted-foreground">No pods match.</p>
        )}
      </div>

      {selected && (
        <PodDialog
          pod={selected}
          events={events.filter((e) => e.pod_id === selected.id)}
          catalogName={catalogName}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function PodDialog({
  pod,
  events,
  catalogName,
  onClose,
}: {
  pod: GpuPod;
  events: GpuPodEvent[];
  catalogName: Map<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [terminating, setTerminating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (action: "start" | "stop" | "terminate") => {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/gpu/pods/${pod.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${action} sent for "${pod.name}"`);
        router.refresh();
        onClose();
      } else {
        toast.error(data.error ?? `${action} failed`);
      }
    } finally {
      setBusy(null);
    }
  };

  const canPower = pod.status === "running" || pod.status === "stopped";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pod.name} · <span className="text-muted-foreground">{pod.owner_email ?? pod.owner_id}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {(
            [
              ["gpu", `${pod.gpu_count}× ${catalogName.get(pod.gpu_catalog_id) ?? pod.gpu_catalog_id}`],
              ["cloud", `${pod.cloud_type}${pod.interruptible ? " (spot)" : ""}`],
              ["datacenter", pod.data_center_id ?? "—"],
              ["status", pod.status],
              ["charged", `${money(Number(pod.hourly_cost_usd) || 0, 4)}/hr`],
              ["upstream", `${money(Number(pod.runpod_cost_per_hr) || 0, 4)}/hr`],
              ["disk", `${pod.container_disk_gb ?? 0} GB container · ${pod.volume_gb ?? 0} GB volume`],
              ["image", pod.image_name ?? "—"],
              ["billing since", pod.billing_start?.slice(0, 16).replace("T", " ") ?? "—"],
              ["runpod id", pod.runpod_pod_id ?? "—"],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <span className="text-muted-foreground">{k}: </span>
              <span className="font-mono">{String(v)}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium">Events</p>
          {events.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto custom-scrollbar">
              {events.map((e) => (
                <li key={e.id} className="text-xs text-muted-foreground">
                  <span className="font-mono">{e.created_at.slice(5, 16).replace("T", " ")}</span>{" "}
                  <StatusChip status={e.event_type} /> {e.message ?? ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No events recorded.</p>
          )}
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          {canPower && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {pod.status === "running" ? "Stop compute billing; disk persists." : "Start the pod again."}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => act(pod.status === "running" ? "stop" : "start")}
              >
                {busy && busy !== "terminate" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {pod.status === "running" ? "Stop pod" : "Start pod"}
              </Button>
            </div>
          )}

          {pod.status !== "terminated" &&
            (terminating ? (
              <div className="space-y-2 rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs text-red-300">
                  Terminating destroys {pod.owner_email ?? "this customer"}&apos;s
                  work and the pod&apos;s local disk. Type the pod name{" "}
                  <span className="font-mono">{pod.name}</span> to confirm.
                </p>
                <div className="flex gap-2">
                  <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={pod.name} />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={confirmName !== pod.name || busy !== null}
                    onClick={() => act("terminate")}
                  >
                    {busy === "terminate" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Terminate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTerminating(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Destroys the pod and its local disk. Audited.
                </p>
                <Button size="sm" variant="destructive" onClick={() => setTerminating(true)}>
                  Terminate…
                </Button>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pricing tab ─────────────────────────────────────────────────────────────

function PricingTab({
  quotePricing,
  chargeMarkup,
  catalogName,
}: {
  quotePricing: GpuQuotePricingRow[];
  chargeMarkup: number | null;
  catalogName: Map<string, string>;
}) {
  const [editing, setEditing] = useState<GpuQuotePricingRow | null>(null);
  const [blanket, setBlanket] = useState(false);
  const drifted = chargeMarkup === null
    ? []
    : quotePricing.filter((r) => Number(r.markup_pct) !== chargeMarkup);

  return (
    <>
      <Callout tone={drifted.length > 0 ? "critical" : "warning"}>
        <strong className="font-semibold">There are two GPU price books.</strong>{" "}
        The quote the customer sees comes from per-model rows below
        (public.gpu_pricing); the charge they are billed uses ONE global
        markup — currently{" "}
        <span className="font-mono">{chargeMarkup === null ? "UNSET" : `×${chargeMarkup}`}</span>{" "}
        (billing.service_pricing, edited only via the{" "}
        <Link href="/pricing" className="underline">price book</Link>).{" "}
        {drifted.length > 0 ? (
          <>
            <strong className="font-semibold">{drifted.length} model row(s) disagree with the charge markup</strong>{" "}
            — customers are quoted one price and billed another. Align them, or
            ask the billing lane to unify the books.
          </>
        ) : (
          <>All rows currently agree (×{chargeMarkup ?? "?"} — at cost is a deliberate 2026-08-26 decision). Any edit on either side can silently break that; the banner turns red when it happens.</>
        )}
      </Callout>

      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setBlanket(true)}>
          Set markup for ALL models…
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <Table head={["model", "cloud", "type", "quote markup", "floor $/hr", "vs charge", ""]}>
          {quotePricing.map((r) => {
            const disagrees = chargeMarkup !== null && Number(r.markup_pct) !== chargeMarkup;
            return (
              <tr key={`${r.gpu_catalog_id}-${r.cloud_type}-${r.interruptible}`} className="border-t border-border/60">
                <td className="py-1.5 pr-4">{catalogName.get(r.gpu_catalog_id) ?? r.gpu_catalog_id}</td>
                <td className="py-1.5 pr-4 text-muted-foreground">{r.cloud_type}</td>
                <td className="py-1.5 pr-4 text-muted-foreground">{r.interruptible ? "spot" : "on-demand"}</td>
                <td className="py-1.5 pr-4">×{Number(r.markup_pct)}</td>
                <td className="py-1.5 pr-4">{money(Number(r.floor_per_hour_usd) || 0, 4)}</td>
                <td className="py-1.5 pr-4">
                  {disagrees ? <StatusChip status="drift" /> : <StatusChip status="clean" />}
                </td>
                <td className="py-1.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>Edit</Button>
                </td>
              </tr>
            );
          })}
        </Table>
      </div>

      {editing && (
        <EditQuotePricingDialog row={editing} catalogName={catalogName} onClose={() => setEditing(null)} />
      )}
      {blanket && (
        <BlanketMarkupDialog
          rowCount={quotePricing.length}
          chargeMarkup={chargeMarkup}
          onClose={() => setBlanket(false)}
        />
      )}
    </>
  );
}

function BlanketMarkupDialog({
  rowCount,
  chargeMarkup,
  onClose,
}: {
  rowCount: number;
  chargeMarkup: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [markup, setMarkup] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const markupNum = Number(markup);
  const valid = Number.isFinite(markupNum) && markupNum >= 1 && confirmText === "ALL";

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/gpu/quote-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blanket: true, markup_pct: markupNum }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          `${data.rowsUpdated} quote row(s) set to ×${markupNum}` +
            (data.drift?.agrees ? " — books agree" : ` — charge book is ×${data.drift?.chargeMarkup}, books DISAGREE`),
        );
        router.refresh();
        onClose();
      } else toast.error(data.error ?? "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Blanket quote markup — every model</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            This rewrites the quote markup on all {rowCount} gpu_pricing rows
            in one atomic call. It does NOT touch what customers are billed
            (charge book: ×{chargeMarkup ?? "?"}) — change that in the price
            book too, or the banner goes red.
          </p>
          <div className="space-y-1.5">
            <Label>Markup (×, ≥ 1)</Label>
            <Input type="number" min="1" step="0.001" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="1.25" />
          </div>
          <div className="space-y-1.5">
            <Label>Type ALL to confirm</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ALL" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={!valid || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply to all models
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditQuotePricingDialog({
  row,
  catalogName,
  onClose,
}: {
  row: GpuQuotePricingRow;
  catalogName: Map<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [markup, setMarkup] = useState(String(row.markup_pct));
  const [floor, setFloor] = useState(String(row.floor_per_hour_usd));
  const [busy, setBusy] = useState(false);

  const markupNum = Number(markup);
  const floorNum = Number(floor);
  const valid = Number.isFinite(markupNum) && markupNum >= 1 && Number.isFinite(floorNum) && floorNum >= 0;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/gpu/quote-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpu_catalog_id: row.gpu_catalog_id,
          cloud_type: row.cloud_type,
          interruptible: row.interruptible,
          markup_pct: markupNum,
          floor_per_hour_usd: floorNum,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.drift?.agrees) {
          toast.success("Quote pricing updated — quote and charge books agree");
        } else {
          toast.warning(
            data.drift?.quoteIsUniform
              ? `Updated, but quote (×${data.drift?.quoteMarkupMax}) and charge (×${data.drift?.chargeMarkup}) books now DISAGREE`
              : "Updated — quote markups are no longer uniform across models",
          );
        }
        router.refresh();
        onClose();
      } else toast.error(data.error ?? "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Quote pricing — {catalogName.get(row.gpu_catalog_id) ?? row.gpu_catalog_id} ({row.cloud_type}, {row.interruptible ? "spot" : "on-demand"})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This edits what the customer is QUOTED. What they are BILLED is the
            global gpu_pod markup in the price book — change both or they drift.
          </p>
          <div className="space-y-1.5">
            <Label>Markup (×, ≥ 1 — never below cost)</Label>
            <Input type="number" min="1" step="0.001" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Floor $/hr (≥ 0)</Label>
            <Input type="number" min="0" step="0.0001" value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={!valid || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save quote pricing
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Catalog tab ─────────────────────────────────────────────────────────────

function CatalogTab({
  catalog,
  templates,
}: {
  catalog: GpuCatalogRow[];
  templates: GpuTemplateRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (kind: "catalog" | "template", id: string, isActive: boolean) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/gpu/catalog-active", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, is_active: !isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${id} ${isActive ? "disabled" : "enabled"}`);
        router.refresh();
      } else toast.error(data.error ?? "Toggle failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-xs font-medium">GPU models ({catalog.length})</p>
        <Table head={["model", "vendor", "memory", "tier", "status", ""]}>
          {catalog.map((c) => (
            <tr key={c.id} className="border-t border-border/60">
              <td className="py-1.5 pr-4">{c.display_name}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{c.vendor ?? "—"}</td>
              <td className="py-1.5 pr-4">{c.memory_gb ? `${c.memory_gb} GB` : "—"}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{c.tier ?? "—"}</td>
              <td className="py-1.5 pr-4">
                <StatusChip status={c.is_active ? "live" : "suspended"} />
              </td>
              <td className="py-1.5 text-right">
                <Button variant="ghost" size="sm" disabled={busyId === c.id} onClick={() => toggle("catalog", c.id, c.is_active)}>
                  {c.is_active ? "Disable" : "Enable"}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-xs font-medium">Templates ({templates.length})</p>
        <Table head={["template", "image", "category", "status", ""]}>
          {templates.map((t) => (
            <tr key={t.id} className="border-t border-border/60">
              <td className="py-1.5 pr-4">{t.name}</td>
              <td className="max-w-[280px] truncate py-1.5 pr-4 text-muted-foreground">{t.image_name}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{t.category ?? "—"}</td>
              <td className="py-1.5 pr-4">
                <StatusChip status={t.is_active ? "live" : "suspended"} />
              </td>
              <td className="py-1.5 text-right">
                <Button variant="ghost" size="sm" disabled={busyId === t.id} onClick={() => toggle("template", t.id, t.is_active)}>
                  {t.is_active ? "Disable" : "Enable"}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
