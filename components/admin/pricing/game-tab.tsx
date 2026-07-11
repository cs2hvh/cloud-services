"use client";

// Admin — game server plans (prepaid monthly). Inline-editable price/specs per
// row, add/delete, active toggle. Writes go to /api/admin/pricing/game which
// invalidates the customer-facing plan cache.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

interface Plan {
  slug: string;
  game_type: string;
  name: string;
  tagline: string | null;
  cpu_pct: number;
  memory_mb: number;
  disk_gb: number;
  backups: number;
  extra_allocations: number;
  monthly_price: number | string;
  is_active: boolean;
  sort_order: number;
}

const EMPTY: Plan = {
  slug: "", game_type: "minecraft", name: "", tagline: "", cpu_pct: 200, memory_mb: 4096,
  disk_gb: 20, backups: 2, extra_allocations: 0, monthly_price: 8, is_active: true, sort_order: 99,
};

export default function GameTab() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Plan>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPlan, setNewPlan] = useState<Plan>(EMPTY);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/pricing/game", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setPlans(data.plans);
      setDrafts(Object.fromEntries((data.plans as Plan[]).map((p) => [p.slug, { ...p }])));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const editField = (slug: string, key: keyof Plan, value: string | number | boolean) => {
    setDrafts((d) => ({ ...d, [slug]: { ...d[slug], [key]: value } }));
  };

  const save = async (slug: string) => {
    setSavingSlug(slug);
    try {
      const res = await fetch("/api/admin/pricing/game", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(drafts[slug]),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) { toast.success(`Saved ${slug}`); void load(); }
      else toast.error(data?.error || "Save failed");
    } finally {
      setSavingSlug(null);
    }
  };

  const create = async () => {
    const res = await fetch("/api/admin/pricing/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPlan),
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) { toast.success("Plan created"); setAdding(false); setNewPlan(EMPTY); void load(); }
    else toast.error(data?.error || "Create failed");
  };

  const del = async (slug: string) => {
    if (!confirm(`Delete plan ${slug}?`)) return;
    const res = await fetch(`/api/admin/pricing/game?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (data?.ok) { toast.success("Deleted"); void load(); }
    else toast.error(data?.error || "Delete failed");
  };

  if (plans === null) return <div className="flex items-center py-16 text-neutral-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;

  const numInput = (value: number | string, onChange: (v: number) => void, w = "w-20") => (
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
      className={`${w} h-8 border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white focus:border-blue-500 focus:outline-none`} />
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-400">{plans.length} game plans · prepaid monthly</p>
        <button onClick={() => setAdding((a) => !a)} className="inline-flex h-9 items-center gap-2 border border-neutral-700 bg-neutral-900 px-3 text-sm text-white hover:bg-neutral-800">
          <Plus className="h-4 w-4" /> New plan
        </button>
      </div>

      {adding && (
        <div className="mb-4 grid grid-cols-2 gap-3 border border-blue-500/30 bg-blue-500/[0.04] p-4 sm:grid-cols-4">
          <label className="text-[12px] text-neutral-300">Slug<input value={newPlan.slug} onChange={(e) => setNewPlan({ ...newPlan, slug: e.target.value })} className="mt-1 h-8 w-full border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white" placeholder="mc-16g" /></label>
          <label className="text-[12px] text-neutral-300">Game<select value={newPlan.game_type} onChange={(e) => setNewPlan({ ...newPlan, game_type: e.target.value })} className="mt-1 h-8 w-full border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white"><option value="minecraft">minecraft</option><option value="rust">rust</option><option value="cs2">cs2</option><option value="fivem">fivem</option></select></label>
          <label className="text-[12px] text-neutral-300">Name<input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} className="mt-1 h-8 w-full border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white" /></label>
          <label className="text-[12px] text-neutral-300">$/mo<input type="number" value={newPlan.monthly_price} onChange={(e) => setNewPlan({ ...newPlan, monthly_price: Number(e.target.value) })} className="mt-1 h-8 w-full border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white" /></label>
          <label className="text-[12px] text-neutral-300">RAM (MB)<input type="number" value={newPlan.memory_mb} onChange={(e) => setNewPlan({ ...newPlan, memory_mb: Number(e.target.value) })} className="mt-1 h-8 w-full border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white" /></label>
          <label className="text-[12px] text-neutral-300">Disk (GB)<input type="number" value={newPlan.disk_gb} onChange={(e) => setNewPlan({ ...newPlan, disk_gb: Number(e.target.value) })} className="mt-1 h-8 w-full border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white" /></label>
          <label className="text-[12px] text-neutral-300">CPU %<input type="number" value={newPlan.cpu_pct} onChange={(e) => setNewPlan({ ...newPlan, cpu_pct: Number(e.target.value) })} className="mt-1 h-8 w-full border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white" /></label>
          <div className="flex items-end"><button onClick={() => void create()} className="h-9 w-full border border-blue-500/40 bg-blue-600 text-[13px] font-semibold text-white hover:bg-blue-500">Create</button></div>
        </div>
      )}

      <div className="overflow-x-auto border border-neutral-800">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/50 text-[11px] uppercase tracking-wide text-neutral-400">
              <th className="px-3 py-2.5">Slug</th><th className="px-3 py-2.5">Game</th><th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">$/mo</th><th className="px-3 py-2.5">RAM MB</th><th className="px-3 py-2.5">Disk GB</th>
              <th className="px-3 py-2.5">CPU %</th><th className="px-3 py-2.5">Backups</th><th className="px-3 py-2.5">Active</th><th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const d = drafts[p.slug] ?? p;
              return (
                <tr key={p.slug} className="border-b border-neutral-800/70">
                  <td className="px-3 py-2 font-mono text-neutral-300">{p.slug}</td>
                  <td className="px-3 py-2 text-neutral-400">{p.game_type}</td>
                  <td className="px-3 py-2"><input value={d.name} onChange={(e) => editField(p.slug, "name", e.target.value)} className="h-8 w-36 border border-neutral-700 bg-neutral-900 px-2 text-[13px] text-white" /></td>
                  <td className="px-3 py-2">{numInput(d.monthly_price, (v) => editField(p.slug, "monthly_price", v), "w-16")}</td>
                  <td className="px-3 py-2">{numInput(d.memory_mb, (v) => editField(p.slug, "memory_mb", v))}</td>
                  <td className="px-3 py-2">{numInput(d.disk_gb, (v) => editField(p.slug, "disk_gb", v), "w-16")}</td>
                  <td className="px-3 py-2">{numInput(d.cpu_pct, (v) => editField(p.slug, "cpu_pct", v), "w-16")}</td>
                  <td className="px-3 py-2">{numInput(d.backups, (v) => editField(p.slug, "backups", v), "w-14")}</td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={d.is_active} onChange={(e) => editField(p.slug, "is_active", e.target.checked)} className="h-4 w-4 accent-blue-500" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => void save(p.slug)} disabled={savingSlug === p.slug} className="inline-flex h-8 items-center gap-1 border border-neutral-700 bg-neutral-900 px-2.5 text-[12px] text-white hover:bg-neutral-800">
                        {savingSlug === p.slug ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                      </button>
                      <button onClick={() => void del(p.slug)} className="inline-flex h-8 w-8 items-center justify-center border border-neutral-700 text-neutral-400 hover:border-red-500/40 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
