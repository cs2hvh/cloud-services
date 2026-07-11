"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";

import { GAME_ICONS } from "@/components/dashboard/game/types";

interface Game {
  id: string;
  display_name: string;
  description: string | null;
  nest_id: number;
  egg_id: number;
  docker_image: string;
  credential_field: string | null;
  requires_eula: boolean;
  is_active: boolean;
  min_memory_mb: number;
  min_disk_gb: number;
  sort_order: number;
}

export default function GamesTab() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Game>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/game/catalog", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setGames(data.games);
      setDrafts(Object.fromEntries((data.games as Game[]).map((g) => [g.id, { ...g }])));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const edit = (id: string, key: keyof Game, value: string | number | boolean) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));

  const save = async (id: string) => {
    setSaving(id);
    try {
      const res = await fetch("/api/admin/game/catalog", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(drafts[id]) });
      const data = await res.json().catch(() => null);
      if (data?.ok) { toast.success(`Saved ${id}`); void load(); }
      else toast.error(data?.error || "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const del = async (id: string) => {
    if (!confirm(`Delete game "${id}"?`)) return;
    const res = await fetch(`/api/admin/game/catalog?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (data?.ok) { toast.success("Deleted"); void load(); }
    else toast.error(data?.error || "Delete failed");
  };

  if (games === null) return <div className="flex items-center py-16 text-white/40"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;

  const num = (v: number, on: (n: number) => void, w = "w-16") => (
    <input type="number" value={v} onChange={(e) => on(Number(e.target.value))} className={`${w} h-8 border border-white/[0.1] bg-[#0d0e11] px-2 text-[12.5px] text-white focus:border-[#0095FF]/50 focus:outline-none`} />
  );

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-white/45">{games.length} games. Egg/nest ids come from the Pterodactyl panel. Toggle a game off to hide it from the deploy wizard.</p>
      {games.map((g) => {
        const d = drafts[g.id] ?? g;
        return (
          <div key={g.id} className="border border-white/[0.08] bg-[#111216] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{GAME_ICONS[g.id] ?? "🎮"}</span>
                <div>
                  <p className="text-[14px] font-medium text-white">{g.display_name} <span className="font-[var(--font-geist-mono),monospace] text-[11px] text-white/30">{g.id}</span></p>
                  <p className="text-[11.5px] text-white/40">{g.docker_image || "no image"} · {g.credential_field ? `BYO ${g.credential_field}` : "no credential"}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-white/60">
                <input type="checkbox" checked={d.is_active} onChange={(e) => edit(g.id, "is_active", e.target.checked)} className="h-4 w-4 accent-[#0095FF]" />
                Active
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <Field label="Nest id">{num(d.nest_id, (n) => edit(g.id, "nest_id", n))}</Field>
              <Field label="Egg id">{num(d.egg_id, (n) => edit(g.id, "egg_id", n))}</Field>
              <Field label="Min RAM (MB)">{num(d.min_memory_mb, (n) => edit(g.id, "min_memory_mb", n), "w-20")}</Field>
              <Field label="Min disk (GB)">{num(d.min_disk_gb, (n) => edit(g.id, "min_disk_gb", n))}</Field>
              <Field label="Sort">{num(d.sort_order, (n) => edit(g.id, "sort_order", n), "w-14")}</Field>
              <div className="flex items-end gap-1.5">
                <button onClick={() => void save(g.id)} disabled={saving === g.id} className="inline-flex h-8 items-center gap-1 border border-white/[0.1] bg-white/[0.02] px-3 text-[12px] text-white hover:bg-white/[0.06]">
                  {saving === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                </button>
                <button onClick={() => void del(g.id)} className="inline-flex h-8 w-8 items-center justify-center border border-white/[0.08] text-white/40 hover:border-red-500/40 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[11px] text-white/40">Docker image
                <input value={d.docker_image} onChange={(e) => edit(g.id, "docker_image", e.target.value)} className="mt-1 h-8 w-full border border-white/[0.1] bg-[#0d0e11] px-2 text-[12.5px] text-white focus:border-[#0095FF]/50 focus:outline-none" />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] text-white/40">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
