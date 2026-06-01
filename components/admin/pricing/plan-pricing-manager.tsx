"use client";

// Admin UI for the instance_plans catalog.
//
// Lists every plan (including inactive) with full inline editing —
// name, tier, vCPU, RAM, disk, hourly + monthly price, tagline,
// active toggle, sort order. Edits stage locally until "Save row".
// "Add plan" appends a new row with sensible defaults, then save
// to commit.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Check, ChevronDown, Globe, Loader2, Plus, Power, PowerOff, Save, Server, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Plan = {
    slug: string;
    name: string;
    tier: "shared" | "dedicated";
    vcpu: number;
    memory_mb: number;
    disk_gb: number;
    hourly_usd: number;
    monthly_usd: number;
    tagline: string | null;
    is_active: boolean;
    sort_order: number;
    allowed_regions: string[] | null;
    allowed_host_ids: string[] | null;
};

type Draft = Plan & { _isNew?: boolean; _dirty?: boolean };

const blankDraft = (): Draft => ({
    slug: "",
    name: "",
    tier: "shared",
    vcpu: 1,
    memory_mb: 1024,
    disk_gb: 20,
    hourly_usd: 0.01,
    monthly_usd: 7,
    tagline: null,
    is_active: true,
    sort_order: 99,
    allowed_regions: null,
    allowed_host_ids: null,
    _isNew: true,
    _dirty: true,
});

type RegionRef = { slug: string; label: string };
type HostRef = { id: string; name: string; region: string | null };

export function PlanPricingManager() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [newDraft, setNewDraft] = useState<Draft | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingSlug, setSavingSlug] = useState<string | null>(null);
    const [filter, setFilter] = useState<"all" | "shared" | "dedicated" | "inactive">("all");
    const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

    // Region + host references for the restriction selectors.
    // Loaded once alongside plans.
    const [regions, setRegions] = useState<RegionRef[]>([]);
    const [hosts, setHosts] = useState<HostRef[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [plansRes, hostsRes] = await Promise.all([
                fetch("/api/admin/pricing/plans", { cache: "no-store" }),
                fetch("/api/admin/proxmox/hosts", { cache: "no-store" }),
            ]);
            const plansData = await plansRes.json();
            if (!plansData.ok) throw new Error(plansData.error || "Failed to load plans");
            setPlans(plansData.plans);
            const d: Record<string, Draft> = {};
            for (const p of plansData.plans as Plan[]) d[p.slug] = { ...p };
            setDrafts(d);

            // Hosts list (used for the host whitelist selector). Tolerate
            // failure — restriction editing just stays text-only.
            if (hostsRes.ok) {
                const hostsData = await hostsRes.json();
                const hostRows = (hostsData?.hosts ?? []) as Array<{
                    id: string; name: string; region?: string | null; display_region?: string | null;
                }>;
                setHosts(hostRows.map((h) => ({ id: h.id, name: h.name, region: h.region ?? null })));
                const regionMap = new Map<string, string>();
                for (const h of hostRows) {
                    const slug = h.region ?? "default";
                    const label = h.display_region ?? slug;
                    if (!regionMap.has(slug)) regionMap.set(slug, label);
                }
                setRegions([...regionMap.entries()].map(([slug, label]) => ({ slug, label })));
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const update = useCallback((slug: string, patch: Partial<Draft>) => {
        setDrafts((prev) => ({
            ...prev,
            [slug]: { ...prev[slug], ...patch, _dirty: true },
        }));
    }, []);

    const saveRow = useCallback(async (slug: string) => {
        const d = drafts[slug];
        if (!d) return;
        setSavingSlug(slug);
        try {
            const res = await fetch("/api/admin/pricing/plans", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slug: d.slug, name: d.name, tier: d.tier,
                    vcpu: d.vcpu, memory_mb: d.memory_mb, disk_gb: d.disk_gb,
                    hourly_usd: d.hourly_usd, monthly_usd: d.monthly_usd,
                    tagline: d.tagline, is_active: d.is_active, sort_order: d.sort_order,
                    allowed_regions: d.allowed_regions,
                    allowed_host_ids: d.allowed_host_ids,
                }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || "Save failed");
            toast.success(`Saved ${slug}`);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSavingSlug(null);
        }
    }, [drafts, load]);

    const createNew = useCallback(async () => {
        if (!newDraft) return;
        setSavingSlug("__new__");
        try {
            const res = await fetch("/api/admin/pricing/plans", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slug: newDraft.slug, name: newDraft.name, tier: newDraft.tier,
                    vcpu: newDraft.vcpu, memory_mb: newDraft.memory_mb, disk_gb: newDraft.disk_gb,
                    hourly_usd: newDraft.hourly_usd, monthly_usd: newDraft.monthly_usd,
                    tagline: newDraft.tagline, is_active: newDraft.is_active, sort_order: newDraft.sort_order,
                    allowed_regions: newDraft.allowed_regions,
                    allowed_host_ids: newDraft.allowed_host_ids,
                }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || "Create failed");
            toast.success(`Created ${newDraft.slug}`);
            setNewDraft(null);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Create failed");
        } finally {
            setSavingSlug(null);
        }
    }, [newDraft, load]);

    const deleteRow = useCallback(async (slug: string) => {
        if (!confirm(`Delete plan "${slug}"?\n\nWill be refused if any active server references it.`)) return;
        try {
            const res = await fetch(`/api/admin/pricing/plans?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || "Delete failed");
            toast.success(`Deleted ${slug}`);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed");
        }
    }, [load]);

    const toggleActive = useCallback(async (slug: string) => {
        const d = drafts[slug];
        if (!d) return;
        // Build the new value as a local variable — don't rely on
        // state being updated before we read it back inside saveRow
        // (setState is async, the closure would still see the old).
        const nextActive = !d.is_active;
        // Optimistic UI flip so the icon swaps immediately
        setDrafts((prev) => ({
            ...prev,
            [slug]: { ...prev[slug], is_active: nextActive, _dirty: false },
        }));
        setSavingSlug(slug);
        try {
            const res = await fetch("/api/admin/pricing/plans", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slug: d.slug,
                    name: d.name,
                    tier: d.tier,
                    vcpu: d.vcpu,
                    memory_mb: d.memory_mb,
                    disk_gb: d.disk_gb,
                    hourly_usd: d.hourly_usd,
                    monthly_usd: d.monthly_usd,
                    tagline: d.tagline,
                    is_active: nextActive, // ← the new value, not the stale one
                    sort_order: d.sort_order,
                    allowed_regions: d.allowed_regions,
                    allowed_host_ids: d.allowed_host_ids,
                }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || "Toggle failed");
            toast.success(`${slug} ${nextActive ? "activated" : "deactivated"}`);
            await load();
        } catch (e) {
            // Revert the optimistic flip on failure
            setDrafts((prev) => ({
                ...prev,
                [slug]: { ...prev[slug], is_active: !nextActive, _dirty: false },
            }));
            toast.error(e instanceof Error ? e.message : "Toggle failed");
        } finally {
            setSavingSlug(null);
        }
    }, [drafts, load]);

    // Filter rows
    const filtered = useMemo(() => {
        const rows = Object.values(drafts);
        switch (filter) {
            case "shared": return rows.filter((p) => p.tier === "shared" && p.is_active);
            case "dedicated": return rows.filter((p) => p.tier === "dedicated" && p.is_active);
            case "inactive": return rows.filter((p) => !p.is_active);
            default: return rows;
        }
    }, [drafts, filter]);

    const sorted = useMemo(
        () => [...filtered].sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug)),
        [filtered]
    );

    return (
        <div className="space-y-5">
            {/* Top controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-black/30 p-0.5">
                    {(["all", "shared", "dedicated", "inactive"] as const).map((f) => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 text-[12px] font-medium rounded-[5px] transition-colors capitalize ${
                                filter === f ? "bg-white/[0.08] text-white" : "text-white/55 hover:text-white"
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <Button
                    onClick={() => setNewDraft(blankDraft())}
                    size="sm"
                    disabled={!!newDraft}
                    className="bg-[#0095FF] hover:bg-[#0aa0ff] text-white disabled:opacity-40"
                >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add plan
                </Button>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-white/[0.08] bg-black/30 overflow-x-auto">
                <table className="w-full min-w-[1400px]">
                    <thead>
                        <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.16em] text-white/40">
                            <Th>Slug</Th>
                            <Th>Name</Th>
                            <Th>Tier</Th>
                            <Th right>vCPU</Th>
                            <Th right>RAM&nbsp;GB</Th>
                            <Th right>Disk&nbsp;GB</Th>
                            <Th right>$/hr</Th>
                            <Th right>$/mo</Th>
                            <Th>Tagline</Th>
                            <Th center>Order</Th>
                            <Th center>Active</Th>
                            <Th center>Limits</Th>
                            <Th right>Actions</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={13} className="py-10 text-center">
                                <Loader2 className="h-4 w-4 mx-auto animate-spin text-white/40" />
                            </td></tr>
                        )}
                        {!loading && newDraft && (
                            <PlanRow
                                draft={newDraft}
                                isNew
                                saving={savingSlug === "__new__"}
                                regions={regions}
                                hosts={hosts}
                                expanded
                                onToggleExpand={() => { /* always expanded for new */ }}
                                onChange={(patch) => setNewDraft({ ...newDraft, ...patch, _dirty: true })}
                                onSave={createNew}
                                onCancel={() => setNewDraft(null)}
                                onDelete={() => setNewDraft(null)}
                                onToggleActive={() => setNewDraft({ ...newDraft, is_active: !newDraft.is_active, _dirty: true })}
                            />
                        )}
                        {!loading && sorted.map((p) => (
                            <PlanRow
                                key={p.slug}
                                draft={p}
                                saving={savingSlug === p.slug}
                                regions={regions}
                                hosts={hosts}
                                expanded={expandedSlug === p.slug}
                                onToggleExpand={() => setExpandedSlug(expandedSlug === p.slug ? null : p.slug)}
                                onChange={(patch) => update(p.slug, patch)}
                                onSave={() => saveRow(p.slug)}
                                onCancel={() => {
                                    const orig = plans.find((x) => x.slug === p.slug);
                                    if (orig) update(p.slug, { ...orig, _dirty: false });
                                }}
                                onDelete={() => deleteRow(p.slug)}
                                onToggleActive={() => toggleActive(p.slug)}
                            />
                        ))}
                        {!loading && sorted.length === 0 && !newDraft && (
                            <tr><td colSpan={13} className="py-10 text-center text-white/45 text-sm">
                                No plans match the current filter.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-[11.5px] text-white/40 leading-relaxed">
                Plans live in <code className="text-white/55">instance_plans</code>. Changes propagate to the customer
                dashboard within 60s (cache TTL). Deleting a plan is blocked while any active server still references
                it — disable instead. <span className="text-white/30">Slug is immutable after creation.</span>
            </p>
        </div>
    );
}

// ─── Row + helpers ───────────────────────────────────────────────

function Th({
    children,
    right,
    center,
}: {
    children: React.ReactNode;
    right?: boolean;
    center?: boolean;
}) {
    return (
        <th
            className={`px-3 py-2.5 font-semibold ${
                right ? "text-right" : center ? "text-center" : "text-left"
            }`}
        >
            {children}
        </th>
    );
}

function PlanRow({
    draft, isNew, saving, regions, hosts, expanded, onToggleExpand,
    onChange, onSave, onCancel, onDelete, onToggleActive,
}: {
    draft: Draft;
    isNew?: boolean;
    saving: boolean;
    regions: RegionRef[];
    hosts: HostRef[];
    expanded: boolean;
    onToggleExpand: () => void;
    onChange: (patch: Partial<Draft>) => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete: () => void;
    onToggleActive: () => void;
}) {
    const dirty = !!draft._dirty;
    const hasRegionRestriction = !!(draft.allowed_regions && draft.allowed_regions.length > 0);
    const hasHostRestriction = !!(draft.allowed_host_ids && draft.allowed_host_ids.length > 0);
    return (
        <>
        <tr
            className={`border-b border-white/[0.04] last:border-b-0 transition-colors ${
                isNew ? "bg-[#0095FF]/[0.04]" : draft.is_active ? "" : "opacity-55"
            }`}
        >
            <td className="px-3 py-2 align-middle min-w-[100px]">
                {isNew ? (
                    <Input
                        value={draft.slug}
                        onChange={(e) => onChange({ slug: e.target.value })}
                        placeholder="s-8"
                        className="h-8 text-[13px] font-mono bg-black/40 border-white/10 text-white px-2"
                    />
                ) : (
                    <span className="font-mono text-[13px] text-white/95">{draft.slug}</span>
                )}
            </td>
            <td className="px-3 py-2 align-middle min-w-[160px]">
                <Input
                    value={draft.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    placeholder="Plan name"
                    className="h-8 text-[13px] bg-black/40 border-white/10 text-white px-2"
                />
            </td>
            <td className="px-3 py-2 align-middle min-w-[130px]">
                <Select value={draft.tier} onValueChange={(v) => onChange({ tier: v as "shared" | "dedicated" })}>
                    <SelectTrigger className="h-8 text-[12.5px] bg-black/40 border-white/10 text-white px-2">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="shared">Shared</SelectItem>
                        <SelectItem value="dedicated">Dedicated</SelectItem>
                    </SelectContent>
                </Select>
            </td>
            <td className="px-3 py-2 align-middle">
                <NumberCell
                    value={draft.vcpu}
                    onChange={(v) => onChange({ vcpu: v })}
                    step={1}
                    minWidth="w-20"
                />
            </td>
            <td className="px-3 py-2 align-middle">
                <NumberCell
                    value={draft.memory_mb / 1024}
                    onChange={(v) => onChange({ memory_mb: Math.round(v * 1024) })}
                    step={0.5}
                    minWidth="w-24"
                />
            </td>
            <td className="px-3 py-2 align-middle">
                <NumberCell
                    value={draft.disk_gb}
                    onChange={(v) => onChange({ disk_gb: v })}
                    step={10}
                    minWidth="w-24"
                />
            </td>
            <td className="px-3 py-2 align-middle">
                <NumberCell
                    value={draft.hourly_usd}
                    onChange={(v) => onChange({ hourly_usd: v })}
                    step={0.001}
                    prefix="$"
                    minWidth="w-28"
                />
            </td>
            <td className="px-3 py-2 align-middle">
                <NumberCell
                    value={draft.monthly_usd}
                    onChange={(v) => onChange({ monthly_usd: v })}
                    step={0.5}
                    prefix="$"
                    minWidth="w-28"
                />
            </td>
            <td className="px-3 py-2 align-middle min-w-[180px]">
                <Input
                    value={draft.tagline ?? ""}
                    onChange={(e) => onChange({ tagline: e.target.value })}
                    placeholder="Optional"
                    className="h-8 text-[12.5px] bg-black/40 border-white/10 text-white/85 px-2"
                />
            </td>
            <td className="px-3 py-2 align-middle">
                <NumberCell
                    value={draft.sort_order}
                    onChange={(v) => onChange({ sort_order: v })}
                    step={1}
                    minWidth="w-16"
                    center
                />
            </td>
            <td className="px-3 py-2 align-middle text-center">
                <button
                    type="button"
                    onClick={onToggleActive}
                    title={draft.is_active ? "Deactivate" : "Activate"}
                    className={`h-7 w-7 rounded-[5px] inline-flex items-center justify-center transition-colors ${
                        draft.is_active
                            ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                            : "bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/75"
                    }`}
                >
                    {draft.is_active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                </button>
            </td>
            <td className="px-3 py-2 align-middle text-center">
                <button
                    type="button"
                    onClick={onToggleExpand}
                    title="Region / host restrictions"
                    className={`h-7 px-2 inline-flex items-center gap-1 rounded-[5px] transition-colors ${
                        hasRegionRestriction || hasHostRestriction
                            ? "bg-amber-400/15 text-amber-300 hover:bg-amber-400/25"
                            : "bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white/80"
                    }`}
                >
                    {hasRegionRestriction && <Globe className="h-3 w-3" />}
                    {hasHostRestriction && <Server className="h-3 w-3" />}
                    {!hasRegionRestriction && !hasHostRestriction && (
                        <span className="text-[10px] uppercase tracking-wider">any</span>
                    )}
                    <ChevronDown
                        className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                </button>
            </td>
            <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                <div className="inline-flex items-center gap-1">
                    {(dirty || isNew) && (
                        <>
                            <Button
                                onClick={onSave}
                                size="sm"
                                disabled={saving}
                                className="h-7 px-2 bg-[#0095FF] hover:bg-[#0aa0ff] text-white text-[11px]"
                                title={isNew ? "Create plan" : "Save changes"}
                            >
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            </Button>
                            <Button
                                onClick={onCancel}
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 border-white/10 bg-white/[0.03] text-white/55 hover:text-white"
                                title="Cancel"
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </>
                    )}
                    {!isNew && !dirty && (
                        <Button
                            onClick={onDelete}
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 border-red-500/20 bg-red-500/[0.06] text-red-300/80 hover:bg-red-500/15 hover:text-red-200"
                            title="Delete plan"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    )}
                    {!isNew && !dirty && (
                        <Check className="h-3.5 w-3.5 text-white/20 ml-1" />
                    )}
                </div>
            </td>
        </tr>
        {expanded && (
            <tr className="border-b border-white/[0.04]">
                <td colSpan={13} className="bg-black/40 px-4 py-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <RestrictionSelector
                            label="Allowed regions"
                            icon={<Globe className="h-3.5 w-3.5" />}
                            options={regions.map((r) => ({ value: r.slug, label: r.label, secondary: r.slug }))}
                            selected={draft.allowed_regions ?? []}
                            onChange={(next) =>
                                onChange({ allowed_regions: next.length > 0 ? next : null })
                            }
                            emptyMessage="No regions configured yet."
                            unrestrictedHint="Empty = available in every region."
                        />
                        <RestrictionSelector
                            label="Allowed hosts"
                            icon={<Server className="h-3.5 w-3.5" />}
                            options={hosts.map((h) => ({
                                value: h.id,
                                label: h.name,
                                secondary: h.region ?? "",
                            }))}
                            selected={draft.allowed_host_ids ?? []}
                            onChange={(next) =>
                                onChange({ allowed_host_ids: next.length > 0 ? next : null })
                            }
                            emptyMessage="No hosts available."
                            unrestrictedHint="Empty = available on any host (subject to capacity)."
                        />
                    </div>
                    <p className="mt-3 text-[11px] text-white/40">
                        Whitelist either to limit availability. Both checks must pass — region filter applies
                        first, then the host filter narrows further. Changes save with the rest of the row.
                    </p>
                </td>
            </tr>
        )}
        </>
    );
}

function RestrictionSelector({
    label, icon, options, selected, onChange, emptyMessage, unrestrictedHint,
}: {
    label: string;
    icon: React.ReactNode;
    options: Array<{ value: string; label: string; secondary?: string }>;
    selected: string[];
    onChange: (next: string[]) => void;
    emptyMessage: string;
    unrestrictedHint: string;
}) {
    const selectedSet = new Set(selected);
    const toggle = (value: string) => {
        if (selectedSet.has(value)) {
            onChange(selected.filter((v) => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45">
                    {icon}
                    {label}
                </div>
                {selected.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        className="text-[10.5px] text-white/40 hover:text-white/75 transition-colors"
                    >
                        Clear ({selected.length})
                    </button>
                )}
            </div>
            {options.length === 0 ? (
                <p className="text-[11.5px] text-white/35">{emptyMessage}</p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {options.map((opt) => {
                        const isSel = selectedSet.has(opt.value);
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggle(opt.value)}
                                className={`px-2.5 py-1 rounded text-[11.5px] border transition-colors ${
                                    isSel
                                        ? "border-[#0095FF]/40 bg-[#0095FF]/15 text-white"
                                        : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05] hover:text-white"
                                }`}
                            >
                                {opt.label}
                                {opt.secondary && opt.secondary !== opt.label && (
                                    <span className="ml-1 text-white/35">· {opt.secondary}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
            <p className="mt-2 text-[10.5px] text-white/35">{unrestrictedHint}</p>
        </div>
    );
}

function NumberCell({
    value, onChange, step, prefix, minWidth = "w-20", center,
}: {
    value: number;
    onChange: (v: number) => void;
    step: number;
    prefix?: string;
    minWidth?: string;
    center?: boolean;
}) {
    return (
        <div className={`relative ${minWidth}`}>
            {prefix && (
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-white/40">{prefix}</span>
            )}
            <Input
                type="number"
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`h-8 text-[13px] font-mono bg-black/40 border-white/10 text-white tabular-nums px-2 ${
                    prefix ? "pl-6" : ""
                } ${center ? "text-center" : "text-right"}`}
            />
        </div>
    );
}
