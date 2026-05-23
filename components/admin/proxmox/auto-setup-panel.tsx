"use client";

// Auto-Setup Host wizard.
//
// Single-form panel that registers a new Proxmox host, builds the
// standard Linux templates on it, and (optionally) seeds a BYOIP
// block as a routed pool — in one go, with live progress.
//
// Talks to POST /api/admin/proxmox/hosts/auto-setup which streams
// NDJSON events ({type, message, t}) that we render in a console.

import { useCallback, useRef, useState } from "react";
import {
    Loader2,
    Server,
    Sparkles,
    StopCircle,
    Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type FormState = {
    name: string;
    host_url: string;
    username: string;
    password: string;
    node: string;
    storage: string;
    bridge: string;
    region: string;
    display_region: string;
    provider: "ovh" | "generic";
    server_series: string;
    network_mode: string;
    gateway_ip: string;
    dns_primary: string;
    dns_secondary: string;
    byoip_cidr: string;
    vm_private_cidr: string;
    vm_private_gateway: string;
    vm_private_ip_start: string;
    skip_templates: boolean;
    vmids: string;
    total_cpu_cores: string;
    total_memory_mb: string;
    total_disk_gb: string;
};

const emptyForm: FormState = {
    name: "",
    host_url: "",
    username: "root",
    password: "",
    node: "pve",
    storage: "local",
    bridge: "vmbr0",
    region: "",
    display_region: "",
    provider: "ovh",
    server_series: "ovh_advance_gen3",
    // Default to the vMAC failover model. Works on every supported
    // bare-metal series, doesn't require any host-side network
    // reconciliation (no vmbr1, no proxy_arp, no private subnet on
    // the box). Routed BYOIP is selectable below for the rare case
    // where you actually want it.
    network_mode: "ovh_failover_vmac",
    gateway_ip: "",
    dns_primary: "8.8.8.8",
    dns_secondary: "1.1.1.1",
    byoip_cidr: "",
    vm_private_cidr: "192.168.0.0/24",
    vm_private_gateway: "192.168.0.1",
    vm_private_ip_start: "10",
    skip_templates: false,
    vmids: "",
    total_cpu_cores: "",
    total_memory_mb: "",
    total_disk_gb: "",
};

const SERIES_OPTIONS = [
    { value: "generic", label: "Generic / existing host" },
    { value: "ovh_rise_game", label: "Entry-tier bare metal (Rise / Game)" },
    { value: "ovh_advance_gen3", label: "Mid-tier bare metal (Advance Gen3)" },
    { value: "ovh_high_grade_scale", label: "High-grade / scale bare metal" },
];

const NETWORK_MODE_OPTIONS = [
    { value: "legacy_public_gateway", label: "Legacy routed public gateway" },
    { value: "ovh_failover_vmac", label: "Failover IP with virtual MAC (on-demand)" },
    { value: "ovh_hg_scale_routed", label: "High-grade routed BYOIP" },
    { value: "ovh_advance_gen3_routed", label: "Mid-tier routed BYOIP" },
    { value: "ovh_vrack_block", label: "vRack routed IP block" },
];

type StreamEvent = {
    type: "step" | "log" | "ok" | "error" | "done";
    message: string;
    t: number;
    hostId?: string;
};

type Props = {
    onCreated?: (hostId: string) => void;
};

export function AutoSetupPanel({ onCreated }: Props) {
    const [form, setForm] = useState<FormState>(emptyForm);
    const [running, setRunning] = useState(false);
    const [events, setEvents] = useState<StreamEvent[]>([]);
    const [createdHostId, setCreatedHostId] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const logBoxRef = useRef<HTMLDivElement | null>(null);

    const append = useCallback((ev: StreamEvent) => {
        setEvents((prev) => [...prev, ev]);
        // auto-scroll to bottom
        requestAnimationFrame(() => {
            if (logBoxRef.current) {
                logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
            }
        });
    }, []);

    const reset = useCallback(() => {
        setForm(emptyForm);
        setEvents([]);
        setCreatedHostId(null);
    }, []);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const submit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!form.name || !form.host_url || !form.password || !form.node) {
                toast.error("Name, host URL, SSH password and node are required");
                return;
            }
            setRunning(true);
            setEvents([]);
            setCreatedHostId(null);

            const ac = new AbortController();
            abortRef.current = ac;

            try {
                const res = await fetch("/api/admin/proxmox/hosts/auto-setup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: form.name,
                        host_url: form.host_url,
                        username: form.username || "root",
                        password: form.password,
                        node: form.node,
                        storage: form.storage,
                        bridge: form.bridge,
                        region: form.region || undefined,
                        display_region: form.display_region || undefined,
                        provider: form.provider,
                        server_series: form.server_series,
                        network_mode: form.network_mode,
                        gateway_ip: form.gateway_ip || undefined,
                        dns_primary: form.dns_primary || undefined,
                        dns_secondary: form.dns_secondary || undefined,
                        byoip_cidr: form.byoip_cidr || undefined,
                        vm_private_cidr: form.vm_private_cidr || undefined,
                        vm_private_gateway: form.vm_private_gateway || undefined,
                        vm_private_ip_start: form.vm_private_ip_start ? Number(form.vm_private_ip_start) : undefined,
                        skip_templates: form.skip_templates,
                        vmids: form.vmids || undefined,
                        total_cpu_cores: form.total_cpu_cores ? Number(form.total_cpu_cores) : undefined,
                        total_memory_mb: form.total_memory_mb ? Number(form.total_memory_mb) : undefined,
                        total_disk_gb: form.total_disk_gb ? Number(form.total_disk_gb) : undefined,
                    }),
                    signal: ac.signal,
                });

                if (!res.ok) {
                    let errMsg = `HTTP ${res.status}`;
                    try {
                        const j = await res.json();
                        if (j?.error) errMsg = j.error;
                    } catch {
                        /* not JSON, keep default */
                    }
                    toast.error(errMsg);
                    append({ type: "error", message: errMsg, t: Date.now() });
                    return;
                }

                if (!res.body) {
                    toast.error("No response stream");
                    return;
                }

                // Parse NDJSON stream
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = "";
                let finalHostId: string | null = null;
                let anyError = false;
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    let nl = buf.indexOf("\n");
                    while (nl !== -1) {
                        const line = buf.slice(0, nl).trim();
                        buf = buf.slice(nl + 1);
                        if (line.length > 0) {
                            try {
                                const ev = JSON.parse(line) as StreamEvent;
                                if (ev.hostId) finalHostId = ev.hostId;
                                if (ev.type === "error") anyError = true;
                                append(ev);
                            } catch {
                                append({ type: "log", message: line, t: Date.now() });
                            }
                        }
                        nl = buf.indexOf("\n");
                    }
                }
                // Flush any trailing data
                if (buf.trim().length > 0) {
                    try {
                        const ev = JSON.parse(buf) as StreamEvent;
                        if (ev.hostId) finalHostId = ev.hostId;
                        append(ev);
                    } catch {
                        append({ type: "log", message: buf, t: Date.now() });
                    }
                }

                if (finalHostId) {
                    setCreatedHostId(finalHostId);
                    if (anyError) {
                        toast.warning("Host registered but some steps had errors — check the log");
                    } else {
                        toast.success("Host setup complete");
                    }
                    onCreated?.(finalHostId);
                } else {
                    toast.error("Setup did not complete — no host id returned");
                }
            } catch (err) {
                if ((err as Error).name === "AbortError") {
                    append({ type: "error", message: "Setup cancelled by operator", t: Date.now() });
                    toast.info("Cancelled");
                } else {
                    const msg = err instanceof Error ? err.message : String(err);
                    append({ type: "error", message: msg, t: Date.now() });
                    toast.error(msg);
                }
            } finally {
                setRunning(false);
                abortRef.current = null;
            }
        },
        [form, append, onCreated]
    );

    const colorFor = (t: StreamEvent["type"]): string => {
        switch (t) {
            case "step":
                return "text-cyan-300";
            case "ok":
                return "text-green-400";
            case "error":
                return "text-red-400";
            case "done":
                return "text-emerald-400 font-semibold";
            default:
                return "text-white/70";
        }
    };
    const prefixFor = (t: StreamEvent["type"]): string => {
        switch (t) {
            case "step":
                return "▶";
            case "ok":
                return "✓";
            case "error":
                return "✗";
            case "done":
                return "★";
            default:
                return " ";
        }
    };

    return (
        <Card className="bg-black/50 border-white/10">
            <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#0095FF]" />
                    Auto-Setup New Host
                </CardTitle>
                <CardDescription className="text-white/60">
                    Register a Proxmox host, build the standard Linux templates on it, and seed a BYOIP block — all in one go.
                    Progress streams below in real-time.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={submit} className="space-y-6">
                    {/* Identity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-white">Host Name *</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g., de-advance-01"
                                disabled={running}
                                className="bg-black/50 text-white border-white/10 mt-1"
                            />
                        </div>
                        <div>
                            <Label className="text-white">Proxmox URL *</Label>
                            <Input
                                value={form.host_url}
                                onChange={(e) => setForm({ ...form, host_url: e.target.value })}
                                placeholder="https://nsXXXXXX.ip-AA-BB-CC.net:8006"
                                disabled={running}
                                className="bg-black/50 text-white border-white/10 mt-1"
                            />
                        </div>
                    </div>

                    {/* SSH credentials */}
                    <div className="border-t border-white/10 pt-4">
                        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                            <Server className="h-4 w-4" />
                            SSH credentials (used for template build)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-white">SSH User</Label>
                                <Input
                                    value={form.username}
                                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                                    placeholder="root"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-white">SSH Password *</Label>
                                <Input
                                    type="password"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    placeholder="root password"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Proxmox layout */}
                    <div className="border-t border-white/10 pt-4">
                        <h3 className="text-white font-semibold mb-3">Proxmox layout</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-white">Node *</Label>
                                <Input
                                    value={form.node}
                                    onChange={(e) => setForm({ ...form, node: e.target.value })}
                                    placeholder="pve"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-white">Storage</Label>
                                <Input
                                    value={form.storage}
                                    onChange={(e) => setForm({ ...form, storage: e.target.value })}
                                    placeholder="local"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-white">Bridge</Label>
                                <Input
                                    value={form.bridge}
                                    onChange={(e) => setForm({ ...form, bridge: e.target.value })}
                                    placeholder="vmbr0"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Region + provider */}
                    <div className="border-t border-white/10 pt-4">
                        <h3 className="text-white font-semibold mb-3">Region & provider</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-white">Region code</Label>
                                <Input
                                    value={form.region}
                                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                                    placeholder="fra, bom, sgp ..."
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-white">Display Region</Label>
                                <Input
                                    value={form.display_region}
                                    onChange={(e) => setForm({ ...form, display_region: e.target.value })}
                                    placeholder="Germany (Frankfurt)"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-white">Provider</Label>
                                <Select
                                    value={form.provider}
                                    onValueChange={(v: "ovh" | "generic") => setForm({ ...form, provider: v })}
                                    disabled={running}
                                >
                                    <SelectTrigger className="bg-black/50 text-white border-white/10 mt-1 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ovh">OVHcloud</SelectItem>
                                        <SelectItem value="generic">Generic</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Network profile */}
                    <div className="border-t border-white/10 pt-4">
                        <h3 className="text-white font-semibold mb-3">Network profile</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-white">Server series</Label>
                                <Select
                                    value={form.server_series}
                                    onValueChange={(v) => setForm({ ...form, server_series: v })}
                                    disabled={running}
                                >
                                    <SelectTrigger className="bg-black/50 text-white border-white/10 mt-1 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SERIES_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-white">Network mode</Label>
                                <Select
                                    value={form.network_mode}
                                    onValueChange={(v) => setForm({ ...form, network_mode: v })}
                                    disabled={running}
                                >
                                    <SelectTrigger className="bg-black/50 text-white border-white/10 mt-1 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {NETWORK_MODE_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-white">Gateway IP</Label>
                                <Input
                                    value={form.gateway_ip}
                                    onChange={(e) => setForm({ ...form, gateway_ip: e.target.value })}
                                    placeholder="host main public IP for CGNAT/vMAC, or .254 for legacy"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-white">DNS 1</Label>
                                    <Input
                                        value={form.dns_primary}
                                        onChange={(e) => setForm({ ...form, dns_primary: e.target.value })}
                                        disabled={running}
                                        className="bg-black/50 text-white border-white/10 mt-1"
                                    />
                                </div>
                                <div>
                                    <Label className="text-white">DNS 2</Label>
                                    <Input
                                        value={form.dns_secondary}
                                        onChange={(e) => setForm({ ...form, dns_secondary: e.target.value })}
                                        disabled={running}
                                        className="bg-black/50 text-white border-white/10 mt-1"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BYOIP + private subnet */}
                    <div className="border-t border-white/10 pt-4">
                        <h3 className="text-white font-semibold mb-3">
                            Public BYOIP block (optional)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-white">BYOIP CIDR</Label>
                                <Input
                                    value={form.byoip_cidr}
                                    onChange={(e) => setForm({ ...form, byoip_cidr: e.target.value })}
                                    placeholder="e.g., 46.236.217.0/24"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                                <p className="text-xs text-white/40 mt-1">
                                    The public block VMs will receive as their /32 IP. Seeded as a routed pool.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Private subnet on vmbr1 — only meaningful for routed BYOIP modes */}
                    {(form.network_mode === "ovh_hg_scale_routed" ||
                        form.network_mode === "ovh_advance_gen3_routed" ||
                        form.network_mode === "ovh_vrack_block") && (
                        <div className="border-t border-white/10 pt-4">
                            <h3 className="text-white font-semibold mb-3">
                                Private VM subnet (required for routed BYOIP)
                            </h3>
                            <p className="text-xs text-white/50 mb-3">
                                In routed BYOIP mode the VM gets the public IP as its <code className="text-white/70">/32</code>{" "}
                                address, but its <strong>gateway</strong> is a private IP that lives on{" "}
                                <code className="text-white/70">vmbr1</code> (the vRack bridge). The host then forwards
                                BYOIP traffic to the VM via proxy_arp + a per-VM /32 route. Pick any RFC1918 subnet that
                                isn&apos;t used elsewhere on this host.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <Label className="text-white">Private CIDR</Label>
                                    <Input
                                        value={form.vm_private_cidr}
                                        onChange={(e) => setForm({ ...form, vm_private_cidr: e.target.value })}
                                        placeholder="192.168.0.0/24"
                                        disabled={running}
                                        className="bg-black/50 text-white border-white/10 mt-1"
                                    />
                                    <p className="text-xs text-white/40 mt-1">RFC1918 only.</p>
                                </div>
                                <div>
                                    <Label className="text-white">Private gateway IP</Label>
                                    <Input
                                        value={form.vm_private_gateway}
                                        onChange={(e) =>
                                            setForm({ ...form, vm_private_gateway: e.target.value })
                                        }
                                        placeholder="192.168.0.1"
                                        disabled={running}
                                        className="bg-black/50 text-white border-white/10 mt-1"
                                    />
                                    <p className="text-xs text-white/40 mt-1">
                                        Must be set on vmbr1 on the host.
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-white">First VM offset</Label>
                                    <Input
                                        type="number"
                                        value={form.vm_private_ip_start}
                                        onChange={(e) =>
                                            setForm({ ...form, vm_private_ip_start: e.target.value })
                                        }
                                        placeholder="10"
                                        disabled={running}
                                        className="bg-black/50 text-white border-white/10 mt-1"
                                    />
                                    <p className="text-xs text-white/40 mt-1">
                                        First VM gets <code className="text-white/60">network+offset</code>, e.g. .10.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Capacity (optional — auto-detected from Proxmox if blank) */}
                    <div className="border-t border-white/10 pt-4">
                        <h3 className="text-white font-semibold mb-3">Node capacity (optional)</h3>
                        <p className="text-xs text-white/40 mb-3">
                            Leave blank — we&apos;ll query the Proxmox API and auto-fill from{" "}
                            <code className="text-white/60">/nodes/&lt;node&gt;/status</code> and the chosen storage.
                            Override only if you want to reserve capacity (e.g. leave 10% headroom).
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-white">CPU cores</Label>
                                <Input
                                    type="number"
                                    value={form.total_cpu_cores}
                                    onChange={(e) => setForm({ ...form, total_cpu_cores: e.target.value })}
                                    placeholder="auto"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-white">Memory (MB)</Label>
                                <Input
                                    type="number"
                                    value={form.total_memory_mb}
                                    onChange={(e) => setForm({ ...form, total_memory_mb: e.target.value })}
                                    placeholder="auto"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-white">Disk (GB)</Label>
                                <Input
                                    type="number"
                                    value={form.total_disk_gb}
                                    onChange={(e) => setForm({ ...form, total_disk_gb: e.target.value })}
                                    placeholder="auto"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Options */}
                    <div className="border-t border-white/10 pt-4">
                        <h3 className="text-white font-semibold mb-3">Options</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-center gap-2 pt-2">
                                <Checkbox
                                    id="skip-templates"
                                    checked={form.skip_templates}
                                    onCheckedChange={(v) => setForm({ ...form, skip_templates: Boolean(v) })}
                                    disabled={running}
                                />
                                <Label htmlFor="skip-templates" className="text-white cursor-pointer">
                                    Skip Linux template build
                                </Label>
                            </div>
                            <div>
                                <Label className="text-white">Only VMIDs (optional)</Label>
                                <Input
                                    value={form.vmids}
                                    onChange={(e) => setForm({ ...form, vmids: e.target.value })}
                                    placeholder="107,108 — leave blank for all"
                                    disabled={running}
                                    className="bg-black/50 text-white border-white/10 mt-1"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                        <Button
                            type="submit"
                            disabled={running}
                            className="bg-[#0095FF] hover:bg-[#0085e0] text-white"
                        >
                            {running ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Setting up…
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Start auto-setup
                                </>
                            )}
                        </Button>
                        {running && (
                            <Button type="button" variant="outline" onClick={cancel}>
                                <StopCircle className="h-4 w-4 mr-2" />
                                Cancel
                            </Button>
                        )}
                        {!running && events.length > 0 && (
                            <Button type="button" variant="outline" onClick={reset}>
                                Clear & start over
                            </Button>
                        )}
                        {createdHostId && (
                            <span className="text-xs text-white/50 ml-auto">
                                Host id: <code className="text-white/80">{createdHostId}</code>
                            </span>
                        )}
                    </div>
                </form>

                {/* Live progress console */}
                {events.length > 0 && (
                    <div className="mt-6">
                        <div className="flex items-center gap-2 mb-2 text-white/70 text-sm">
                            <Terminal className="h-4 w-4" />
                            Live progress
                        </div>
                        <div
                            ref={logBoxRef}
                            className="bg-black border border-white/10 rounded-md p-3 font-mono text-xs h-80 overflow-y-auto"
                        >
                            {events.map((ev, idx) => (
                                <div key={idx} className={`${colorFor(ev.type)} whitespace-pre-wrap`}>
                                    <span className="opacity-60 mr-2">{prefixFor(ev.type)}</span>
                                    {ev.message}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
