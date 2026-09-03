'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
} from '@/components/dashboard/inference/chrome';

interface ByokKey {
  id: string;
  name: string;
  provider: string;
  preview: string;
  is_valid: boolean;
  last_verified_at: string | null;
  last_verify_error: string | null;
  created_at: string;
}

// 'wokey' is the only provider the gateway actually routes BYOK traffic to.
// The rest are reserved for a future direct-routing path — a key stored under
// any of them is encrypted and kept, but will never be selected at request
// time, so they are labelled as inactive rather than presented as choices that
// work. 'openrouter' is absent deliberately: it is no longer an upstream, and
// offering it would let someone add a key that silently never gets used.
const PROVIDERS = [
  { value: 'wokey', label: 'Wokey — all models (recommended)' },
  { value: 'openai', label: 'OpenAI (not yet routed)' },
  { value: 'anthropic', label: 'Anthropic (not yet routed)' },
  { value: 'google', label: 'Google (not yet routed)' },
  { value: 'mistral', label: 'Mistral (not yet routed)' },
  { value: 'custom', label: 'Custom' },
];

export default function ByokKeysPage() {
  const [keys, setKeys] = useState<ByokKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteKey, setDeleteKey] = useState<ByokKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({ name: '', provider: 'wokey', api_key: '' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inference/byok-keys', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load BYOK keys');
      const data = await r.json();
      setKeys(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim() || !form.api_key.trim()) {
      toast.error('Name and API key are required');
      return;
    }
    setCreating(true);
    try {
      const r = await fetch('/api/inference/byok-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: form.name.trim(),
          provider: form.provider,
          api_key: form.api_key.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to add BYOK key');
      toast.success(`Added "${form.name}"`);
      setForm({ name: '', provider: 'wokey', api_key: '' });
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add BYOK key');
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!deleteKey) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/inference/byok-keys/${deleteKey.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error ?? 'Failed to delete');
      }
      toast.success(`Deleted "${deleteKey.name}"`);
      setDeleteKey(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // Stats
  const validCount = keys.filter((k) => k.is_valid).length;
  const providers = new Set(keys.map((k) => k.provider)).size;
  const routableCount = keys.filter((k) => k.provider === 'wokey').length;

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="BYOK"
        accent="provider keys"
        caption="Bring your own provider key. Requests with X-Ahura-Billing: byok proxy through your account, your provider bills directly. Keys are AES-GCM encrypted at rest."
        size="md"
        actions={
          <>
            <GhostButton onClick={load} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add key
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Stored keys" value={String(keys.length)} hint="Encrypted at rest" />
        <StatCell
          label="Verified"
          value={String(validCount)}
          suffix={keys.length > 0 ? `/ ${keys.length}` : undefined}
          hint="Last upstream check passed"
          accent={validCount > 0 ? '#4ade80' : undefined}
        />
        <StatCell
          label="Routable keys"
          value={String(routableCount)}
          hint="Wokey · active upstream"
          accent={routableCount > 0 ? ACCENT : undefined}
        />
        <StatCell
          label="Providers"
          value={String(providers)}
          hint={providers > 0 ? 'Distinct upstreams' : 'None configured'}
        />
      </StatsStrip>

      <SectionHead
        title="Stored"
        accent="keys"
        rightMeta={keys.length > 0 ? `${validCount} verified · ${keys.length} total` : undefined}
      />

      {loading ? (
        <DataTable>
          <div className={`${MONO} px-5 py-12 text-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>
            Loading…
          </div>
        </DataTable>
      ) : keys.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.7fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Provider</ColHead>
            <ColHead>Key</ColHead>
            <ColHead>Status</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {keys.map((k) => (
            <div
              key={k.id}
              className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.7fr)] md:items-center"
            >
              <div className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>
                {k.name}
                <span className={`${MONO} block text-[10px] text-white/35 mt-0.5 uppercase tracking-[0.04em]`}>
                  added {new Date(k.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className={`${MONO} text-[11.5px] uppercase tracking-[0.04em] text-white/75`}>
                {k.provider}
              </div>
              <div className={`${MONO} text-[11.5px] text-white/55 tabular-nums truncate`}>{k.preview}</div>
              <div className="inline-flex flex-col items-start gap-0.5">
                <div className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      background: k.is_valid ? '#4ade80' : '#f87171',
                      boxShadow: `0 0 5px ${k.is_valid ? '#4ade80' : '#f87171'}`,
                    }}
                  />
                  <span
                    className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                    style={{ color: k.is_valid ? '#4ade80' : '#f87171' }}
                  >
                    {k.is_valid ? 'Verified' : 'Invalid'}
                  </span>
                </div>
                {k.last_verify_error && (
                  <span className={`${MONO} text-[10px] text-red-300/70 max-w-[200px] truncate`}>
                    {k.last_verify_error}
                  </span>
                )}
                {!k.last_verify_error && k.last_verified_at && (
                  <span className={`${MONO} text-[10px] text-white/35`}>
                    {new Date(k.last_verified_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <RowActionButton onClick={() => setDeleteKey(k)} variant="danger">
                  <Trash2 className="h-3 w-3" />
                  Delete
                </RowActionButton>
              </div>
            </div>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No BYOK keys yet"
          description="Add a provider key to route requests through your own account. Add a Wokey key — it covers every model in the catalog."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add your first BYOK key
            </PrimaryButton>
          }
        />
      )}

      {/* Notes / how-to */}
      <section className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-3">
        <NoteCard
          title="Switch billing per request"
          body="Add the X-Ahura-Billing: byok header to any /v1 request. The gateway looks up your stored key for the matching provider and proxies through it."
        />
        <NoteCard
          title="Validated at create"
          body="Wokey keys are verified with a 1-token completion before storage, since the provider exposes no key-introspection endpoint. Failed verifications surface in the status column and block BYOK billing until resolved."
        />
      </section>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Add BYOK key
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              Keys are AES-GCM encrypted before storage. Plaintext is never persisted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="my-wokey-key"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <Field label="Provider">
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="API key">
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder={form.provider === 'wokey' ? 'wk-…' : 'sk-…'}
                className="bg-white/[0.02] border-white/[0.08] font-mono"
              />
              <p className={`${MONO} mt-1 text-[10.5px] text-white/40`}>
                Verified against the upstream before storing.
              </p>
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </GhostButton>
            <PrimaryButton
              onClick={create}
              disabled={creating || !form.name.trim() || !form.api_key.trim()}
            >
              {creating ? 'Verifying…' : 'Add key'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteKey} onOpenChange={() => setDeleteKey(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete BYOK key
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Deleting &quot;{deleteKey?.name}&quot; removes it immediately. Any BYOK-billed
              request will fall back to platform billing or fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={deleting}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {deleting ? 'Deleting…' : 'Delete'}
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

function NoteCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
      <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-1.5">{title}</h4>
      <p className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>{body}</p>
    </div>
  );
}

// Keep the icon imports lint-happy
const _icons = { CheckCircle2, AlertCircle };
void _icons;
