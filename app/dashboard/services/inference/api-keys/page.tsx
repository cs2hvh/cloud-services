'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RotateCw,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  ACCENT,
  ColHead,
  DataTable,
  EmptyState,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  RowActionButton,
  SectionHead,
  StatCell,
  StatsStrip,
  StatusDot,
  StatusLabel,
} from '@/components/dashboard/inference/chrome';

interface ApiKey {
  id: string;
  name: string;
  preview: string;
  zdr_enabled: boolean;
  monthly_budget_cents: number | null;
  hard_cap_cents: number | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokeKey, setRevokeKey] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [form, setForm] = useState({
    name: '',
    zdr_enabled: false,
    monthly_budget_cents: '',
    hard_cap_cents: '',
  });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inference/api-keys', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load API keys');
      const data = await r.json();
      setKeys(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: form.name.trim(), zdr_enabled: form.zdr_enabled };
      if (form.monthly_budget_cents) body.monthly_budget_cents = Math.round(Number(form.monthly_budget_cents) * 100);
      if (form.hard_cap_cents) body.hard_cap_cents = Math.round(Number(form.hard_cap_cents) * 100);

      const r = await fetch('/api/inference/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to create API key');

      setCreatedKey(data.data.api_key);
      setKeyVisible(false);
      setForm({ name: '', zdr_enabled: false, monthly_budget_cents: '', hard_cap_cents: '' });
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!revokeKey) return;
    setRevoking(true);
    try {
      const r = await fetch(`/api/inference/api-keys/${revokeKey.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error ?? 'Failed to revoke');
      }
      toast.success(`Revoked "${revokeKey.name}"`);
      setRevokeKey(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setRevoking(false);
    }
  };

  const copyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCents = (c: number | null) =>
    c === null ? '—' : c < 100 ? `$${(c / 100).toFixed(2)}` : `$${(c / 100).toFixed(0)}`;

  // Stats
  const zdrCount = keys.filter((k) => k.zdr_enabled).length;
  const recentlyUsedCount = keys.filter(
    (k) => k.last_used_at && Date.now() - new Date(k.last_used_at).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;
  const totalBudget = keys.reduce((s, k) => s + (k.monthly_budget_cents ?? 0), 0);

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="API"
        accent="keys"
        caption="Public bearer tokens for the inference gateway. Shown once at creation; sha256-hashed at rest. Per-key budgets, model scopes, and Zero Data Retention all configurable."
        size="md"
        actions={
          <>
            <GhostButton onClick={load} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New key
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Active keys" value={String(keys.length)} hint="Not yet revoked" />
        <StatCell
          label="Recently used"
          value={String(recentlyUsedCount)}
          hint="Used in last 7 days"
          accent={recentlyUsedCount > 0 ? "#4ade80" : undefined}
        />
        <StatCell
          label="ZDR enabled"
          value={String(zdrCount)}
          suffix={keys.length > 0 ? `/ ${keys.length}` : undefined}
          hint="Prompts not logged"
          accent={zdrCount > 0 ? ACCENT : undefined}
        />
        <StatCell
          label="Combined budget"
          value={totalBudget > 0 ? formatCents(totalBudget) : "—"}
          hint={totalBudget > 0 ? "Per month, across keys" : "No caps set"}
        />
      </StatsStrip>

      <SectionHead
        eyebrow="Inventory"
        title="Your"
        accent="keys"
        rightMeta={keys.length > 0 ? `${keys.length} active` : undefined}
      />

      {loading ? (
        <DataTable>
          <div className={`${MONO} px-5 py-12 text-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>
            Loading…
          </div>
        </DataTable>
      ) : keys.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Key</ColHead>
            <ColHead>Budget · Cap</ColHead>
            <ColHead>Created · Last used</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {keys.map((k) => (
            <div
              key={k.id}
              className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>
                    {k.name}
                  </span>
                  {k.zdr_enabled ? (
                    <span className={`${MONO} inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.12em] text-emerald-300/85`}>
                      <Shield className="h-2.5 w-2.5" /> ZDR
                    </span>
                  ) : (
                    <span className={`${MONO} inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.12em] text-white/35`}>
                      <ShieldOff className="h-2.5 w-2.5" /> Logged
                    </span>
                  )}
                </div>
                <div className="inline-flex items-center gap-1.5 mt-1">
                  <StatusDot status={k.last_used_at ? "ok" : "neutral"} />
                  <StatusLabel status={k.last_used_at ? "ok" : "neutral"}>
                    {k.last_used_at ? "Active" : "Unused"}
                  </StatusLabel>
                </div>
              </div>
              <div className={`${MONO} text-[11.5px] text-white/55 tabular-nums truncate`}>{k.preview}</div>
              <div className={`${MONO} text-[11.5px] text-white/75 tabular-nums`}>
                {formatCents(k.monthly_budget_cents)}
                <span className={`${MONO} block text-[10px] text-white/35 mt-0.5`}>
                  cap {formatCents(k.hard_cap_cents)}
                </span>
              </div>
              <div className={`${MONO} text-[11px] text-white/55`}>
                {new Date(k.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                <span className={`${MONO} block text-[10px] text-white/35 mt-0.5`}>
                  {k.last_used_at
                    ? `used ${new Date(k.last_used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : 'never used'}
                </span>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <RowActionButton onClick={() => setRevokeKey(k)} variant="danger">
                  <Trash2 className="h-3 w-3" />
                  Revoke
                </RowActionButton>
              </div>
            </div>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No API keys yet"
          description="Create your first key to call the inference gateway from any OpenAI- or Anthropic-SDK code."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create your first key
            </PrimaryButton>
          }
        />
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Create API key
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              The plaintext key is shown once. Copy and store immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="production-api"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly budget (USD)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.monthly_budget_cents}
                  onChange={(e) => setForm({ ...form, monthly_budget_cents: e.target.value })}
                  placeholder="100"
                  className="bg-white/[0.02] border-white/[0.08]"
                />
              </Field>
              <Field label="Hard cap (USD)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.hard_cap_cents}
                  onChange={(e) => setForm({ ...form, hard_cap_cents: e.target.value })}
                  placeholder="500"
                  className="bg-white/[0.02] border-white/[0.08]"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-[5px] border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div>
                <Label htmlFor="zdr" className={`${MONO} text-[11px] uppercase tracking-[0.12em] text-white/80`}>
                  Zero Data Retention
                </Label>
                <p className={`${MONO} mt-0.5 text-[10.5px] text-white/40`}>
                  Prompts and completions are not logged.
                </p>
              </div>
              <Switch
                id="zdr"
                checked={form.zdr_enabled}
                onCheckedChange={(v) => setForm({ ...form, zdr_enabled: v })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </GhostButton>
            <PrimaryButton
              onClick={create}
              disabled={creating || !form.name.trim()}
            >
              {creating ? 'Creating…' : 'Create key'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show-once reveal */}
      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent className="max-w-lg border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-amber-200`}>
              Save your key now
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              This is the only time the full key is shown. Save it in a password manager before closing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative rounded-[5px] border border-amber-400/25 bg-amber-400/[0.04] p-3 pr-12">
              <code className={`${MONO} block break-all text-[12.5px] text-amber-100`}>
                {keyVisible ? createdKey : "•".repeat(createdKey?.length ?? 40)}
              </code>
              <button
                type="button"
                onClick={() => setKeyVisible((v) => !v)}
                className="absolute right-2 top-2.5 h-7 w-7 rounded text-amber-200/70 hover:bg-amber-400/[0.08] hover:text-amber-100 flex items-center justify-center transition-colors"
              >
                {keyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              type="button"
              onClick={copyKey}
              className={`${MONO} inline-flex h-9 w-full items-center justify-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold rounded-[5px] border border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06] hover:text-white transition-colors`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
          </div>
          <DialogFooter>
            <PrimaryButton onClick={() => setCreatedKey(null)}>I&apos;ve saved it</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!revokeKey} onOpenChange={() => setRevokeKey(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Revoke API key
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Revoking &quot;{revokeKey?.name}&quot; immediately invalidates it. Applications using
              it will start receiving 401 errors within a few minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={revoking}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={revoke}
              disabled={revoking}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {revoking ? 'Revoking…' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageCanvas>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
        {label}
      </Label>
      {children}
    </div>
  );
}
