"use client";

// Every model either partner can serve, and a tick to decide who sees it.
//
// One row per model id, unioned from Starimg's /models, Wokey's /models and
// our own catalogue. The catalogue side matters as much as the partners':
// a model switched off yesterday is a row here that is simply not ticked,
// rather than something that vanished from the one screen that could bring
// it back.
//
// The two partner ticks are a RADIO, not two checkboxes. The gateway reads
// one upstream_provider per request and there is no fallback, so one public
// model id is served by exactly one partner. Ticking the other flips it.
//
// Partner names and per-partner cost are operator-only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@admin/components/page-header";
import { AiTabs } from "@admin/components/ai/ai-tabs";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
/** One public model id is served by exactly one of these. */
type PartnerName = "starimg" | "wokey" | "abliteration" | "audn";
/** Reached through per-key endpoint rows rather than a shared API. */
const ENDPOINT_PARTNERS: readonly string[] = ["abliteration", "audn"];

type Carriage = {
  carries: boolean | null;
  cost: { input: number | null; output: number | null } | null;
  configured?: { total: number; enabled: number; up: number } | null;
};

type Row = {
  key: string;
  modelUuid: string | null;
  ourModelId: string | null;
  displayName: string;
  upstreamModelId: string | null;
  servingType: string | null;
  modality: string | null;
  inCatalogue: boolean;
  isActive: boolean | null;
  servedBy: string | null;
  partnerRoutable: boolean;
  /** The partner is fixed by its endpoint keys; only visibility is ours. */
  partnerIsFixed: boolean;
  partners: Record<string, Carriage>;
  liveButUnlisted: boolean;
};

type Feed = {
  partners: {
    partner: PartnerName;
    reachable: boolean;
    reason: string | null;
    count: number;
    baseUrl: string;
    evidence: "models_api" | "endpoints";
  }[];
  summary: {
    total: number;
    live: number;
    hidden: number;
    notCarried: number;
    liveButUnlisted: number;
  };
  rows: Row[];
};

type AddDraft = {
  row: Row;
  partner: PartnerName;
  modelId: string;
  displayName: string;
  input: string;
  output: string;
};

const cents = (n: number | null | undefined) =>
  typeof n === "number" ? `${n}¢` : "—";

export function PartnerModelsView() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Feed>("/admin/ai/models/partner-catalog");
      setFeed(res.data);
      setError(null);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      setError(msg || "Could not load the partner catalogue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (feed?.rows ?? []).filter((r) => {
      if (view === "live" && !r.isActive) return false;
      if (view === "hidden" && !(r.inCatalogue && !r.isActive)) return false;
      if (view === "new" && r.inCatalogue) return false;
      if (
        q &&
        !r.key.toLowerCase().includes(q) &&
        !r.displayName.toLowerCase().includes(q) &&
        !(r.upstreamModelId ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [feed, search, view]);

  /** Tick: enable this model on this partner. Untick: hide it. */
  const setServing = async (row: Row, partner: PartnerName | null) => {
    if (!row.modelUuid) return;
    setBusy(row.key);
    try {
      await api.patch(`/admin/ai/models/${row.modelUuid}`, {
        is_active: partner !== null,
        // Its partner is decided by which endpoint keys exist, so sending
        // one here would be claiming a choice we do not have.
        ...(partner && !row.partnerIsFixed ? { upstream_provider: partner } : {}),
      });
      toast.success(
        partner
          ? `${row.ourModelId} is live on ${partner}`
          : `${row.ourModelId} hidden from customers`,
      );
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      toast.error(msg || "Could not change this model");
    } finally {
      setBusy(null);
    }
  };

  const startAdd = (row: Row, partner: PartnerName) => {
    const raw = row.upstreamModelId ?? row.key;
    const bare = raw.split("/").pop() ?? raw;
    setDraft({
      row,
      partner,
      // Ours are namespaced; partners are not always. Keep their namespace
      // when they have one, otherwise the operator supplies the vendor.
      modelId: raw.includes("/") ? raw.toLowerCase() : bare.toLowerCase(),
      displayName: row.displayName,
      input: "",
      output: "",
    });
  };

  const submitAdd = async () => {
    if (!draft) return;
    if (!draft.modelId.includes("/")) {
      toast.error("Model id must be namespaced, e.g. vendor/model-name");
      return;
    }
    if (draft.input.trim() === "" || draft.output.trim() === "") {
      toast.error("Set a price — an enabled model with no price bills nothing");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/ai/models", {
        model_id: draft.modelId.trim().toLowerCase(),
        display_name: draft.displayName.trim() || draft.modelId,
        upstream_model_id: draft.row.upstreamModelId ?? draft.row.key,
        serving_type: "proxy",
        upstream_provider: draft.partner,
        pricing: {
          input_cents_per_mtok: Number(draft.input),
          output_cents_per_mtok: Number(draft.output),
        },
        is_active: true,
      });
      toast.success(`${draft.modelId} added and live on ${draft.partner}`);
      setDraft(null);
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      toast.error(msg || "Could not add the model");
    } finally {
      setSaving(false);
    }
  };

  const s = feed?.summary;
  const reachable = useMemo(
    () => new Map((feed?.partners ?? []).map((p) => [p.partner, p.reachable])),
    [feed],
  );

  /** One partner cell: a radio, a dash, or an honest "unknown". */
  const PartnerCell = ({ row, partner }: { row: Row; partner: PartnerName }) => {
    const c = row.partners?.[partner];
    const ticked = row.isActive === true && row.servedBy === partner;
    const working = busy === row.key;

    if (!row.partnerRoutable && row.inCatalogue) {
      return (
        <span className="text-[10.5px] text-muted-foreground/60" title="Served from our own pods, not a partner">
          our pods
        </span>
      );
    }

    // Unknown is not "no". A partner we hold no key for cannot be asked, and
    // showing that as an empty column would read as "they dropped it".
    if (c?.carries === null) {
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`serve-${row.key}`}
            checked={ticked}
            disabled={working || !row.modelUuid}
            onChange={() => void setServing(row, partner)}
            className="accent-[#3987e5]"
          />
          <span
            className="text-[10px] text-white/45"
            title={
              reachable.get(partner)
                ? `${partner}'s model list only covers chat models, so it says nothing about a ${row.modality ?? "media"} model either way. Not listed is not the same as not carried — these are served today.`
                : `No key for ${partner} on this host, so the panel could not ask. Our catalogue may still know they carry it.`
            }
          >
            unknown
          </span>
        </div>
      );
    }

    if (c?.carries === false) {
      const endpointPartner = ENDPOINT_PARTNERS.includes(partner);
      return (
        <span
          className="text-[10.5px] text-muted-foreground/40"
          title={
            endpointPartner
              ? `No ${partner} keys are configured for this model. Serving it here means adding endpoint rows with credentials, which is the endpoints screen's job — not a tick.`
              : `${partner} does not list this model`
          }
        >
          —
        </span>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        <input
          type="radio"
          name={`serve-${row.key}`}
          checked={ticked}
          disabled={working}
          onChange={() =>
            row.modelUuid ? void setServing(row, partner) : startAdd(row, partner)
          }
          className="accent-[#3987e5]"
        />
        {c?.configured && (
          <span
            className={`rounded border px-1 py-0.5 text-[9.5px] ${
              c.configured.enabled === 0
                ? "border-white/[0.15] text-white/50"
                : c.configured.up === c.configured.enabled
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : c.configured.up === 0
                    ? "border-red-500/50 bg-red-500/15 text-red-300"
                    : "border-amber-500/50 bg-amber-500/10 text-amber-300"
            }`}
            title="Enabled keys answering / enabled keys, from our own probes"
          >
            {c.configured.up}/{c.configured.enabled} keys
          </span>
        )}
        {c?.cost && (c.cost.input !== null || c.cost.output !== null) && (
          <span
            className={`${MONO} text-[10px] text-muted-foreground/70`}
            title="What this partner charges us, per Mtok. Operator-only."
          >
            {cents(c.cost.input)}/{cents(c.cost.output)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Partner models"
        description="Everything Starimg and Wokey can serve, beside our own catalogue. Tick a partner to put a model in front of customers; untick to hide it without losing its prices."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <AiTabs />

      {error && (
        <p className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {feed?.partners.map((p) => (
          <span
            key={p.partner}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              p.reachable
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-white/[0.15] bg-white/[0.04] text-white/60"
            }`}
            title={
              p.evidence === "endpoints"
                ? (p.reason ?? "")
                : `${p.baseUrl}${p.reason ? ` — ${p.reason}` : ""}`
            }
          >
            {p.partner}:{" "}
            {!p.reachable
              ? "unknown"
              : p.evidence === "endpoints"
                ? `${p.count} model(s), by key`
                : `${p.count} models`}
          </span>
        ))}
        {s && (
          <span className="text-[11.5px] text-muted-foreground">
            {s.live} live · {s.hidden} hidden · {s.notCarried} not in our catalogue
          </span>
        )}
      </div>

      {/* A partner we cannot ask is stated outright, never implied by a gap. */}
      {feed?.partners
        .filter((p) => !p.reachable)
        .map((p) => (
          <p
            key={p.partner}
            className="mb-3 rounded-md border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-[11.5px] text-muted-foreground"
          >
            <strong className="text-foreground">{p.partner} is unknown</strong> —{" "}
            {p.reason}. Asked at <span className={MONO}>{p.baseUrl}</span>, which
            comes from STARIMG_BASE_URL / WOKEY_BASE_URL when either is set on
            this host and otherwise from the default in the code — worth
            checking first if a key is present and this still fails. Its
            column below reads <em>unknown</em> rather than empty:
            the panel could not ask, which is not the same as them not carrying
            the model. Models we already route to {p.partner} still work.
          </p>
        ))}

      {s && s.liveButUnlisted > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{s.liveButUnlisted} live model(s) point at a partner who no longer lists them.</strong>{" "}
            With no fallback, the next request for those fails.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by model id or name"
            className="h-9 pl-8"
          />
        </div>
        <Select value={view} onValueChange={setView}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            <SelectItem value="live">Live to customers</SelectItem>
            <SelectItem value="hidden">Ours, hidden</SelectItem>
            <SelectItem value="new">Not in our catalogue</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {rows.length} of {feed?.rows.length ?? 0}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-white/[0.06]">
        <table className="w-full text-[12px]">
          <thead className="bg-white/[0.02] text-left text-muted-foreground">
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="w-[150px] px-3 py-2 font-medium">
                Starimg
                <span className="ml-1 rounded border border-white/[0.15] px-1 text-[9px] uppercase text-white/50">
                  cost internal
                </span>
              </th>
              <th className="w-[150px] px-3 py-2 font-medium">Wokey</th>
              <th className="w-[160px] px-3 py-2 font-medium">Abliteration</th>
              <th className="w-[160px] px-3 py-2 font-medium">Audn</th>
              <th className="w-[130px] px-3 py-2 font-medium">Shown to customers</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  {feed?.partners.every((p) => !p.reachable)
                    ? "Neither partner could be reached from this host, and nothing in our catalogue matches."
                    : "Nothing matches."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.key}
                className={`border-b border-white/[0.04] ${busy === r.key ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium">{r.displayName}</div>
                  <div className={`${MONO} text-[10.5px] text-muted-foreground`}>
                    {r.ourModelId ?? r.key}
                    {r.upstreamModelId && r.upstreamModelId !== r.ourModelId && (
                      <span className="text-muted-foreground/60">
                        {" "}→ {r.upstreamModelId}
                      </span>
                    )}
                  </div>
                  {!r.inCatalogue && (
                    <span className="mt-0.5 inline-flex rounded border border-[#3987e5]/40 bg-[#3987e5]/10 px-1 py-0.5 text-[9.5px] text-[#7fb3f0]">
                      not in our catalogue
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <PartnerCell row={r} partner="starimg" />
                </td>
                <td className="px-3 py-2">
                  <PartnerCell row={r} partner="wokey" />
                </td>
                <td className="px-3 py-2">
                  <PartnerCell row={r} partner="abliteration" />
                </td>
                <td className="px-3 py-2">
                  <PartnerCell row={r} partner="audn" />
                </td>
                <td className="px-3 py-2">
                  {r.isActive ? (
                    <button
                      type="button"
                      disabled={busy === r.key}
                      onClick={() => void setServing(r, null)}
                      className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] text-emerald-300 transition-colors hover:bg-emerald-500/20"
                      title="Click to hide this model from customers. Its prices are kept."
                    >
                      live · hide
                    </button>
                  ) : r.inCatalogue ? (
                    <span className="text-[10.5px] text-white/50">
                      hidden
                    </span>
                  ) : (
                    <span className="text-[10.5px] text-muted-foreground/50">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Adding a model we do not carry needs a price. An enabled model with
          no price serves customers and bills nothing, so this asks once
          rather than creating a row that quietly gives inference away. */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add and enable — {draft?.row.key}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-[11.5px] text-muted-foreground">
              Carried by <strong>{draft?.partner}</strong>, sent upstream as{" "}
              <span className={MONO}>
                {draft?.row.upstreamModelId ?? draft?.row.key}
              </span>
              .
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="n-id">Our model id</Label>
              <Input
                id="n-id"
                value={draft?.modelId ?? ""}
                onChange={(e) => draft && setDraft({ ...draft, modelId: e.target.value })}
                className={MONO}
                placeholder="vendor/model-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-name">Display name</Label>
              <Input
                id="n-name"
                value={draft?.displayName ?? ""}
                onChange={(e) =>
                  draft && setDraft({ ...draft, displayName: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="n-in">Input (¢ per Mtok)</Label>
                <Input
                  id="n-in"
                  inputMode="decimal"
                  value={draft?.input ?? ""}
                  onChange={(e) => draft && setDraft({ ...draft, input: e.target.value })}
                  className={MONO}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-out">Output (¢ per Mtok)</Label>
                <Input
                  id="n-out"
                  inputMode="decimal"
                  value={draft?.output ?? ""}
                  onChange={(e) => draft && setDraft({ ...draft, output: e.target.value })}
                  className={MONO}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submitAdd()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Add and enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
