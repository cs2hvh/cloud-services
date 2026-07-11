'use client';

/**
 * MCP Servers — registry management (M4, doc 14 §4/§12b).
 *
 * Mirrors app/dashboard/services/inference/byok-keys/page.tsx: list + register
 * Dialog + status badges + delete confirmation. Closes the M3 gap where the
 * only way to REGISTER a server was the API directly — the builder's picker
 * (_mcp-server-picker.tsx) could only ATTACH an already-registered one.
 *
 * Curated (org_id NULL) rows show up in the same list — platform-owned, no
 * delete action (the org-scoped DELETE route can't touch them anyway; hiding
 * the button avoids a confusing 404).
 */
import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Pencil, Plug, Plus, RotateCw, Trash2, XCircle } from 'lucide-react';
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

interface McpServer {
  id: string;
  org_id: string | null;
  slug: string;
  display_name: string;
  server_url: string;
  auth_type: 'static' | 'oauth';
  has_token: boolean;
  oauth_client_id: string | null;
  oauth_status: 'pending' | 'connected' | 'error' | null;
  oauth_last_error: string | null;
  allowed_tools: string[];
  visibility: 'private' | 'curated';
  status: 'active' | 'error' | 'disabled';
  last_error: string | null;
  created_at: string;
}

const emptyForm = {
  slug: '', display_name: '', server_url: '', auth_type: 'static' as 'static' | 'oauth',
  auth_token: '', oauth_client_id: '', oauth_client_secret: '', oauth_scope: '', allowed_tools: '',
};
const emptyEditForm = {
  display_name: '', server_url: '', auth_token: '',
  oauth_client_id: '', oauth_client_secret: '', oauth_scope: '', allowed_tools: '',
};

export default function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteServer, setDeleteServer] = useState<McpServer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editServer, setEditServer] = useState<McpServer | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/agents/mcp-servers');
      if (!r.ok) throw new Error('Failed to load MCP servers');
      const data = await r.json();
      setServers(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // The OAuth callback route redirects back here with ?mcp_oauth=connected|error
  // (see app/api/agents/mcp-servers/oauth/callback/route.ts) — surface it once,
  // then strip it from the URL so a page refresh doesn't re-toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('mcp_oauth');
    if (!result) return;
    if (result === 'connected') toast.success('MCP server connected via OAuth');
    else toast.error(`OAuth connection failed${params.get('reason') ? `: ${params.get('reason')}` : ''}`);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const create = async () => {
    if (!form.slug.trim() || !form.display_name.trim() || !form.server_url.trim()) {
      toast.error('Slug, name, and server URL are required');
      return;
    }
    if (form.auth_type === 'oauth' && !form.oauth_client_id.trim()) {
      toast.error('OAuth client ID is required');
      return;
    }
    setCreating(true);
    try {
      const allowed_tools = form.allowed_tools.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await fetch('/api/agents/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: form.slug.trim(),
          display_name: form.display_name.trim(),
          server_url: form.server_url.trim(),
          auth_type: form.auth_type,
          ...(form.auth_type === 'static' && form.auth_token.trim() ? { auth_token: form.auth_token.trim() } : {}),
          ...(form.auth_type === 'oauth' ? {
            oauth_client_id: form.oauth_client_id.trim(),
            ...(form.oauth_client_secret.trim() ? { oauth_client_secret: form.oauth_client_secret.trim() } : {}),
            ...(form.oauth_scope.trim() ? { oauth_scope: form.oauth_scope.trim() } : {}),
          } : {}),
          ...(allowed_tools.length ? { allowed_tools } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to register MCP server');
      toast.success(`Registered "${form.display_name}"`);
      setForm(emptyForm);
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register MCP server');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (s: McpServer) => {
    setEditServer(s);
    setEditForm({
      display_name: s.display_name,
      server_url: s.server_url,
      auth_token: '', // never returned by the API — blank means "leave unchanged"
      oauth_client_id: s.oauth_client_id ?? '',
      oauth_client_secret: '', // never returned — blank means "leave unchanged"
      oauth_scope: '',
      allowed_tools: s.allowed_tools.join(', '),
    });
  };

  const save = async () => {
    if (!editServer) return;
    if (!editForm.display_name.trim() || !editForm.server_url.trim()) {
      toast.error('Name and server URL are required');
      return;
    }
    setSaving(true);
    try {
      const allowed_tools = editForm.allowed_tools.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`/api/agents/mcp-servers/${editServer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: editForm.display_name.trim(),
          server_url: editForm.server_url.trim(),
          allowed_tools,
          ...(editForm.auth_token.trim() ? { auth_token: editForm.auth_token.trim() } : {}),
          ...(editServer.auth_type === 'oauth' ? {
            ...(editForm.oauth_client_id.trim() ? { oauth_client_id: editForm.oauth_client_id.trim() } : {}),
            ...(editForm.oauth_client_secret.trim() ? { oauth_client_secret: editForm.oauth_client_secret.trim() } : {}),
            ...(editForm.oauth_scope.trim() ? { oauth_scope: editForm.oauth_scope.trim() } : {}),
          } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to save changes');
      toast.success(`Saved "${editForm.display_name.trim()}"`);
      setEditServer(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteServer) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/agents/mcp-servers/${deleteServer.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error ?? 'Failed to delete');
      }
      toast.success(`Deleted "${deleteServer.display_name}"`);
      setDeleteServer(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = servers.filter((s) => s.status === 'active').length;
  const curatedCount = servers.filter((s) => s.visibility === 'curated').length;
  const privateCount = servers.length - curatedCount;

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Agents', href: '/dashboard/services/agents' }}
        title="MCP Servers"
        accent="registry"
        caption="Register a remote MCP server once, then bind it by slug in any agent's builder — no need to re-type the URL each time. Auth tokens are AES-GCM encrypted at rest."
        size="md"
        actions={
          <>
            <GhostButton onClick={load} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Register server
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Registered" value={String(servers.length)} hint="Your org + curated catalog" />
        <StatCell
          label="Active"
          value={String(activeCount)}
          suffix={servers.length > 0 ? `/ ${servers.length}` : undefined}
          hint="Reachable at last check"
          accent={activeCount > 0 ? '#4ade80' : undefined}
        />
        <StatCell label="Your servers" value={String(privateCount)} hint="Registered by your org" />
        <StatCell label="Curated" value={String(curatedCount)} hint="Platform-vetted catalog" />
      </StatsStrip>

      <SectionHead
        eyebrow="Registry"
        title="Registered"
        accent="servers"
        rightMeta={servers.length > 0 ? `${activeCount} active · ${servers.length} total` : undefined}
      />

      {loading ? (
        <DataTable>
          <div className={`${MONO} px-5 py-12 text-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>
            Loading…
          </div>
        </DataTable>
      ) : servers.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.7fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Server URL</ColHead>
            <ColHead>Visibility</ColHead>
            <ColHead>Status</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {servers.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.7fr)] md:items-center"
            >
              <div className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>
                {s.display_name}
                <span className={`${MONO} block text-[10px] text-white/35 mt-0.5 uppercase tracking-[0.04em]`}>
                  {s.slug} · {s.auth_type === 'oauth' ? (
                    <span style={{ color: s.oauth_status === 'connected' ? '#4ade80' : s.oauth_status === 'error' ? '#f87171' : '#a1a1aa' }}>
                      oauth: {s.oauth_status ?? 'pending'}
                    </span>
                  ) : (
                    s.has_token ? 'token set' : 'no auth'
                  )}
                </span>
              </div>
              <div className={`${MONO} text-[11.5px] text-white/55 truncate`}>{s.server_url}</div>
              <div className={`${MONO} text-[11px] uppercase tracking-[0.04em] ${s.visibility === 'curated' ? 'text-[#33adff]' : 'text-white/60'}`}>
                {s.visibility}
              </div>
              <div className="inline-flex flex-col items-start gap-0.5">
                <div className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      background: s.status === 'active' ? '#4ade80' : s.status === 'error' ? '#f87171' : '#a1a1aa',
                      boxShadow: s.status === 'active' ? '0 0 5px #4ade80' : undefined,
                    }}
                  />
                  <span
                    className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                    style={{ color: s.status === 'active' ? '#4ade80' : s.status === 'error' ? '#f87171' : '#a1a1aa' }}
                  >
                    {s.status}
                  </span>
                </div>
                {s.last_error && (
                  <span className={`${MONO} text-[10px] text-red-300/70 max-w-[200px] truncate`}>{s.last_error}</span>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {s.org_id ? (
                  <>
                    {s.auth_type === 'oauth' && s.oauth_status !== 'connected' && (
                      <RowActionButton onClick={() => { window.location.href = `/api/agents/mcp-servers/${s.id}/oauth/authorize`; }}>
                        <Plug className="h-3 w-3" />
                        Connect
                      </RowActionButton>
                    )}
                    <RowActionButton onClick={() => openEdit(s)}>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </RowActionButton>
                    <RowActionButton onClick={() => setDeleteServer(s)} variant="danger">
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </RowActionButton>
                  </>
                ) : (
                  <span className={`${MONO} text-[10px] text-white/30 uppercase tracking-[0.1em]`}>platform-owned</span>
                )}
              </div>
            </div>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No MCP servers yet"
          description="Register a remote MCP server (Streamable HTTP) once, then attach it to any agent by picking it from the builder's 'Saved servers' list."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Register your first server
            </PrimaryButton>
          }
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Register MCP server
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              The agent connects at run time, discovers the server&apos;s tools, and calls
              them namespaced as mcp__label__tool. Auth tokens are AES-GCM encrypted before storage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Slug (bind key)">
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="deepwiki"
                className="bg-white/[0.02] border-white/[0.08] font-mono"
              />
              <p className={`${MONO} mt-1 text-[10.5px] text-white/40`}>
                Lowercase, alphanumeric/underscore/hyphen. What you pick by in any agent&apos;s builder.
              </p>
            </Field>
            <Field label="Display name">
              <Input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="DeepWiki (GitHub repo Q&A)"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <Field label="Server URL">
              <Input
                value={form.server_url}
                onChange={(e) => setForm({ ...form, server_url: e.target.value })}
                placeholder="https://mcp.example.com/mcp"
                className="bg-white/[0.02] border-white/[0.08] font-mono"
              />
            </Field>
            <Field label="Authentication">
              <div className="flex gap-1.5">
                {(['static', 'oauth'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, auth_type: t })}
                    className={`${MONO} px-2.5 py-1 rounded text-[10.5px] uppercase tracking-[0.1em] border transition-colors ${
                      form.auth_type === t
                        ? 'border-[#33adff]/40 bg-[#33adff]/10 text-[#33adff]'
                        : 'border-white/[0.08] text-white/45 hover:text-white/70'
                    }`}
                  >
                    {t === 'static' ? 'Bearer token' : 'OAuth 2.1'}
                  </button>
                ))}
              </div>
            </Field>
            {form.auth_type === 'static' ? (
              <Field label="Auth token (optional)">
                <Input
                  type="password"
                  value={form.auth_token}
                  onChange={(e) => setForm({ ...form, auth_token: e.target.value })}
                  placeholder="Bearer token, if the server requires auth"
                  className="bg-white/[0.02] border-white/[0.08] font-mono"
                />
              </Field>
            ) : (
              <>
                <Field label="OAuth client ID">
                  <Input
                    value={form.oauth_client_id}
                    onChange={(e) => setForm({ ...form, oauth_client_id: e.target.value })}
                    placeholder="From an OAuth app you created on the provider"
                    className="bg-white/[0.02] border-white/[0.08] font-mono"
                  />
                </Field>
                <Field label="OAuth client secret (optional for public clients)">
                  <Input
                    type="password"
                    value={form.oauth_client_secret}
                    onChange={(e) => setForm({ ...form, oauth_client_secret: e.target.value })}
                    className="bg-white/[0.02] border-white/[0.08] font-mono"
                  />
                </Field>
                <Field label="Scope (optional)">
                  <Input
                    value={form.oauth_scope}
                    onChange={(e) => setForm({ ...form, oauth_scope: e.target.value })}
                    placeholder="e.g. repo read:org"
                    className="bg-white/[0.02] border-white/[0.08] font-mono"
                  />
                </Field>
                <p className={`${MONO} text-[10.5px] text-white/40`}>
                  After registering, click &quot;Connect&quot; on this server to complete the consent flow.
                </p>
              </>
            )}
            <Field label="Allowed tools (optional)">
              <Input
                value={form.allowed_tools}
                onChange={(e) => setForm({ ...form, allowed_tools: e.target.value })}
                placeholder="comma-separated — blank = all tools the server offers"
                className="bg-white/[0.02] border-white/[0.08] font-mono"
              />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </GhostButton>
            <PrimaryButton
              onClick={create}
              disabled={creating || !form.slug.trim() || !form.display_name.trim() || !form.server_url.trim()}
            >
              {creating ? 'Registering…' : 'Register'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editServer} onOpenChange={(open) => !open && setEditServer(null)}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Edit MCP server
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              Slug &quot;{editServer?.slug}&quot; stays fixed — it&apos;s the bind key every agent
              references, so changing it would break existing bindings. Leave the auth token
              blank to keep the one already stored.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Display name">
              <Input
                value={editForm.display_name}
                onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <Field label="Server URL">
              <Input
                value={editForm.server_url}
                onChange={(e) => setEditForm({ ...editForm, server_url: e.target.value })}
                className="bg-white/[0.02] border-white/[0.08] font-mono"
              />
            </Field>
            {editServer?.auth_type === 'oauth' ? (
              <>
                <Field label={`OAuth client ID ${editServer.oauth_client_id ? '(leave blank to keep it)' : ''}`}>
                  <Input
                    value={editForm.oauth_client_id}
                    onChange={(e) => setEditForm({ ...editForm, oauth_client_id: e.target.value })}
                    placeholder={editServer.oauth_client_id ?? 'From an OAuth app you created on the provider'}
                    className="bg-white/[0.02] border-white/[0.08] font-mono"
                  />
                </Field>
                <Field label="OAuth client secret (set — leave blank to keep it)">
                  <Input
                    type="password"
                    value={editForm.oauth_client_secret}
                    onChange={(e) => setEditForm({ ...editForm, oauth_client_secret: e.target.value })}
                    placeholder="••••••••"
                    className="bg-white/[0.02] border-white/[0.08] font-mono"
                  />
                </Field>
                <Field label="Scope (leave blank to keep it)">
                  <Input
                    value={editForm.oauth_scope}
                    onChange={(e) => setEditForm({ ...editForm, oauth_scope: e.target.value })}
                    placeholder="e.g. repo read:org"
                    className="bg-white/[0.02] border-white/[0.08] font-mono"
                  />
                </Field>
                {editServer.oauth_status !== 'connected' && (
                  <p className={`${MONO} text-[10.5px] text-white/40`}>
                    Changed the client ID or secret? Click &quot;Connect&quot; again after saving to re-authorize.
                  </p>
                )}
              </>
            ) : (
              <Field label={`Auth token ${editServer?.has_token ? '(set — leave blank to keep it)' : '(optional)'}`}>
                <Input
                  type="password"
                  value={editForm.auth_token}
                  onChange={(e) => setEditForm({ ...editForm, auth_token: e.target.value })}
                  placeholder={editServer?.has_token ? '••••••••' : 'Bearer token, if the server requires auth'}
                  className="bg-white/[0.02] border-white/[0.08] font-mono"
                />
              </Field>
            )}
            <Field label="Allowed tools (optional)">
              <Input
                value={editForm.allowed_tools}
                onChange={(e) => setEditForm({ ...editForm, allowed_tools: e.target.value })}
                placeholder="comma-separated — blank = all tools the server offers"
                className="bg-white/[0.02] border-white/[0.08] font-mono"
              />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setEditServer(null)} disabled={saving}>
              Cancel
            </GhostButton>
            <PrimaryButton
              onClick={save}
              disabled={saving || !editForm.display_name.trim() || !editForm.server_url.trim()}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteServer} onOpenChange={() => setDeleteServer(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete MCP server
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Deleting &quot;{deleteServer?.display_name}&quot; removes it immediately. Any agent
              still bound to slug &quot;{deleteServer?.slug}&quot; will simply skip it at the next
              run (best-effort — no run failure), advertising no tools from it.
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

// Keep the icon imports lint-happy (status dot + badge glyphs match byok-keys'
// convention even though this list renders them via inline style/text, not
// these components directly — kept for a future richer status treatment).
const _icons = { CheckCircle2, AlertCircle, XCircle, Plug };
void _icons;
