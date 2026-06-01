import Link from "next/link";
import { ArrowRight, Cpu, MemoryStick, HardDrive, Server, MapPin } from "lucide-react";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FleetStats = {
    servers: number;
    cores: number;
    memoryMB: number;
    regions: number;
};

async function getFleetStats(userId: string): Promise<FleetStats> {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("servers")
            .select("location, cpu_cores, memory_mb, status")
            .eq("owner_id", userId)
            .in("status", ["provisioning", "running", "stopped", "suspended"]);

        const rows = data ?? [];
        const regions = new Set<string>();
        let cores = 0;
        let memoryMB = 0;
        for (const r of rows) {
            if (r.location) regions.add(String(r.location));
            cores += Number(r.cpu_cores ?? 0);
            memoryMB += Number(r.memory_mb ?? 0);
        }
        return { servers: rows.length, cores, memoryMB, regions: regions.size };
    } catch {
        return { servers: 0, cores: 0, memoryMB: 0, regions: 0 };
    }
}

function formatMemory(mb: number): string {
    if (!mb) return "0 GB";
    if (mb < 1024) return `${mb} MB`;
    return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
}

export default async function ComputePage() {
    const user = await requireAuthProfile();
    const stats = await getFleetStats(user.id);

    return (
        <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-10 pb-16">
            {/* Header */}
            <header>
                <h1 className="text-[28px] font-semibold tracking-tight text-white">Compute</h1>
                <p className="mt-1.5 text-[14px] text-white/55">
                    Provision virtual servers and bare metal across global regions.
                </p>
            </header>

            {/* Service cards */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ServiceCard
                    href="/dashboard/services/compute/vps"
                    title="Virtual Servers"
                    description="On-demand VMs with full control. Spin up in seconds across global regions, scale resources independently."
                    features={[
                        "From $5/mo · per-second billing",
                        "Linux + Windows templates",
                        "Snapshots, backups, console access",
                        "Auto-balanced across storage classes",
                    ]}
                    accent="blue"
                    ctaLabel="Deploy a VM"
                />
                <ServiceCard
                    href="/dashboard/services/compute/bare-metal"
                    title="Bare Metal"
                    description="Dedicated hardware with no virtualization overhead. Single-tenant for predictable performance and full root."
                    features={[
                        "No hypervisor tax — full hardware",
                        "Custom OS installation",
                        "Multi-disk RAID configurations",
                        "BGP / private uplink available",
                    ]}
                    accent="amber"
                    ctaLabel="Configure server"
                />
            </section>

            {/* Fleet stats */}
            <section>
                <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-[15px] font-semibold text-white">Your fleet</h2>
                    {stats.servers > 0 && (
                        <Link
                            href="/dashboard/services/compute/vps"
                            className="text-[12px] text-white/55 hover:text-white transition-colors inline-flex items-center gap-1"
                        >
                            Manage <ArrowRight className="h-3 w-3" />
                        </Link>
                    )}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatTile icon={<Server className="h-3.5 w-3.5" />} label="Active servers" value={String(stats.servers)} />
                    <StatTile icon={<Cpu className="h-3.5 w-3.5" />} label="vCPU cores" value={String(stats.cores)} />
                    <StatTile icon={<MemoryStick className="h-3.5 w-3.5" />} label="Memory" value={formatMemory(stats.memoryMB)} />
                    <StatTile icon={<MapPin className="h-3.5 w-3.5" />} label="Regions" value={String(stats.regions)} />
                </div>
                {stats.servers === 0 && (
                    <p className="mt-3 text-[12px] text-white/40">
                        No servers running yet. Deploy your first VM above to get started.
                    </p>
                )}
            </section>
        </div>
    );
}

// ─── Subcomponents ────────────────────────────────────────────

function ServiceCard({
    href,
    title,
    description,
    features,
    accent,
    ctaLabel,
}: {
    href: string;
    title: string;
    description: string;
    features: string[];
    accent: "blue" | "amber";
    ctaLabel: string;
}) {
    const accentClass = accent === "blue" ? "text-[#0095FF]" : "text-amber-300";
    const accentBg =
        accent === "blue"
            ? "from-[#0095FF]/15 to-transparent"
            : "from-amber-400/15 to-transparent";
    const Icon = accent === "blue" ? Server : HardDrive;

    return (
        <Link
            href={href}
            className="group relative block rounded-lg border border-white/[0.08] bg-white/[0.015] hover:border-white/[0.16] hover:bg-white/[0.025] transition-colors overflow-hidden"
        >
            {/* subtle accent wash in top-right corner */}
            <div
                className={`pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gradient-to-br ${accentBg} blur-2xl opacity-60`}
                aria-hidden
            />
            <div className="relative p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className={`h-9 w-9 rounded-md border border-white/[0.08] bg-white/[0.04] flex items-center justify-center ${accentClass}`}>
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-white/30 group-hover:text-white/85 transition-colors" />
                </div>
                <h3 className="text-[17px] font-semibold text-white tracking-tight">{title}</h3>
                <p className="mt-1.5 text-[13px] text-white/55 leading-relaxed">{description}</p>

                <ul className="mt-5 space-y-1.5">
                    {features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-[12.5px] text-white/65">
                            <span className={`mt-1 h-1 w-1 rounded-full shrink-0 ${accent === "blue" ? "bg-[#0095FF]" : "bg-amber-300"}`} />
                            <span>{f}</span>
                        </li>
                    ))}
                </ul>

                <div className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white/85 group-hover:text-white transition-colors">
                    {ctaLabel}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
            </div>
        </Link>
    );
}

function StatTile({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-md border border-white/[0.08] bg-white/[0.015] px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-white/40 text-[10.5px] uppercase tracking-[0.14em]">
                {icon}
                <span>{label}</span>
            </div>
            <p className="mt-1.5 text-[20px] font-semibold text-white tabular-nums leading-none">
                {value}
            </p>
        </div>
    );
}
