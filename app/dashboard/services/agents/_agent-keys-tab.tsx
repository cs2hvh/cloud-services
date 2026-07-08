'use client';

/**
 * Access Keys tab (doc: manager ask 2026-07-08) — mint a key restricted to
 * running/reading only this one agent, for external/commercial distribution.
 * Same show-once create pattern as byok-keys/mcp-servers. Backed by
 * app/api/agents/[id]/keys (list/create) + .../keys/[keyId] (revoke).
 *
 * Two tiers, mirroring Stripe's pk_/sk_ split:
 *  - private (ahu_live_...): server-to-server only, full trace/cost visible.
 *  - public  (ahu_pub_...): safe to embed in a customer's website JS —
 *    origin-restricted server-side, and every response has cost/step
 *    internals redacted (see workers/inference/src/routes/agent-runs.ts).
 */
import { useEffect, useState } from 'react';
import { Copy, Key, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PrimaryButton, GhostButton, MONO } from '@/components/dashboard/inference/chrome';
import { relativeTime } from './_constants';
import { copyToClipboard } from '@/lib/utils/safe-clipboard';

type KeyTier = 'private' | 'public';

interface AgentKey {
  id: string;
  name: string;
  preview: string;
  tier: KeyTier;
  allowed_origins: string[] | null;
  rate_limit_rpm: number | null;
  monthly_budget_cents: number | null;
  hard_cap_cents: number | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

// $20/mo — mirrors the server-side default (app/api/agents/[id]/keys/route.ts,
// DEFAULT_PUBLIC_KEY_HARD_CAP_CENTS) so the form shows what will actually be
// applied, not a silent surprise. Public keys always get SOME cap (DB-enforced,
// chk_public_key_has_hard_cap) — a public key is visible to anyone by design,
// so an unbounded one has no real protection against a scraped/replayed key.
const DEFAULT_PUBLIC_CAP_DOLLARS = '20';

// Left blank for a fresh/private key — blank means "inherit the platform
// default" (600 rpm, see workers/inference DEFAULT_RPM), not throttled.
// Found on review: this used to hardcode '60' regardless of tier, so a
// private backend-integration key someone created without touching this
// field got silently limited to 1 req/sec instead of the real default —
// the low-default reasoning only ever applied to public/external-facing keys.
const emptyForm = { name: '', tier: 'private' as KeyTier, origins: [''], rate_limit_rpm: '', hard_cap_dollars: '', expires_at: '' };
const SUGGESTED_PUBLIC_RPM = '60';

export function AgentKeysTab({ agentId }: { agentId: string }) {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<AgentKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/agents/${agentId}/keys`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Failed to load access keys');
      setKeys(j.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [agentId]);

  const create = async () => {
    if (!form.name.trim()) { toast.error('Give the key a name'); return; }
    const origins = form.origins.map((o) => o.trim()).filter(Boolean);
    if (form.tier === 'public' && origins.length === 0) {
      toast.error('Public keys need at least one allowed origin');
      return;
    }
    setCreating(true);
    try {
      const rpm = Number(form.rate_limit_rpm);
      const capDollars = Number(form.hard_cap_dollars);
      const r = await fetch(`/api/agents/${agentId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          tier: form.tier,
          ...(form.tier === 'public' ? { allowed_origins: origins } : {}),
          ...(Number.isFinite(rpm) && rpm > 0 ? { rate_limit_rpm: rpm } : {}),
          // Blank = let the server apply its own default for public keys
          // (never left unbounded — see DEFAULT_PUBLIC_KEY_HARD_CAP_CENTS).
          ...(Number.isFinite(capDollars) && capDollars > 0 ? { hard_cap_cents: Math.round(capDollars * 100) } : {}),
          ...(form.expires_at ? { expires_at: new Date(form.expires_at).toISOString() } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Failed to create access key');
      setNewKey(j.data.api_key);
      setForm(emptyForm);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create access key');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!deleteKey) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/agents/${agentId}/keys/${deleteKey.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error ?? 'Failed to revoke');
      }
      toast.success(`Revoked "${deleteKey.name}"`);
      setDeleteKey(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] text-white/45 max-w-xl">
          A key here only works for <span className="text-white/70">this agent</span>. <span className="text-white/70">Private</span> keys
          are for your own backend — full trace/cost visible. <span className="text-white/70">Public</span> keys are safe to put in your
          website&apos;s JavaScript — origin-restricted, and visitors only ever see the agent&apos;s replies, never cost or tool-call details.
        </p>
        <PrimaryButton onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New access key
        </PrimaryButton>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#111216] overflow-hidden">
        {loading ? (
          <div className={`${MONO} px-5 py-10 text-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>Loading…</div>
        ) : keys.length === 0 ? (
          <div className="px-5 py-10 text-center text-white/35 text-sm">No access keys yet for this agent.</div>
        ) : (
          keys.map((k) => (
            <div key={k.id} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-white/85 font-medium">{k.name}</span>
                  <span
                    className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${
                      k.tier === 'public' ? 'bg-[#33adff]/10 text-[#66c2ff]' : 'bg-white/[0.06] text-white/50'
                    }`}
                  >
                    {k.tier}
                  </span>
                </div>
                <div className={`${MONO} text-[11px] text-white/40 mt-0.5`}>{k.preview}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                  <span className={`${MONO} inline-flex items-center gap-1 text-[10.5px] ${k.last_used_at ? 'text-emerald-300/80' : 'text-white/30'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${k.last_used_at ? 'bg-emerald-400' : 'bg-white/20'}`} />
                    {k.last_used_at ? `used ${relativeTime(k.last_used_at)}` : 'never used yet'}
                  </span>
                  <span className={`${MONO} text-[10.5px] text-white/35`}>created {relativeTime(k.created_at)}</span>
                  {k.rate_limit_rpm && <span className={`${MONO} text-[10.5px] text-white/35`}>{k.rate_limit_rpm} rpm</span>}
                  {k.hard_cap_cents != null && <span className={`${MONO} text-[10.5px] text-white/35`}>capped ${(k.hard_cap_cents / 100).toFixed(2)}/mo</span>}
                  {k.expires_at && <span className={`${MONO} text-[10.5px] text-amber-300/70`}>expires {new Date(k.expires_at).toLocaleDateString()}</span>}
                </div>
                {k.tier === 'public' && k.allowed_origins && k.allowed_origins.length > 0 && (
                  <div className={`${MONO} text-[10.5px] text-white/35 mt-1.5 flex flex-wrap gap-1.5`}>
                    {k.allowed_origins.map((o) => (
                      <span key={o} className="rounded bg-white/[0.04] px-1.5 py-0.5 border border-white/[0.06]">{o}</span>
                    ))}
                  </div>
                )}
              </div>
              <GhostButton onClick={() => setDeleteKey(k)}>
                <Trash2 className="h-3 w-3" /> Revoke
              </GhostButton>
            </div>
          ))
        )}
      </div>

      <IntegrationSnippets agentId={agentId} />

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setNewKey(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216]">
          {newKey ? (
            <>
              <DialogHeader>
                <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
                  <Key className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" /> Access key created
                </DialogTitle>
                <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
                  Copy this now — it will never be shown again.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2.5">
                <code className={`${MONO} text-[12px] text-[#66c2ff] break-all flex-1`}>{newKey}</code>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(newKey);
                    if (ok) toast.success('Copied');
                    else toast.error('Copy failed — select the key and copy manually');
                  }}
                  className="text-white/40 hover:text-white shrink-0"
                  aria-label="Copy key"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <DialogFooter>
                <PrimaryButton onClick={() => { setCreateOpen(false); setNewKey(null); }}>Done</PrimaryButton>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
                  New access key
                </DialogTitle>
                <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
                  {form.tier === 'public'
                    ? 'Safe to put in your website’s JavaScript — restricted to the origins below.'
                    : 'Server-to-server only — hand this to a partner’s backend, never a browser.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <Field label="Name">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Partner integration — Acme Corp"
                    className="bg-white/[0.02] border-white/[0.08]"
                  />
                </Field>
                <Field label="Tier">
                  <div className="flex gap-2">
                    {(['private', 'public'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({
                          ...form,
                          tier: t,
                          // Prefill the spend cap the moment they pick public —
                          // a public key is never left unbounded, so show the
                          // number that will actually apply instead of a
                          // silent server-side surprise. Left as-is (blank)
                          // for private since no cap is required there.
                          hard_cap_dollars: t === 'public' && !form.hard_cap_dollars ? DEFAULT_PUBLIC_CAP_DOLLARS : form.hard_cap_dollars,
                          // Same reasoning, same pattern: a low rpm suggestion
                          // only makes sense for a public/external-facing key.
                          // Blank for private = inherit the platform default,
                          // not a silent 60rpm throttle on a backend integration.
                          rate_limit_rpm: t === 'public' && !form.rate_limit_rpm ? SUGGESTED_PUBLIC_RPM : form.rate_limit_rpm,
                        })}
                        className={`${MONO} flex-1 h-9 rounded-lg border text-[11px] uppercase tracking-[0.1em] transition-colors ${
                          form.tier === t
                            ? 'border-[#0095FF]/50 bg-[#0095FF]/10 text-white'
                            : 'border-white/[0.08] text-white/50 hover:border-white/[0.16]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>
                {form.tier === 'public' && (
                  <Field label="Allowed origins">
                    <div className="space-y-2">
                      {form.origins.map((o, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            value={o}
                            onChange={(e) => setForm({ ...form, origins: form.origins.map((x, j) => (j === i ? e.target.value : x)) })}
                            placeholder="https://example.com"
                            className="bg-white/[0.02] border-white/[0.08] font-mono flex-1"
                          />
                          {form.origins.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, origins: form.origins.filter((_, j) => j !== i) })}
                              className="text-white/30 hover:text-red-400 shrink-0"
                              aria-label="Remove origin"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, origins: [...form.origins, ''] })}
                        className="text-[11px] text-[#33adff] hover:text-[#5cb8ff]"
                      >
                        + Add another origin
                      </button>
                    </div>
                  </Field>
                )}
                <Field label="Rate limit (requests/min, optional)">
                  <Input
                    type="number" min={1} max={10000}
                    value={form.rate_limit_rpm}
                    onChange={(e) => setForm({ ...form, rate_limit_rpm: e.target.value })}
                    placeholder="600 (platform default)"
                    className="bg-white/[0.02] border-white/[0.08] font-mono"
                  />
                </Field>
                <Field label={form.tier === 'public' ? 'Monthly spend cap ($) — required for public keys' : 'Monthly spend cap ($, optional)'}>
                  <Input
                    type="number" min={1} step="0.01"
                    value={form.hard_cap_dollars}
                    onChange={(e) => setForm({ ...form, hard_cap_dollars: e.target.value })}
                    placeholder={form.tier === 'public' ? DEFAULT_PUBLIC_CAP_DOLLARS : 'No cap'}
                    className="bg-white/[0.02] border-white/[0.08] font-mono"
                  />
                  {form.tier === 'public' && (
                    <p className={`${MONO} mt-1 text-[10px] text-white/40`}>
                      A public key is visible to anyone who views your page source — this is the ceiling on what it can ever cost if scraped or replayed.
                    </p>
                  )}
                </Field>
                <Field label="Expires (optional)">
                  <Input
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                    className="bg-white/[0.02] border-white/[0.08]"
                  />
                </Field>
              </div>
              <DialogFooter className="gap-2">
                <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</GhostButton>
                <PrimaryButton onClick={create} disabled={creating || !form.name.trim()}>
                  {creating ? 'Creating…' : 'Create'}
                </PrimaryButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteKey} onOpenChange={() => setDeleteKey(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Revoke access key
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              &quot;{deleteKey?.name}&quot; stops working immediately — any external caller using it gets 401 on the next request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={revoke}
              disabled={deleting}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {deleting ? 'Revoking…' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>{label}</Label>
      {children}
    </div>
  );
}

/** Copy-paste integration snippets — closes the "how does the customer
 *  actually use this" loop, matching every real API dashboard (Stripe,
 *  OpenAI) that shows working code right next to the keys that call it. */
function IntegrationSnippets({ agentId }: { agentId: string }) {
  const [tab, setTab] = useState<KeyTier>('private');

  const privateSnippet = `# Server-to-server — create a run, then poll it
curl -X POST https://api.ahurasense.com/v1/agents/${agentId}/runs \\
  -H "Authorization: Bearer <YOUR_PRIVATE_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "Hello!"}'
# -> { "id": "run_...", "status": "queued" }

curl https://api.ahurasense.com/v1/agents/runs/<run_id> \\
  -H "Authorization: Bearer <YOUR_PRIVATE_KEY>"
# -> full trace: cost_cents, steps[], output, ...`;

  const publicSnippet = `// Browser — safe to ship in your site's JS.
// Visitors only ever see the reply, never cost/tool-call internals.
const res = await fetch("https://api.ahurasense.com/v1/agents/${agentId}/runs", {
  method: "POST",
  headers: { Authorization: "Bearer <YOUR_PUBLIC_KEY>", "Content-Type": "application/json" },
  body: JSON.stringify({ input: "Hello!" }),
});
const { id } = await res.json();

// EventSource can't set headers, so the public key rides as a query param
// (rejected outright for a private key — see workers/inference auth.ts).
const stream = new EventSource(
  \`https://api.ahurasense.com/v1/agents/runs/\${id}/stream?key=<YOUR_PUBLIC_KEY>\`
);
// Redacted responses collapse to just { text } — see extractFinalText() in
// workers/inference/src/routes/agent-runs.ts. Only response.output.text
// exists for a public key, never response.output directly.
stream.addEventListener("response.completed", (e) => {
  console.log(JSON.parse(e.data).response.output.text);
  stream.close();
});`;

  const snippet = tab === 'private' ? privateSnippet : publicSnippet;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111216] overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-1">
          {(['private', 'public'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`${MONO} text-[10.5px] uppercase tracking-[0.1em] px-3 py-1.5 rounded-t-lg border-b-2 transition-colors ${
                tab === t ? 'text-white border-[#0095FF]' : 'text-white/40 border-transparent hover:text-white/70'
              }`}
            >
              {t} integration
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            const ok = await copyToClipboard(snippet);
            if (ok) toast.success('Copied');
            else toast.error('Copy failed — select the code and copy manually');
          }}
          className="text-white/35 hover:text-white p-1.5 -mt-1"
          aria-label="Copy snippet"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <pre className={`${MONO} text-[11px] leading-relaxed text-white/75 p-4 overflow-x-auto whitespace-pre`}>
        {snippet}
      </pre>
    </div>
  );
}
