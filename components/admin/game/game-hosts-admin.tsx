"use client";

// Admin — Game Hosts. Kill-switch, machine inventory with live status + capacity,
// the automated "Add machine" onboarding form, and per-host maintenance/remove.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Server, Trash2, X } from "lucide-react";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface HostRow {
  id: string;
  name: string;
  region: string;
  display_region: string;
  fqdn: string;
  ip: string | null;
  ptero_node_id: number | null;
  total_memory_mb: number;
  total_disk_gb: number;
  memory_overallocate_pct: number;
  cpu_oversubscription_ratio: number;
  allowed_games: string[] | null;
  status: string;
  provision: { stage?: string; progress?: number; message?: string } | null;
  notes: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  online: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  provisioning: "border-[#0095FF]/30 bg-[#0095FF]/10 text-[#82adfb]",
  maintenance: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-400",
  offline: "border-white/[0.1] bg-white/[0.04] text-white/50",
};

export default function GameHostsAdmin({ initialEnabled, embedded }: { initialEnabled: boolean; embedded?: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hosts, setHosts] = useState<HostRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/game/hosts", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.ok) setHosts(data.hosts);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const anyProvisioning = (hosts ?? []).some((h) => h.status === "provisioning");
  useEffect(() => {
    if (!anyProvisioning) return;
    const id = setInterval(() => void load(), 5_000);
    return () => clearInterval(id);
  }, [anyProvisioning, load]);

  const toggleKill = async () => {
    const next = !enabled;
    setEnabled(next);
    const res = await fetch("/api/admin/game/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) {
      setEnabled(!next);
      toast.error("Failed to update");
    } else {
      toast.success(next ? "Ordering enabled" : "Ordering paused");
    }
  };

  const setMaintenance = async (id: string, maintenance: boolean) => {
    await fetch("/api/admin/game/hosts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: maintenance ? "maintenance" : "online" }),
    });
    void load();
  };

  const removeHost = async (id: string) => {
    if (!confirm(`Remove host ${id}? (only if drained)`)) return;
    const res = await fetch(`/api/admin/game/hosts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      toast.success("Host removed");
      void load();
    } else {
      toast.error(data?.error || "Remove failed");
    }
  };

  return (
    <div className={embedded ? "" : "mx-auto max-w-[1200px]"}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          {!embedded && (
            <>
              <a href="/dashboard/admin" className="text-[12px] text-white/45 transition-colors hover:text-white">← Admin</a>
              <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em]">Game Hosts</h1>
            </>
          )}
          <p className={`${embedded ? "" : "mt-1 "}text-[13.5px] text-white/50`}>Machines that run customer game servers, grouped by region.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="inline-flex h-9 items-center gap-2 border border-white/[0.08] bg-white/[0.02] px-3 text-xs text-white/60 hover:text-white">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={() => setShowAdd(true)} className="inline-flex h-9 items-center gap-2 border border-[#0095FF]/30 bg-[#0095FF] px-4 text-xs font-semibold text-white hover:bg-[#33adff]">
            <Plus className="h-3.5 w-3.5" /> Add machine
          </button>
        </div>
      </div>

      {/* Kill switch */}
      <div className="mb-6 flex items-center justify-between border border-white/[0.08] bg-[#111216] px-5 py-4">
        <div>
          <p className="text-[13.5px] font-medium text-white">Game server ordering</p>
          <p className="mt-0.5 text-[12px] text-white/45">Master switch — off blocks the deploy wizard &amp; create API for all customers.</p>
        </div>
        <button
          onClick={() => void toggleKill()}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-white/[0.14]"}`}
        >
          <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-[22px]" : "translate-x-[3px]"}`} style={{ height: 18, width: 18 }} />
        </button>
      </div>

      {/* Hosts */}
      {hosts === null ? (
        <div className="flex items-center justify-center py-20 text-white/40"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
      ) : hosts.length === 0 ? (
        <div className="border border-white/[0.08] bg-[#0F1114] px-8 py-14 text-center">
          <Server className="mx-auto h-7 w-7 text-[#0095FF]" />
          <p className="mt-3 text-white/60">No machines yet. Add one to start serving a region.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {hosts.map((h) => {
            const memGB = (h.total_memory_mb / 1024).toFixed(0);
            return (
              <div key={h.id} className="border border-white/[0.08] bg-[#111216] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-6 items-center border px-2 text-[11px] font-medium ${STATUS_STYLE[h.status] ?? STATUS_STYLE.offline}`}>
                      {h.status}
                    </span>
                    <div>
                      <p className="text-[14px] font-medium text-white">
                        {h.name} <span className="text-white/30">·</span> <span className="text-white/55">{h.display_region}</span>
                      </p>
                      <p className={`${MONO} mt-0.5 text-[11.5px] text-white/40`}>{h.fqdn} → {h.ip ?? "—"} · node {h.ptero_node_id ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`${MONO} text-right text-[11.5px] text-white/50`}>
                      <p>{memGB} GB RAM · {h.total_disk_gb} GB</p>
                      <p className="text-white/35">+{h.memory_overallocate_pct}% mem · {h.cpu_oversubscription_ratio}× cpu</p>
                    </div>
                    {h.status === "online" && (
                      <button onClick={() => void setMaintenance(h.id, true)} className="h-8 border border-white/[0.1] px-3 text-[11.5px] text-white/60 hover:text-amber-300">Maintenance</button>
                    )}
                    {h.status === "maintenance" && (
                      <button onClick={() => void setMaintenance(h.id, false)} className="h-8 border border-white/[0.1] px-3 text-[11.5px] text-white/60 hover:text-emerald-300">Set online</button>
                    )}
                    <button onClick={() => void removeHost(h.id)} className="h-8 w-8 border border-white/[0.08] text-white/40 hover:border-red-500/30 hover:text-red-400 inline-flex items-center justify-center">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {(h.status === "provisioning" || h.status === "failed") && h.provision?.message && (
                  <div className={`mt-3 text-[12px] ${h.status === "failed" ? "text-red-300" : "text-white/50"}`}>
                    {h.status === "provisioning" && <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />}
                    {h.provision.message} {h.provision.progress != null && h.status === "provisioning" ? `(${h.provision.progress}%)` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddMachineModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); void load(); }} busy={busy} setBusy={setBusy} />}
    </div>
  );
}

function AddMachineModal({ onClose, onDone, busy, setBusy }: { onClose: () => void; onDone: () => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const [form, setForm] = useState({
    id: "", name: "", region: "", displayRegion: "", fqdn: "", ip: "",
    sshPassword: "", memoryMB: "24576", diskGB: "200", totalCpuCores: "8",
    memoryOverallocatePct: "0", cpuOversubscriptionRatio: "3",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/game/hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          memoryMB: Number(form.memoryMB),
          diskGB: Number(form.diskGB),
          totalCpuCores: Number(form.totalCpuCores),
          memoryOverallocatePct: Number(form.memoryOverallocatePct),
          cpuOversubscriptionRatio: Number(form.cpuOversubscriptionRatio),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        toast.success("Onboarding started — watch the pipeline");
        onDone();
      } else {
        toast.error(data?.error || "Failed to start onboarding");
      }
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form, label: string, placeholder?: string, type = "text") => (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-white/55">{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full border border-white/[0.1] bg-black/20 px-2.5 text-[13px] text-white placeholder:text-white/25 focus:border-[#0095FF]/50 focus:outline-none"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-[6vh]">
      <div className="w-full max-w-[560px] border border-white/[0.12] bg-[#111216]">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-white">Add machine</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-5">
          <p className="mb-4 text-[12px] leading-relaxed text-white/45">
            Provide the machine&apos;s IP and root SSH — the pipeline installs Docker + Wings, registers
            the panel node, opens the firewall, creates allocations, issues TLS, and brings it online.
            If the FQDN&apos;s domain isn&apos;t in our Cloudflare, add its A record first.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {field("id", "Host ID", "dallas2")}
            {field("name", "Name", "dallas2")}
            {field("region", "Region slug", "us-dallas")}
            {field("displayRegion", "Region label", "Dallas, US")}
            {field("fqdn", "Node hostname", "dallas2.ahurasense.com")}
            {field("ip", "IP address", "203.0.113.10")}
            <div className="col-span-2">{field("sshPassword", "Root SSH password", "", "password")}</div>
            {field("memoryMB", "Allocatable RAM (MB)", "24576")}
            {field("diskGB", "Allocatable disk (GB)", "200")}
            {field("totalCpuCores", "CPU cores", "8")}
            {field("cpuOversubscriptionRatio", "CPU oversub ×", "3")}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="h-9 border border-white/[0.1] px-4 text-[12.5px] text-white/60 hover:text-white">Cancel</button>
            <button
              onClick={() => void submit()}
              disabled={busy || !form.id || !form.fqdn || !form.ip || !form.region || !form.sshPassword}
              className="inline-flex h-9 items-center gap-2 border border-[#0095FF]/30 bg-[#0095FF] px-5 text-[12.5px] font-semibold text-white hover:bg-[#33adff] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Start onboarding
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
