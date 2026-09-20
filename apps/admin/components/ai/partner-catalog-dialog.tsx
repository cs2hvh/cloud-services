"use client";

// What each partner can serve, beside what we already list.
//
// Two facts this answers that nothing else does: which models we could sell
// but do not, and - now that routing is strict - which models we route to a
// partner who has stopped offering them. The second is an outage waiting for
// its first request, so it leads.
//
// A partner we cannot reach is shown as UNKNOWN, never as an empty list.
// "They serve nothing" and "this host has no key for them" are different
// facts and only one is an emergency.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type PartnerStatus = {
  partner: string;
  reachable: boolean;
  unknown: boolean;
  reason: string | null;
  count: number;
};

type UnionRow = {
  id: string;
  name: string | null;
  offeredBy: string[];
  inCatalogue: boolean;
  ourModelId: string | null;
  routedTo: string | null;
  isActive: boolean | null;
};

type Feed = {
  partners: PartnerStatus[];
  summary: {
    union: number;
    onBoth: number;
    alreadyCarried: number;
    newToUs: number;
    routedToPartnerNotOffering: {
      modelId: string;
      provider: string | null;
      upstreamId: string | null;
    }[];
  };
  rows: UnionRow[];
};

type AddDraft = {
  upstreamId: string;
  provider: string;
  modelId: string;
  displayName: string;
  input: string;
  output: string;
};

export function PartnerCatalogDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (changed: boolean) => void;
}) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyNew, setOnlyNew] = useState(true);
  const [draft, setDraft] = useState<AddDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Feed>("/admin/ai/models/partner-catalog");
      setFeed(res.data);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      setError(msg || "Could not load partner catalogues");
      setFeed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (feed?.rows ?? []).filter((r) => {
      if (onlyNew && r.inCatalogue) return false;
      if (q && !r.id.toLowerCase().includes(q) && !(r.name ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [feed, search, onlyNew]);

  const startAdd = (r: UnionRow) => {
    const bare = r.id.split("/").pop() ?? r.id;
    setDraft({
      upstreamId: r.id,
      // Preselected from whoever offers it; if both do, the first is a
      // starting point the operator can change, not a decision made for them.
      provider: r.offeredBy[0] ?? "",
      modelId: r.id.includes("/") ? r.id.toLowerCase() : `partner/${bare.toLowerCase()}`,
      displayName: r.name ?? bare,
      input: "",
      output: "",
    });
  };

  const submitAdd = async () => {
    if (!draft) return;
    if (draft.input.trim() === "" || draft.output.trim() === "") {
      toast.error("Input and output prices are required — an unpriced model bills nothing");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/ai/models", {
        model_id: draft.modelId.trim().toLowerCase(),
        display_name: draft.displayName.trim(),
        upstream_model_id: draft.upstreamId,
        serving_type: "proxy",
        upstream_provider: draft.provider,
        pricing: {
          input_cents_per_mtok: Number(draft.input),
          output_cents_per_mtok: Number(draft.output),
        },
        is_active: false,
      });
      toast.success(`${draft.modelId} added — inactive until you publish it`);
      setAdded(true);
      setDraft(null);
      void load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      toast.error(msg || "Could not add the model");
    } finally {
      setSaving(false);
    }
  };

  const s = feed?.summary;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(added)}>
      <DialogContent className="max-h-[92vh] w-[min(1000px,96vw)] max-w-none overflow-hidden">
        <DialogHeader>
          <DialogTitle>Partner catalogues</DialogTitle>
        </DialogHeader>

        <p className="text-[11.5px] text-muted-foreground">
          Everything our partners can serve, from their own{" "}
          <span className={MONO}>/v1/models</span>. Operator-only — partner
          names never appear on a customer surface. Adding from here copies
          the exact upstream id, which is the part that is easy to get wrong.
        </p>

        <div className="flex flex-wrap gap-2 border-y border-white/[0.06] py-2.5">
          {feed?.partners.map((p) => (
            <span
              key={p.partner}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                p.reachable
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-white/[0.15] bg-white/[0.04] text-white/60"
              }`}
              title={p.reason ?? undefined}
            >
              {p.partner}:{" "}
              {p.reachable ? `${p.count} models` : "unknown"}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyNew}
                onChange={(e) => setOnlyNew(e.target.checked)}
                className="accent-[#3987e5]"
              />
              Not in our catalogue
            </label>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* An unreachable partner is stated, not implied by a short list. */}
        {feed?.partners
          .filter((p) => p.unknown)
          .map((p) => (
            <p
              key={p.partner}
              className="rounded-md border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-[11.5px] text-muted-foreground"
            >
              <strong className="text-foreground">{p.partner} is unknown</strong> —{" "}
              {p.reason}. Its models are missing from the list below; that is a
              gap in what we can see, not a gap in what they serve.
            </p>
          ))}

        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {/* Strict routing means this is an outage waiting for a request. */}
        {s && s.routedToPartnerNotOffering.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>
                {s.routedToPartnerNotOffering.length} live model(s) route to a
                partner who does not list them
              </strong>{" "}
              — with no failover, the next request for these fails:{" "}
              {s.routedToPartnerNotOffering
                .slice(0, 6)
                .map((r) => `${r.modelId} → ${r.provider}`)
                .join(", ")}
              {s.routedToPartnerNotOffering.length > 6 && " …"}
            </span>
          </div>
        )}

        {draft ? (
          <div className="space-y-3 rounded-md border border-white/[0.1] bg-white/[0.02] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Add {draft.upstreamId}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="a-mid">Our model id</Label>
                <Input
                  id="a-mid"
                  value={draft.modelId}
                  onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
                  className={MONO}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-name">Display name</Label>
                <Input
                  id="a-name"
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-in">Input (cents per Mtok)</Label>
                <Input
                  id="a-in"
                  inputMode="decimal"
                  value={draft.input}
                  onChange={(e) => setDraft({ ...draft, input: e.target.value })}
                  className={MONO}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-out">Output (cents per Mtok)</Label>
                <Input
                  id="a-out"
                  inputMode="decimal"
                  value={draft.output}
                  onChange={(e) => setDraft({ ...draft, output: e.target.value })}
                  className={MONO}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Carried by <strong>{draft.provider}</strong>, sent upstream as{" "}
              <span className={MONO}>{draft.upstreamId}</span>. Created{" "}
              <strong>inactive</strong> — nothing has confirmed the partner
              answers to that name yet, so publish it only once a request has.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void submitAdd()} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Add to catalogue
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by id or name"
              className="h-8 pl-8 text-[12px]"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-white/[0.06]">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 z-10 bg-[#0d0d0f] text-left text-muted-foreground">
              <tr className="border-b border-white/[0.06]">
                <th className="px-2 py-2 font-medium">Upstream id</th>
                <th className="px-2 py-2 font-medium">Offered by</th>
                <th className="px-2 py-2 font-medium">In our catalogue</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground">
                    {feed?.partners.every((p) => p.unknown)
                      ? "No partner could be reached from this host."
                      : "Nothing matches."}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04]">
                  <td className={`px-2 py-1.5 align-top ${MONO}`}>
                    {r.id}
                    {r.name && r.name !== r.id && (
                      <div className="mt-0.5 font-sans text-[10px] text-muted-foreground/70">
                        {r.name}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex flex-wrap gap-1">
                      {r.offeredBy.map((p) => (
                        <span
                          key={p}
                          className="rounded border border-white/[0.12] px-1 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {r.inCatalogue ? (
                      <span className={`${MONO} text-[10.5px] text-muted-foreground`}>
                        {r.ourModelId}
                        <span className="ml-1.5 font-sans">
                          {r.isActive ? (
                            <span className="text-emerald-300/80">live</span>
                          ) : (
                            <span className="text-white/50">delisted</span>
                          )}
                          {r.routedTo && ` · via ${r.routedTo}`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right align-top">
                    {!r.inCatalogue && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => startAdd(r)}
                      >
                        Add
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <span className="mr-auto text-[11.5px] text-muted-foreground">
            {s &&
              `${s.union} models across partners · ${s.alreadyCarried} already ours · ${s.newToUs} new · ${s.onBoth} on both`}
          </span>
          <Button variant="ghost" onClick={() => onClose(added)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
