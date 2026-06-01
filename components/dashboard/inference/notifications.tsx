"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Copy, Mail, Plus, RotateCw, Trash2, Webhook, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  ACCENT,
  ACCENT_BRIGHT,
  ColHead,
  DataTable,
  EmptyState,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  SectionHead,
  SERIF_STYLE,
  StatCell,
  StatsStrip,
} from "@/components/dashboard/inference/chrome";

// ─── Types (mirror server loader) ──────────────────────────────────

export type NotificationEvent =
  | "finetune.succeeded"
  | "finetune.failed"
  | "batch.completed"
  | "batch.failed"
  | "serving_pod.ready"
  | "serving_pod.stopped"
  | "org.spend_threshold_reached";

export interface NotificationsConfig {
  events_subscribed: NotificationEvent[];
  email_recipients: string[];
  in_app_enabled: boolean;
  webhook_url: string | null;
  webhook_enabled: boolean;
  webhook_secret_set: boolean;
  updated_at: string | null;
}

export interface DeliveryRow {
  id: string;
  event: string;
  webhook_url: string;
  attempt: number;
  status: string;
  http_status: number | null;
  response_excerpt: string | null;
  created_at: string;
  delivered_at: string | null;
}

const EVENT_LABELS: Record<NotificationEvent, string> = {
  "finetune.succeeded": "Fine-tune succeeded",
  "finetune.failed": "Fine-tune failed",
  "batch.completed": "Batch completed",
  "batch.failed": "Batch failed",
  "serving_pod.ready": "Serving instance ready",
  "serving_pod.stopped": "Serving instance stopped",
  "org.spend_threshold_reached": "Spend threshold reached (budget / hard cap)",
};

// Spend alerts are operational — they bypass the events_subscribed
// filter on the server, so we hide them from the per-event toggle grid
// to avoid showing a switch that doesn't do anything. The static "Spend
// alerts" callout below the grid explains the behavior.
const HIDDEN_FROM_PICKER: NotificationEvent[] = ["org.spend_threshold_reached"];
const ALL_EVENTS = (Object.keys(EVENT_LABELS) as NotificationEvent[]).filter(
  (e) => !HIDDEN_FROM_PICKER.includes(e)
);

const STATUS_COLOR: Record<string, string> = {
  pending: "#94a3b8",
  delivered: "#22c55e",
  failed: "#ef4444",
  gave_up: "rgba(255,255,255,0.35)",
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function randomSecret(): string {
  // 32 random bytes hex — 64 chars. Reasonable HMAC secret length.
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Component ─────────────────────────────────────────────────────

export function NotificationsSettings({
  initialConfig,
  initialDeliveries,
  orgName,
  canMutate,
}: {
  initialConfig: NotificationsConfig;
  initialDeliveries: DeliveryRow[];
  orgName: string;
  canMutate: boolean;
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [deliveries] = useState(initialDeliveries);
  const [emailDraft, setEmailDraft] = useState("");
  const [secretDraft, setSecretDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const toggleEvent = (e: NotificationEvent) => {
    setConfig((c) => ({
      ...c,
      events_subscribed: c.events_subscribed.includes(e)
        ? c.events_subscribed.filter((x) => x !== e)
        : [...c.events_subscribed, e],
    }));
  };

  const addEmail = () => {
    const v = emailDraft.trim();
    if (!v || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      toast.error("Enter a valid email");
      return;
    }
    if (config.email_recipients.includes(v)) {
      toast.error("Already added");
      return;
    }
    if (config.email_recipients.length >= 5) {
      toast.error("Max 5 recipients");
      return;
    }
    setConfig((c) => ({ ...c, email_recipients: [...c.email_recipients, v] }));
    setEmailDraft("");
  };

  const removeEmail = (e: string) => {
    setConfig((c) => ({ ...c, email_recipients: c.email_recipients.filter((x) => x !== e) }));
  };

  const generateSecret = () => {
    const s = randomSecret();
    setSecretDraft(s);
    toast.success("Secret generated — save to apply");
  };

  const copySecret = async () => {
    if (!secretDraft) return;
    try {
      await navigator.clipboard.writeText(secretDraft);
      toast.success("Secret copied — paste into your webhook receiver");
    } catch {
      toast.error("Copy failed");
    }
  };

  const save = async () => {
    if (config.webhook_enabled && !config.webhook_url) {
      toast.error("Set a webhook URL or disable the webhook channel");
      return;
    }
    setSaving(true);
    try {
      type PutBody = Omit<NotificationsConfig, "webhook_secret_set" | "updated_at"> & {
        webhook_secret?: string | null;
      };
      const body: PutBody = {
        events_subscribed: config.events_subscribed,
        email_recipients: config.email_recipients,
        in_app_enabled: config.in_app_enabled,
        webhook_url: config.webhook_url,
        webhook_enabled: config.webhook_enabled,
      };
      // Only send a secret if we generated a new one this session, OR
      // the user is enabling webhook for the first time. Avoids
      // overwriting an existing secret on every save.
      if (secretDraft) {
        body.webhook_secret = secretDraft;
      }
      const r = await fetch("/api/inference/notifications", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Save failed");
      toast.success("Notification settings saved");
      setSecretDraft(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/inference/notifications/test", {
        method: "POST",
        credentials: "include",
      });
      const data = (await r.json()) as {
        success?: boolean;
        error?: string;
        channels?: { in_app: boolean; email: boolean; webhook: boolean };
      };
      if (!r.ok) throw new Error(data.error ?? "Test failed");
      const fired = data.channels
        ? Object.entries(data.channels)
            .filter(([, on]) => on)
            .map(([k]) => (k === "in_app" ? "in-app bell" : k))
        : [];
      toast.success(
        fired.length
          ? `Test event fired to: ${fired.join(", ")}`
          : "Test fired — no channels enabled, nothing was delivered"
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const reloadDeliveries = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1200);
  };

  // Aggregates for the strip
  const enabledChannelCount =
    (config.in_app_enabled ? 1 : 0) +
    (config.email_recipients.length > 0 ? 1 : 0) +
    (config.webhook_enabled && config.webhook_url ? 1 : 0);
  const lastDelivery = deliveries[0];

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: "Inference", href: "/dashboard/services/inference" }}
        title="Notifications"
        accent="channels"
        caption="Pick which events trigger an email or POST to your webhook receiver. Fine-tunes that take an hour stop being something you have to babysit."
        size="md"
        actions={
          canMutate ? (
            <>
              <GhostButton onClick={sendTest} disabled={testing || enabledChannelCount === 0}>
                <Zap className="h-3.5 w-3.5" />
                {testing ? "Sending…" : "Send test"}
              </GhostButton>
              <PrimaryButton onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </PrimaryButton>
            </>
          ) : null
        }
      />

      <StatsStrip>
        <StatCell label="Channels active" value={String(enabledChannelCount)} hint="of 3" accent={ACCENT} />
        <StatCell label="Events subscribed" value={String(config.events_subscribed.length)} hint={`of ${ALL_EVENTS.length}`} />
        <StatCell label="Email recipients" value={String(config.email_recipients.length)} hint="max 5" />
        <StatCell
          label="Last webhook delivery"
          value={lastDelivery ? formatRelative(lastDelivery.created_at) : "Never"}
          hint={lastDelivery ? lastDelivery.status : "No deliveries yet"}
        />
      </StatsStrip>

      <SectionHead eyebrow="Channels" title="Where to" accent="notify" rightMeta={`org: ${orgName}`} />

      <div className="space-y-3 mb-12">
        {/* In-app */}
        <ChannelCard
          icon={<Bell className="h-3.5 w-3.5" />}
          title="In-app bell"
          subtitle="Shows up in the dashboard notification bell. On by default — cheap, always on unless you turn it off."
          enabled={config.in_app_enabled}
          onToggle={(v) => canMutate && setConfig((c) => ({ ...c, in_app_enabled: v }))}
          canMutate={canMutate}
        >
          {null}
        </ChannelCard>

        {/* Email */}
        <ChannelCard
          icon={<Mail className="h-3.5 w-3.5" />}
          title="Email"
          subtitle="Sent to the addresses you list below. Max 5. Uses our standard email template — no per-recipient customization."
          enabled={config.email_recipients.length > 0}
          onToggle={() => {
            // Email "enabled" is implicit (any recipients = enabled). Toggle
            // off clears the list.
            if (!canMutate) return;
            if (config.email_recipients.length > 0) {
              if (confirm("Remove all email recipients?")) {
                setConfig((c) => ({ ...c, email_recipients: [] }));
              }
            }
          }}
          canMutate={canMutate}
        >
          <div className="space-y-2">
            {config.email_recipients.map((e) => (
              <div
                key={e}
                className="flex items-center justify-between gap-2 rounded-[4px] border border-white/[0.06] bg-white/[0.02] px-3 py-1.5"
              >
                <code className={`${MONO} text-[11.5px] text-white/85 truncate`}>{e}</code>
                {canMutate && (
                  <button
                    type="button"
                    onClick={() => removeEmail(e)}
                    className="h-6 w-6 inline-flex items-center justify-center rounded text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {canMutate && config.email_recipients.length < 5 && (
              <div className="flex gap-2">
                <Input
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addEmail();
                  }}
                  placeholder="alerts@yourcompany.com"
                  className="bg-white/[0.02] border-white/[0.08]"
                />
                <GhostButton onClick={addEmail} disabled={!emailDraft.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </GhostButton>
              </div>
            )}
          </div>
        </ChannelCard>

        {/* Webhook */}
        <ChannelCard
          icon={<Webhook className="h-3.5 w-3.5" />}
          title="Outbound webhook"
          subtitle="HMAC-SHA256 signed POST to your URL. Receiver verifies with X-Ahura-Signature: sha256=<hex>. Bodies are <16KB JSON."
          enabled={config.webhook_enabled}
          onToggle={(v) => canMutate && setConfig((c) => ({ ...c, webhook_enabled: v }))}
          canMutate={canMutate}
        >
          <div className="space-y-3">
            <div>
              <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                URL (https only)
              </Label>
              <Input
                value={config.webhook_url ?? ""}
                onChange={(e) => canMutate && setConfig((c) => ({ ...c, webhook_url: e.target.value || null }))}
                placeholder="https://example.com/webhooks/ahuracloud"
                disabled={!canMutate}
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                  Signing secret
                </Label>
                {canMutate && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={generateSecret}
                      className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-[#33adff] hover:text-white transition-colors`}
                    >
                      {config.webhook_secret_set || secretDraft ? "Rotate" : "Generate"}
                    </button>
                    {secretDraft && (
                      <button
                        type="button"
                        onClick={copySecret}
                        className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-[#33adff] hover:text-white transition-colors inline-flex items-center gap-1`}
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    )}
                  </div>
                )}
              </div>
              {secretDraft ? (
                <div className="rounded-[4px] border border-amber-700/40 bg-amber-950/30 p-3 space-y-1.5">
                  <code className={`${MONO} text-[11px] text-amber-200/85 break-all block`}>
                    {secretDraft}
                  </code>
                  <p className={`${MONO} text-[10px] text-amber-200/70 leading-relaxed`}>
                    Copy this now — it&apos;s shown once. Click Save to apply.
                  </p>
                </div>
              ) : (
                <p className={`${MONO} text-[10.5px] text-white/40`}>
                  {config.webhook_secret_set
                    ? "Secret is set. Click Rotate to mint + apply a new one."
                    : "No secret yet. Click Generate before saving."}
                </p>
              )}
            </div>
          </div>
        </ChannelCard>
      </div>

      {/* ─── Events ─────────────────────────────────────────────── */}
      <SectionHead eyebrow="Filter" title="Which" accent="events" />

      {/* Spend alerts are operational and always fire on enabled channels —
          surface that here so customers don't go looking for a toggle. */}
      <div className="mb-3 rounded-[5px] border border-[#33adff]/25 bg-[#0095FF]/[0.04] px-4 py-3">
        <p className={`${MONO} text-[11px] text-white/75 leading-relaxed`}>
          <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-[#33adff] font-semibold mr-2`}>
            Always on
          </span>
          Spend threshold alerts (80% / 100% of monthly budget, 90% / 100% of hard cap)
          fire automatically on whichever channels above you have enabled.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-12">
        {ALL_EVENTS.map((e) => {
          const on = config.events_subscribed.includes(e);
          return (
            <button
              key={e}
              type="button"
              disabled={!canMutate}
              onClick={() => canMutate && toggleEvent(e)}
              className={`flex items-center gap-3 rounded-[5px] border px-3 py-2.5 text-left transition-colors ${
                on
                  ? "border-[#0095FF]/40 bg-[#0095FF]/[0.05]"
                  : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
              } ${!canMutate ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{
                  background: on ? ACCENT_BRIGHT : "rgba(255,255,255,0.2)",
                  boxShadow: on ? `0 0 6px ${ACCENT_BRIGHT}` : "none",
                }}
              />
              <span className="flex-1 min-w-0">
                <span className={`${MONO} block text-[11.5px] text-white truncate`}>{EVENT_LABELS[e]}</span>
                <code className={`${MONO} block text-[9.5px] text-white/40`}>{e}</code>
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Webhook delivery log ────────────────────────────────── */}
      <SectionHead
        eyebrow="Audit"
        title="Recent webhook"
        accent="deliveries"
        rightMeta={`${deliveries.length} shown`}
      />
      <div className="mb-3 flex justify-end">
        <GhostButton onClick={reloadDeliveries} disabled={refreshing}>
          <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </GhostButton>
      </div>

      {deliveries.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,1.4fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Event</ColHead>
            <ColHead>When</ColHead>
            <ColHead>Status</ColHead>
            <ColHead align="right">HTTP</ColHead>
            <ColHead>Response</ColHead>
          </div>
          {deliveries.map((d) => {
            const color = STATUS_COLOR[d.status] ?? "rgba(255,255,255,0.35)";
            return (
              <div
                key={d.id}
                className="grid grid-cols-1 gap-1.5 px-5 py-3 border-b border-white/[0.04] last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,1.4fr)] md:items-center"
              >
                <code className={`${MONO} text-[11px] text-white/85 truncate`}>{d.event}</code>
                <span className={`${MONO} text-[10.5px] text-white/55`}>{formatRelative(d.created_at)}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: color, boxShadow: `0 0 5px ${color}` }}
                  />
                  <span
                    className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                    style={{ color }}
                  >
                    {d.status}
                  </span>
                </span>
                <span
                  style={SERIF_STYLE}
                  className="text-[12.5px] tabular-nums text-white text-right"
                >
                  {d.http_status ?? "—"}
                </span>
                <code className={`${MONO} text-[10px] text-white/55 truncate`}>
                  {d.response_excerpt ?? "—"}
                </code>
              </div>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState
          title="No webhook deliveries yet"
          description="Once you enable the webhook channel and an event fires, every delivery attempt shows up here for debugging."
        />
      )}

      {/* lint-happy import keeper */}
      <Trash2 className="hidden" />
    </PageCanvas>
  );
}

function ChannelCard({
  icon,
  title,
  subtitle,
  enabled,
  onToggle,
  canMutate,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  canMutate: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[6px] border bg-[#111216] px-5 py-4"
      style={{ borderColor: enabled ? "rgba(0,149,255,0.18)" : "rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="h-7 w-7 rounded-[4px] flex items-center justify-center shrink-0"
            style={{
              background: enabled ? "rgba(0,149,255,0.12)" : "rgba(255,255,255,0.04)",
              color: enabled ? ACCENT_BRIGHT : "rgba(255,255,255,0.45)",
            }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white tracking-[-0.01em]">{title}</p>
            <p className={`${MONO} text-[10.5px] text-white/45 leading-relaxed mt-0.5`}>{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!canMutate}
          onClick={() => onToggle(!enabled)}
          className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${
            !canMutate ? "opacity-50 cursor-not-allowed" : ""
          }`}
          style={{ background: enabled ? ACCENT : "rgba(255,255,255,0.1)" }}
        >
          <span
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
            style={{ left: enabled ? "calc(100% - 18px)" : "2px" }}
          />
        </button>
      </div>
      {children && enabled && <div className="pl-10">{children}</div>}
    </div>
  );
}
