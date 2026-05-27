'use client';

import { useEffect, useState } from 'react';
import { RotateCw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  ACCENT,
  CodeChip,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  SectionHead,
  SERIF_STYLE,
  StatCell,
  StatsStrip,
} from '@/components/dashboard/inference/chrome';
import { SUPPORT_EMAIL } from '@/lib/inference/branding';

type Role = 'owner' | 'admin' | 'developer' | 'viewer';

interface OrgResponse {
  org: {
    id: string;
    slug: string;
    name: string;
    role: Role;
    zdr_default: boolean;
    region_pin: 'us' | 'eu' | 'asia' | null;
    owner_user_id: string | null;
    monthly_budget_cents: number | null;
    hard_cap_cents: number | null;
    semantic_cache_threshold: number | null;
    created_at: string | null;
    updated_at: string | null;
  };
  counts: {
    active_api_keys: number;
    active_members: number;
    byok_keys: number;
  };
}

const SEMANTIC_CACHE_DEFAULT_THRESHOLD = 0.95;
const SEMANTIC_CACHE_MIN = 0.85;
const SEMANTIC_CACHE_MAX = 0.99;

// Parse a "$1,234.56" / "1234.56" / "1234" input string into integer
// cents. Returns null for empty input, NaN for invalid. Negative -> NaN.
function parseUsdToCents(raw: string): number | null | typeof NaN {
  const trimmed = raw.replace(/[\s,$]/g, '').trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return NaN;
  return Math.round(num * 100);
}

function centsToUsdInput(c: number | null): string {
  if (c === null || c === undefined) return '';
  return (c / 100).toFixed(2);
}

const REGION_OPTIONS = [
  { value: '__any__', label: 'Any region (no pin)' },
  { value: 'us', label: 'United States' },
  { value: 'eu', label: 'European Union (GDPR)' },
  { value: 'asia', label: 'Asia Pacific' },
];

export default function SettingsPage() {
  const [data, setData] = useState<OrgResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    zdr_default: boolean;
    region_pin: string;
    monthly_budget_usd: string;
    hard_cap_usd: string;
    /** Slider position 0.85..0.99 (snapped to .01). Always present —
     *  if the org has no override saved, we initialize to the platform
     *  default (0.95) but only PATCH when the value actually drifts
     *  from the saved org value. */
    semantic_cache_threshold: number;
    /** True iff the org has a non-null override saved. Drives the
     *  "Reset to default" affordance + the save dirty-check. */
    semantic_cache_threshold_overridden: boolean;
  }>({
    name: '',
    zdr_default: false,
    region_pin: '__any__',
    monthly_budget_usd: '',
    hard_cap_usd: '',
    semantic_cache_threshold: SEMANTIC_CACHE_DEFAULT_THRESHOLD,
    semantic_cache_threshold_overridden: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inference/orgs/current', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load org');
      const json: OrgResponse = await r.json();
      setData(json);
      setForm({
        name: json.org.name,
        zdr_default: json.org.zdr_default,
        region_pin: json.org.region_pin ?? '__any__',
        monthly_budget_usd: centsToUsdInput(json.org.monthly_budget_cents),
        hard_cap_usd: centsToUsdInput(json.org.hard_cap_cents),
        semantic_cache_threshold:
          json.org.semantic_cache_threshold ?? SEMANTIC_CACHE_DEFAULT_THRESHOLD,
        semantic_cache_threshold_overridden: json.org.semantic_cache_threshold !== null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isAdminish = data?.org.role === 'owner' || data?.org.role === 'admin';

  const parsedBudgetCents = parseUsdToCents(form.monthly_budget_usd);
  const parsedHardCapCents = parseUsdToCents(form.hard_cap_usd);
  const capsValid = !Number.isNaN(parsedBudgetCents) && !Number.isNaN(parsedHardCapCents);
  const budgetGtCap =
    capsValid &&
    parsedBudgetCents !== null &&
    parsedHardCapCents !== null &&
    (parsedBudgetCents as number) > (parsedHardCapCents as number);

  // The threshold field has a slight wrinkle: a user can have NEVER
  // saved a value (dashboard shows default 0.95, server stores null),
  // and the dirty check should only fire if they intentionally tweak
  // the slider. Track the "did the user touch it" via the overridden
  // flag — set to true on any slider move or Reset action.
  const savedThreshold = data?.org.semantic_cache_threshold ?? null;
  const thresholdDirty =
    form.semantic_cache_threshold_overridden !== (savedThreshold !== null) ||
    (form.semantic_cache_threshold_overridden &&
      Math.abs(form.semantic_cache_threshold - (savedThreshold ?? 0)) > 0.0001);

  const dirty =
    data &&
    (form.name.trim() !== data.org.name ||
      form.zdr_default !== data.org.zdr_default ||
      (form.region_pin === '__any__' ? null : form.region_pin) !== data.org.region_pin ||
      (capsValid && parsedBudgetCents !== data.org.monthly_budget_cents) ||
      (capsValid && parsedHardCapCents !== data.org.hard_cap_cents) ||
      thresholdDirty);

  const save = async () => {
    if (!data || !form.name.trim()) return;
    if (!capsValid) {
      toast.error('Spend caps must be non-negative numbers');
      return;
    }
    if (budgetGtCap) {
      toast.error('Monthly budget cannot exceed the hard cap');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (form.name.trim() !== data.org.name) payload.name = form.name.trim();
      if (form.zdr_default !== data.org.zdr_default) payload.zdr_default = form.zdr_default;
      const region = form.region_pin === '__any__' ? null : form.region_pin;
      if (region !== data.org.region_pin) payload.region_pin = region;
      if (parsedBudgetCents !== data.org.monthly_budget_cents) {
        payload.monthly_budget_cents = parsedBudgetCents;
      }
      if (parsedHardCapCents !== data.org.hard_cap_cents) {
        payload.hard_cap_cents = parsedHardCapCents;
      }
      if (thresholdDirty) {
        payload.semantic_cache_threshold = form.semantic_cache_threshold_overridden
          ? // Snap to 2 decimals — the DB column is NUMERIC(3,2).
            Math.round(form.semantic_cache_threshold * 100) / 100
          : null;
      }

      const r = await fetch('/api/inference/orgs/current', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Failed to save');
      toast.success('Settings saved');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Organization"
        accent="settings"
        caption="Name, default privacy posture, region pin, and identifiers for this inference org. Owner and admins can edit; everyone can read."
        size="md"
        actions={
          <>
            <GhostButton onClick={load} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Reload
            </GhostButton>
            {isAdminish && (
              <PrimaryButton onClick={save} disabled={!dirty || saving}>
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save changes'}
              </PrimaryButton>
            )}
          </>
        }
      />

      <StatsStrip>
        <StatCell
          label="Active keys"
          value={String(data?.counts.active_api_keys ?? 0)}
          hint="Public API tokens"
        />
        <StatCell
          label="Members"
          value={String(data?.counts.active_members ?? 0)}
          hint="Across all roles"
          accent={ACCENT}
        />
        <StatCell
          label="BYOK keys"
          value={String(data?.counts.byok_keys ?? 0)}
          hint="Provider keys on file"
        />
        <StatCell
          label="Your role"
          value={data?.org.role.toUpperCase() ?? '—'}
          hint={data ? `member of ${data.org.slug}` : ''}
          accent={
            data?.org.role === 'owner' ? '#fbbf24' : data?.org.role === 'admin' ? ACCENT : undefined
          }
        />
      </StatsStrip>

      {/* Identifiers (read-only) */}
      <section className="mb-14">
        <SectionHead eyebrow="Identifiers" title="Org" accent="metadata" />
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-4">
          <ReadOnlyField label="Org ID" value={data?.org.id ?? '—'} mono />
          <ReadOnlyField label="Slug" value={data?.org.slug ?? '—'} mono />
          <ReadOnlyField
            label="Created"
            value={
              data?.org.created_at
                ? new Date(data.org.created_at).toLocaleString()
                : '—'
            }
          />
          <ReadOnlyField
            label="Last updated"
            value={
              data?.org.updated_at
                ? new Date(data.org.updated_at).toLocaleString()
                : '—'
            }
          />
        </div>
      </section>

      {/* Profile (editable) */}
      <section className="mb-14">
        <SectionHead eyebrow="Profile" title="Display" accent="name" />
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-4">
          <div>
            <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
              Organization name
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Inc."
              className="bg-white/[0.02] border-white/[0.08] max-w-md"
              disabled={!isAdminish || loading}
            />
            <p className={`${MONO} mt-1.5 text-[10.5px] text-white/40`}>
              Shown on dashboards and invoices. Slug stays fixed: <CodeChip>{data?.org.slug ?? ''}</CodeChip>
            </p>
          </div>
        </div>
      </section>

      {/* Privacy + region */}
      <section className="mb-14">
        <SectionHead eyebrow="Privacy" title="Default" accent="data posture" />
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-5">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-md">
              <Label className={`${MONO} text-[11px] uppercase tracking-[0.12em] text-white/80`}>
                Zero Data Retention by default
              </Label>
              <p className={`${MONO} mt-1.5 text-[11px] text-white/45 leading-relaxed`}>
                When on, new API keys default to ZDR — prompts and completions are never logged,
                only billing metadata is retained. You can still override per-key.
              </p>
            </div>
            <Switch
              checked={form.zdr_default}
              onCheckedChange={(v) => setForm({ ...form, zdr_default: v })}
              disabled={!isAdminish || loading}
            />
          </div>

          <div className="border-t border-white/[0.06] pt-5">
            <Label className={`${MONO} block mb-1.5 text-[11px] uppercase tracking-[0.12em] text-white/80`}>
              Region pin
            </Label>
            <p className={`${MONO} mb-3 text-[11px] text-white/45 leading-relaxed max-w-md`}>
              Restrict inference traffic to a specific region. Used for data residency commitments
              (GDPR for EU). Multi-region routing remains the default until pinned.
            </p>
            <Select
              value={form.region_pin}
              onValueChange={(v) => setForm({ ...form, region_pin: v })}
              disabled={!isAdminish || loading}
            >
              <SelectTrigger className={`${MONO} h-10 w-full max-w-md bg-white/[0.02] border-white/[0.08] text-[12px]`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGION_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Spend caps */}
      <section className="mb-14">
        <SectionHead eyebrow="Spend" title="Org-level" accent="caps" />
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-5">
          <div>
            <Label className={`${MONO} block mb-1.5 text-[11px] uppercase tracking-[0.12em] text-white/80`}>
              Monthly budget (USD)
            </Label>
            <p className={`${MONO} mb-2 text-[11px] text-white/45 leading-relaxed max-w-md`}>
              Informational target — surfaced on usage dashboards as an overage indicator but does NOT
              block traffic when crossed. Leave blank for no budget.
            </p>
            <div className="flex items-center gap-2 max-w-xs">
              <span className={`${MONO} text-[12px] text-white/55`}>$</span>
              <Input
                type="text"
                inputMode="decimal"
                value={form.monthly_budget_usd}
                onChange={(e) => setForm({ ...form, monthly_budget_usd: e.target.value })}
                placeholder="500.00"
                className="bg-white/[0.02] border-white/[0.08]"
                disabled={!isAdminish || loading}
              />
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-5">
            <Label className={`${MONO} block mb-1.5 text-[11px] uppercase tracking-[0.12em] text-white/80`}>
              Monthly hard cap (USD)
            </Label>
            <p className={`${MONO} mb-2 text-[11px] text-white/45 leading-relaxed max-w-md`}>
              Enforced ceiling — once this month&apos;s spend reaches this number, the inference
              gateway returns <CodeChip>402 org_hard_cap_reached</CodeChip> for every request until
              the next billing period or you raise it. Leave blank for no cap.
            </p>
            <div className="flex items-center gap-2 max-w-xs">
              <span className={`${MONO} text-[12px] text-white/55`}>$</span>
              <Input
                type="text"
                inputMode="decimal"
                value={form.hard_cap_usd}
                onChange={(e) => setForm({ ...form, hard_cap_usd: e.target.value })}
                placeholder="1000.00"
                className="bg-white/[0.02] border-white/[0.08]"
                disabled={!isAdminish || loading}
              />
            </div>
            {budgetGtCap && (
              <p className={`${MONO} mt-2 text-[10.5px] text-amber-300/85`}>
                Monthly budget is higher than the hard cap — the cap will fire first.
              </p>
            )}
            <p className={`${MONO} mt-3 text-[10.5px] text-white/40 max-w-md leading-relaxed`}>
              Per-API-key caps still apply on top. Whichever cap (key or org) is reached first wins.
            </p>
          </div>
        </div>
      </section>

      {/* Semantic cache tuning */}
      <section className="mb-14">
        <SectionHead eyebrow="Semantic cache" title="Match" accent="threshold" />
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-4">
          <p className={`${MONO} text-[11px] text-white/55 leading-relaxed max-w-2xl`}>
            Cosine similarity required for a cached response to be served on a near-duplicate
            prompt. Only applies to API keys that have Semantic cache turned on individually.
          </p>
          <div className="flex items-baseline justify-between gap-4 max-w-2xl">
            <div className="min-w-0">
              <Label className={`${MONO} block mb-1 text-[11px] uppercase tracking-[0.12em] text-white/80`}>
                Threshold
              </Label>
              <p className={`${MONO} text-[10.5px] text-white/45`}>
                Stricter (right) → fewer hits, higher accuracy. Looser (left) → more hits, more
                tolerance for paraphrased prompts. Platform default is 0.95.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div
                style={SERIF_STYLE}
                className="text-[24px] font-bold text-white tabular-nums"
              >
                {form.semantic_cache_threshold.toFixed(2)}
              </div>
              <div className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>
                {form.semantic_cache_threshold_overridden ? 'custom' : 'platform default'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 max-w-2xl">
            <span className={`${MONO} text-[10.5px] text-white/45 tabular-nums w-10`}>
              {SEMANTIC_CACHE_MIN.toFixed(2)}
            </span>
            <input
              type="range"
              min={SEMANTIC_CACHE_MIN}
              max={SEMANTIC_CACHE_MAX}
              step={0.01}
              value={form.semantic_cache_threshold}
              disabled={!isAdminish || loading}
              onChange={(e) =>
                setForm({
                  ...form,
                  semantic_cache_threshold: Number(e.target.value),
                  semantic_cache_threshold_overridden: true,
                })
              }
              className="flex-1 accent-[#0095FF] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              style={{ accentColor: ACCENT }}
            />
            <span className={`${MONO} text-[10.5px] text-white/45 tabular-nums w-10 text-right`}>
              {SEMANTIC_CACHE_MAX.toFixed(2)}
            </span>
          </div>
          {form.semantic_cache_threshold_overridden && isAdminish && (
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  semantic_cache_threshold: SEMANTIC_CACHE_DEFAULT_THRESHOLD,
                  semantic_cache_threshold_overridden: false,
                })
              }
              className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-[#33adff] hover:text-white transition-colors`}
            >
              Reset to platform default
            </button>
          )}
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <SectionHead eyebrow="Danger zone" title="Irreversible" accent="actions" />
        <div className="border border-red-400/15 bg-red-400/[0.02] rounded-[6px] p-5">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-md">
              <h3
                style={SERIF_STYLE}
                className="text-[16px] font-semibold text-red-200/90"
              >
                Delete organization
              </h3>
              <p className={`${MONO} mt-1.5 text-[11px] text-white/55 leading-relaxed`}>
                Permanently deletes the org, all API keys, BYOK keys, fine-tunes, deployments,
                and historical usage. Billing remains on your account.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                toast.info(`Org deletion requires support contact for Phase 1. Email ${SUPPORT_EMAIL}.`)
              }
              disabled={data?.org.role !== 'owner'}
              className={`${MONO} h-10 px-4 text-[11px] uppercase tracking-[0.12em] font-semibold rounded-[5px] border border-red-400/20 bg-red-400/[0.04] text-red-300/90 hover:bg-red-400/[0.08] hover:text-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Delete org…
            </button>
          </div>
        </div>
      </section>
    </PageCanvas>
  );
}

function ReadOnlyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
        {label}
      </span>
      <span
        className={`${mono ? MONO + ' ' : ''}text-[12px] text-white/85 ${
          mono ? 'tabular-nums' : ''
        } text-right truncate`}
      >
        {value}
      </span>
    </div>
  );
}
