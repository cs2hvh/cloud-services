"use client";

// Create a self-hosted model, and manage the pods that serve it.
//
// The API key rule this UI enforces: a pod key is typed once, sent once,
// and never comes back. Rows show "key set", never the key — so nothing
// here can leak a credential into a screenshot.

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

export type EndpointRow = {
  id: string;
  model_id: string;
  base_url: string;
  served_model_name: string | null;
  weight: number;
  enabled: boolean;
  label: string | null;
  hasKey: boolean;
};

type ProbeResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  probedBase: string;
  servedModels: string[];
  suggestion: string | null;
};

const errMsg = (e: unknown, fallback: string) => {
  const r = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return r || fallback;
};

/* ------------------------------------------------------------------ */
/* Create a hosted model                                               */
/* ------------------------------------------------------------------ */

export function NewHostedModelDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (created: boolean) => void;
}) {
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [upstreamModelId, setUpstreamModelId] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [cached, setCached] = useState("");
  const [contextWindow, setContextWindow] = useState("");
  const [maxOutput, setMaxOutput] = useState("");
  const [tools, setTools] = useState(true);
  const [streaming, setStreaming] = useState(true);
  const [jsonMode, setJsonMode] = useState(true);
  const [vision, setVision] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [saving, setSaving] = useState(false);

  const valid =
    /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(modelId.trim().toLowerCase()) &&
    displayName.trim() !== "" &&
    upstreamModelId.trim() !== "" &&
    input !== "" &&
    output !== "";

  const submit = async () => {
    setSaving(true);
    try {
      const capabilities: Record<string, unknown> = {
        tools,
        streaming,
        json_mode: jsonMode,
        vision,
      };
      if (contextWindow) capabilities.context_window = Number(contextWindow);
      if (maxOutput) capabilities.max_output = Number(maxOutput);

      await api.post("/admin/ai/models", {
        model_id: modelId.trim().toLowerCase(),
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        upstream_model_id: upstreamModelId.trim(),
        modality: "chat",
        capabilities,
        pricing: {
          input_cents_per_mtok: Number(input),
          output_cents_per_mtok: Number(output),
          ...(cached ? { cached_cents_per_mtok: Number(cached) } : {}),
        },
        sort_order: Number(sortOrder) || 0,
        is_active: false,
      });
      toast.success(`${modelId} created — add an endpoint, then activate it`);
      onClose(true);
    } catch (e) {
      toast.error(errMsg(e, "Could not create the model"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New hosted model</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Model id</Label>
              <Input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="vendor/model-name"
                className={MONO}
              />
              <p className="text-[11px] text-muted-foreground">
                Namespaced and lowercase — this is what customers call.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Vendor / Model 1.0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Served name (what the pod answers to)</Label>
            <Input
              value={upstreamModelId}
              onChange={(e) => setUpstreamModelId(e.target.value)}
              placeholder="model-name-as-loaded"
              className={MONO}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown in the customer catalog"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Input ¢/Mtok</Label>
              <Input type="number" min="0" step="any" value={input} onChange={(e) => setInput(e.target.value)} placeholder="70" />
            </div>
            <div className="space-y-1.5">
              <Label>Output ¢/Mtok</Label>
              <Input type="number" min="0" step="any" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="220" />
            </div>
            <div className="space-y-1.5">
              <Label>Cached ¢/Mtok</Label>
              <Input type="number" min="0" step="any" value={cached} onChange={(e) => setCached(e.target.value)} placeholder="13" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Context window</Label>
              <Input type="number" min="0" step="1" value={contextWindow} onChange={(e) => setContextWindow(e.target.value)} placeholder="128000" />
            </div>
            <div className="space-y-1.5">
              <Label>Max output</Label>
              <Input type="number" min="0" step="1" value={maxOutput} onChange={(e) => setMaxOutput(e.target.value)} placeholder="8192" />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            {(
              [
                ["Tools", tools, setTools],
                ["Streaming", streaming, setStreaming],
                ["JSON mode", jsonMode, setJsonMode],
                ["Vision", vision, setVision],
              ] as const
            ).map(([label, value, set]) => (
              <label key={label} className="flex items-center gap-2 text-[13px]">
                <Switch checked={value} onCheckedChange={(v) => set(v)} />
                {label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sort order</Label>
              <Input type="number" step="1" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
          </div>

          <p className="rounded-md border border-border bg-black/20 px-3 py-2 text-[11.5px] text-muted-foreground">
            Created inactive and self-served: pods bill by the hour, so no
            per-token cost basis is recorded. Add at least one endpoint, probe
            it, then activate — a model with no endpoint answers nothing.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Manage serving endpoints                                            */
/* ------------------------------------------------------------------ */

export function EndpointsDialog({
  modelId,
  onClose,
}: {
  modelId: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<EndpointRow[]>([]);
  const [dekConfigured, setDekConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [probe, setProbe] = useState<Record<string, ProbeResult | "loading">>({});

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [servedName, setServedName] = useState("");
  const [label, setLabel] = useState("");
  const [weight, setWeight] = useState("1");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!modelId) return;
    setLoading(true);
    try {
      const res = await api.get<{ endpoints: EndpointRow[]; dekConfigured: boolean }>(
        `/admin/ai/models/${encodeURIComponent(modelId)}/endpoints`,
      );
      setRows(res.data.endpoints);
      setDekConfigured(res.data.dekConfigured);
    } catch (e) {
      toast.error(errMsg(e, "Could not load endpoints"));
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    if (modelId) void load();
  }, [modelId, load]);

  const add = async () => {
    if (!modelId) return;
    setAdding(true);
    try {
      await api.post(`/admin/ai/models/${encodeURIComponent(modelId)}/endpoints`, {
        base_url: baseUrl.trim(),
        api_key: apiKey,
        served_model_name: servedName.trim() || undefined,
        label: label.trim() || undefined,
        weight: Number(weight) || 1,
      });
      toast.success("Endpoint added");
      setBaseUrl("");
      setApiKey("");
      setServedName("");
      setLabel("");
      setWeight("1");
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Could not add the endpoint"));
    } finally {
      setAdding(false);
    }
  };

  const patch = async (row: EndpointRow, body: Record<string, unknown>, ok: string) => {
    if (!modelId) return;
    setBusy(row.id);
    try {
      await api.patch(
        `/admin/ai/models/${encodeURIComponent(modelId)}/endpoints/${row.id}`,
        body,
      );
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Update failed"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: EndpointRow) => {
    if (!modelId) return;
    setBusy(row.id);
    try {
      const res = await api.delete<{ remainingEnabled: number }>(
        `/admin/ai/models/${encodeURIComponent(modelId)}/endpoints/${row.id}`,
      );
      toast.success(
        res.data.remainingEnabled === 0
          ? "Endpoint removed — this model now has no enabled endpoint"
          : "Endpoint removed",
      );
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Delete failed"));
    } finally {
      setBusy(null);
    }
  };

  const runProbe = async (key: string, payload: Record<string, unknown>) => {
    if (!modelId) return;
    setProbe((p) => ({ ...p, [key]: "loading" }));
    try {
      const res = await api.post<ProbeResult>(
        `/admin/ai/models/${encodeURIComponent(modelId)}/endpoints/probe`,
        payload,
      );
      setProbe((p) => ({ ...p, [key]: res.data }));
    } catch (e) {
      toast.error(errMsg(e, "Probe failed"));
      setProbe((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <Dialog open={!!modelId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Serving endpoints — {modelId}</DialogTitle>
        </DialogHeader>

        {!dekConfigured && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              BYOK_DEK is not set on this host, so keys cannot be encrypted here.
              Adding or rotating an endpoint key will be refused rather than
              stored unusable.
            </span>
          </div>
        )}
        {rows.length > 0 && enabledCount === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No endpoint is enabled — every request to this model fails until
              one is switched on.
            </span>
          </div>
        )}

        <div className="space-y-2 py-1">
          {loading && rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No endpoints yet. Add the pod below.
            </p>
          ) : (
            rows.map((r) => {
              const p = probe[r.id];
              return (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`${MONO} truncate text-[12.5px]`}>{r.base_url}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {r.label ? `${r.label} · ` : ""}
                        serves {r.served_model_name || "(model default)"} · weight {r.weight} ·{" "}
                        {r.hasKey ? "key set" : "no key"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Switch
                          checked={r.enabled}
                          disabled={busy === r.id}
                          onCheckedChange={(v) =>
                            patch(r, { enabled: v }, v ? "Endpoint enabled" : "Endpoint disabled")
                          }
                        />
                        {r.enabled ? "enabled" : "disabled"}
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={busy === r.id || p === "loading"}
                        onClick={() => runProbe(r.id, { endpoint_id: r.id })}
                      >
                        {p === "loading" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5">Probe</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-300 hover:text-red-200"
                        disabled={busy === r.id}
                        onClick={() => remove(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {p && p !== "loading" && (
                    <div
                      className={`mt-2 rounded border px-2.5 py-1.5 text-[11.5px] ${
                        p.ok
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-red-500/30 bg-red-500/10 text-red-300"
                      }`}
                    >
                      {p.ok
                        ? `${p.status} · ${p.latencyMs}ms · serves: ${p.servedModels.join(", ") || "(none listed)"}`
                        : `probe failed (${p.status || "no response"})`}
                      {p.suggestion && <div className="mt-0.5 opacity-90">{p.suggestion}</div>}
                      {p.ok &&
                        r.served_model_name &&
                        p.servedModels.length > 0 &&
                        !p.servedModels.includes(r.served_model_name) && (
                          <div className="mt-0.5 font-medium">
                            Served name &quot;{r.served_model_name}&quot; is not in that list —
                            requests will fail.
                          </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add form */}
        <div className="space-y-3 rounded-lg border border-border bg-black/20 p-3">
          <div className="text-[12px] font-medium">Add an endpoint</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://pod-id.proxy.runpod.net/v1"
                className={`h-8 ${MONO} text-[12px]`}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">API key (stored encrypted, never shown again)</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="pod key"
                className="h-8 text-[12px]"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Served name (optional)</Label>
              <Input
                value={servedName}
                onChange={(e) => setServedName(e.target.value)}
                placeholder="falls back to model default"
                className={`h-8 ${MONO} text-[12px]`}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="pod-a"
                className="h-8 text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Weight</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="h-8 text-[12px]"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!baseUrl.trim() || !apiKey || probe.candidate === "loading"}
              onClick={() =>
                runProbe("candidate", { base_url: baseUrl.trim(), api_key: apiKey })
              }
            >
              {probe.candidate === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test before saving
            </Button>
            <Button size="sm" onClick={add} disabled={!baseUrl.trim() || !apiKey || adding}>
              {adding ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Add endpoint
            </Button>
          </div>
          {probe.candidate && probe.candidate !== "loading" && (
            <div
              className={`rounded border px-2.5 py-1.5 text-[11.5px] ${
                probe.candidate.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-red-500/30 bg-red-500/10 text-red-300"
              }`}
            >
              {probe.candidate.ok
                ? `${probe.candidate.status} · ${probe.candidate.latencyMs}ms · serves: ${
                    probe.candidate.servedModels.join(", ") || "(none listed)"
                  }`
                : `probe failed (${probe.candidate.status || "no response"})`}
              {probe.candidate.suggestion && (
                <div className="mt-0.5 opacity-90">{probe.candidate.suggestion}</div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
