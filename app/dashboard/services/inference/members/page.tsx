'use client';

import { useEffect, useState } from 'react';
import { RotateCw, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from '@/components/dashboard/inference/chrome';

type Role = 'owner' | 'admin' | 'developer' | 'viewer';

interface Member {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  invited_at: string | null;
  joined_at: string | null;
  is_you: boolean;
}

interface MembersResponse {
  org: { id: string; slug: string; name: string; your_role: Role };
  counts: {
    total: number;
    owners: number;
    admins: number;
    developers: number;
    viewers: number;
    invited: number;
  };
  data: Member[];
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner — full control' },
  { value: 'admin', label: 'Admin — keys, members, billing' },
  { value: 'developer', label: 'Developer — keys + usage' },
  { value: 'viewer', label: 'Viewer — read-only' },
];

function roleColor(role: Role): string {
  return role === 'owner'
    ? '#fbbf24'
    : role === 'admin'
      ? ACCENT
      : role === 'developer'
        ? '#4ade80'
        : 'rgba(255,255,255,0.55)';
}

export default function MembersPage() {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [removeMember, setRemoveMember] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inference/members', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load members');
      setData(await r.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isAdminish = data?.org.your_role === 'owner' || data?.org.your_role === 'admin';

  const changeRole = async (m: Member, role: Role) => {
    if (m.role === role) return;
    setUpdating(m.id);
    try {
      const r = await fetch(`/api/inference/members/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Failed to update role');
      toast.success(`Role updated to ${role}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdating(null);
    }
  };

  const remove = async () => {
    if (!removeMember) return;
    setRemoving(true);
    try {
      const r = await fetch(`/api/inference/members/${removeMember.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Failed to remove');
      toast.success('Member removed');
      setRemoveMember(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Team"
        accent="members"
        caption="Manage who can access this inference org and what they can do. Roles control visibility of keys, BYOK config, usage, and settings."
        size="md"
        actions={
          <>
            <GhostButton onClick={load} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
            <PrimaryButton
              onClick={() => toast.info('Email invite flow ships in Phase 7. For now, share the org slug with the user — they auto-join via [[bootstrap_personal_org]] on their first inference visit.')}
              disabled={!isAdminish}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invite member
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Active members" value={String(data?.counts.total ?? 0)} hint="Across all roles" />
        <StatCell
          label="Owners"
          value={String(data?.counts.owners ?? 0)}
          hint="Full control"
          accent="#fbbf24"
        />
        <StatCell
          label="Admins · Devs"
          value={`${data?.counts.admins ?? 0} · ${data?.counts.developers ?? 0}`}
          hint="Day-to-day operators"
          accent={ACCENT}
        />
        <StatCell
          label="Viewers · Invited"
          value={`${data?.counts.viewers ?? 0} · ${data?.counts.invited ?? 0}`}
          hint="Read-only + pending"
        />
      </StatsStrip>

      <SectionHead
        eyebrow="Roster"
        title="Org"
        accent="members"
        rightMeta={data ? `your role: ${data.org.your_role.toUpperCase()}` : undefined}
      />

      {loading ? (
        <DataTable>
          <div className={`${MONO} px-5 py-12 text-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>
            Loading…
          </div>
        </DataTable>
      ) : data && data.data.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.6fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Member</ColHead>
            <ColHead>Role</ColHead>
            <ColHead>Joined</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {data.data.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.6fr)] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>
                    {m.full_name ?? m.email ?? 'Unknown user'}
                  </span>
                  {m.is_you && (
                    <span className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] text-white/40`}>
                      you
                    </span>
                  )}
                </div>
                <span className={`${MONO} block text-[10.5px] text-white/40 mt-0.5 truncate`}>
                  {m.email ?? m.user_id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{
                    background: roleColor(m.role),
                    boxShadow:
                      m.role === 'viewer' ? 'none' : `0 0 5px ${roleColor(m.role)}`,
                  }}
                />
                {isAdminish && !m.is_you && m.role !== 'owner' ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) => changeRole(m, v as Role)}
                    disabled={updating === m.id}
                  >
                    <SelectTrigger
                      className={`${MONO} h-7 w-40 px-2 text-[10.5px] uppercase tracking-[0.12em] font-semibold bg-transparent border-white/[0.08] hover:bg-white/[0.04]`}
                      style={{ color: roleColor(m.role) }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.filter((r) =>
                        // Admins can't grant owner; only owners can
                        data.org.your_role === 'owner' ? true : r.value !== 'owner'
                      ).map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span
                    className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                    style={{ color: roleColor(m.role) }}
                  >
                    {m.role}
                  </span>
                )}
              </div>
              <span className={`${MONO} text-[11px] text-white/55`}>
                {m.joined_at
                  ? new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : m.invited_at
                    ? `invited ${new Date(m.invited_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : '—'}
              </span>
              <div className="flex justify-end gap-1.5">
                {isAdminish && m.role !== 'owner' && !m.is_you && (
                  <RowActionButton onClick={() => setRemoveMember(m)} variant="danger">
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </RowActionButton>
                )}
              </div>
            </div>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No members"
          description="Org auto-bootstraps with you as the owner. Invite teammates from here once the email flow ships."
        />
      )}

      {/* Role reference */}
      <section className="mt-14 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {ROLE_OPTIONS.map((r) => (
          <div key={r.value} className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: roleColor(r.value), boxShadow: r.value === 'viewer' ? 'none' : `0 0 5px ${roleColor(r.value)}` }}
              />
              <span
                className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] font-semibold`}
                style={{ color: roleColor(r.value) }}
              >
                {r.value}
              </span>
            </div>
            <p className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              {r.label.split(' — ')[1]}
            </p>
          </div>
        ))}
      </section>

      <AlertDialog open={!!removeMember} onOpenChange={() => setRemoveMember(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Remove member
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Removing {removeMember?.full_name ?? removeMember?.email} immediately revokes their
              access to this org. Their personal data and API keys (if any) are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={removing}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={removing}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {removing ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageCanvas>
  );
}
