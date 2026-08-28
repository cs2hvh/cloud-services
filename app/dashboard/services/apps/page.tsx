/**
 * The project list — the dashboard's front door.
 *
 * A server component reading through the RLS-scoped client directly rather than
 * fetching its own API. The API exists for scripts and for the client-side
 * pieces; making a server render take an HTTP round trip to its own process adds
 * a failure mode and an auth hop for nothing. Same reasoning as the operator
 * page.
 *
 * A FAILED READ IS NOT AN EMPTY LIST. If the query errors the page says so.
 * Rendering "no projects yet" when the read failed tells a customer their apps
 * are gone, and the first thing they will do is create them again.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, GitBranch, Plug, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  Empty,
  ExternalLink,
  ColHead,
  Failed,
  Hero,
  ListTable,
  PROJECT_COLUMNS,
  ServiceShell,
  Stat,
  StateBadge,
  buttonClass,
  heroButtonClass,
  timeAgo,
} from "@/components/v2/kit";
import { AutoRefresh } from "@/components/v2/auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?redirectTo=%2Fdashboard%2Fv2%2Fprojects");

  const db = supabase.schema("paas");

  // Idempotent. A brand-new account has no team until this runs, and without it
  // every query below correctly returns nothing — which would look like a
  // working dashboard with no apps rather than an account that cannot hold any.
  const { error: bootstrapError } = await db.rpc("bootstrap_personal_team").single();

  const [projects, aliases, deployments, installations] = await Promise.all([
    db
      .from("projects")
      .select("id,ref,name,slug,repo_full_name,tier,instance_count,production_branch")
      .order("created_at"),
    db.from("aliases").select("project_id,hostname,kind,released_at"),
    db.from("deployments").select("project_id,state,ready_at,queued_at").order("queued_at", { ascending: false }),
    db.from("installations").select("provider,external_id,account_login,deleted_at"),
  ]);

  const readFailed = bootstrapError || projects.error || aliases.error || deployments.error;

  const newest = new Map<string, { state: string; at: string | null }>();
  for (const d of deployments.data ?? []) {
    if (!newest.has(d.project_id)) newest.set(d.project_id, { state: d.state, at: d.ready_at ?? d.queued_at });
  }
  const host = new Map<string, string>();
  for (const a of aliases.data ?? []) {
    // A released alias is a hostname a torn-down project used to hold. Showing
    // it would offer a link that resolves to nothing.
    if (a.kind === "branch" || a.released_at) continue;
    if (a.kind === "production" || !host.has(a.project_id)) host.set(a.project_id, a.hostname);
  }

  const connected = (installations.data ?? []).filter((i) => !i.deleted_at);
  const rows = projects.data ?? [];

  const live = rows.filter((p) => newest.get(p.id)?.state === "ready").length;
  const building = rows.filter((p) => {
    const s = newest.get(p.id)?.state;
    return s === "queued" || s === "building" || s === "publishing";
  }).length;
  const failing = rows.filter((p) => newest.get(p.id)?.state === "error").length;

  return (
    <ServiceShell>
      {/*
        The same statement the services pages open with, and the same shell
        underneath it. v2 was a centred column on the flat dashboard
        background, so the space either side read as dead margin rather than
        as a measured column — the services pages are barely wider, but their
        background is full bleed and the content sits on top of it.
      */}
      <Hero
        lead="Deploy and operate"
        accent="application workloads"
        description="Repository-backed deployments with live build status, previews on every branch, and one-click rollback."
        action={
          <Link href="/dashboard/services/apps/new" className={heroButtonClass}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Deploy application
          </Link>
        }
      />

      {/*
        The list is where somebody watches a fleet come up. `building` is
        already computed for the summary row, so following it costs nothing.
      */}
      <div className="-mt-3 mb-4">
        <AutoRefresh active={building > 0} label={`${building} deploying — this list is updating itself.`} />
      </div>

      {readFailed ? (
        <Failed
          what="your projects"
          detail="Your apps are still running — this page could not read them. Try again in a moment."
        />
      ) : null}

      {/*
        Only worth a row of figures once there is something to summarise. On an
        empty account this would be three zeroes above an empty state, which
        says nothing and takes the space the next action should have.
      */}
      {!readFailed && rows.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-6 rounded-lg border border-white/[0.07] bg-[#15171c] px-5 py-4">
          <Stat label="Projects" value={rows.length} />
          <Stat label="Live" value={live} tone={live > 0 ? "good" : "default"} />
          {building > 0 ? <Stat label="Building" value={building} /> : null}
          <Stat
            label="Failing"
            value={failing}
            tone={failing > 0 ? "bad" : "default"}
            hint={failing > 0 ? "last deploy errored" : undefined}
          />
        </div>
      ) : null}

      {!readFailed && !connected.length ? (
        <Card
          title="Connect a git provider"
          subtitle="Needed before a repository can be deployed"
          icon={Plug}
          className="mb-4"
        >
          <p className="text-sm text-white/60">
            No account is connected yet. Signing in with GitHub is not the same thing — that is how you log
            in. This connects an account to your team so we can read its repositories.
          </p>
          <Link href="/dashboard/services/apps/new" className={buttonClass("secondary", "sm", "mt-3")}>
            Connect an account
          </Link>
        </Card>
      ) : null}

      {!readFailed && rows.length === 0 ? (
        <Empty
          icon={Boxes}
          title="No projects yet"
          action={
            <Link href="/dashboard/services/apps/new" className={buttonClass("primary", "sm")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Create your first project
            </Link>
          }
        >
          Pick a repository and it will build, get a hostname, and start serving. Every branch other than
          production gets a free preview that expires after 48 hours.
        </Empty>
      ) : null}

      {rows.length > 0 ? (
        // A TABLE, matching /dashboard/services/compute/vps. Cards were fine for
        // four projects and stop being fine at forty: a table is scannable down a
        // column, which is how somebody finds the one app that is failing.
        //
        // Grid rather than <table>, exactly as the compute list does, so the
        // header can be hidden on a phone and each row collapses to a stack. A
        // real table needs a horizontal scrollbar or a second markup path to do
        // the same thing.
        <ListTable
          head={
            <div className={`grid ${PROJECT_COLUMNS} gap-3`}>
              <ColHead>Project</ColHead>
              <ColHead>Hostname</ColHead>
              <ColHead>Status</ColHead>
              <ColHead>Size</ColHead>
              <ColHead align="right">Last deploy</ColHead>
            </div>
          }
        >
          {rows.map((p) => {
            const state = newest.get(p.id);
            const hostname = host.get(p.id);
            return (
              <div
                key={p.ref}
                className={`group relative grid ${PROJECT_COLUMNS} items-center gap-3 border-b border-white/[0.04] px-5 py-3 transition-colors last:border-b-0 hover:bg-white/[0.015]`}
              >
                {/* Project — the stretched link, so the whole row opens it. */}
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/services/apps/${p.ref}`}
                    className="block truncate text-[13px] font-medium text-white/90 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    {p.slug}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10.5px] text-white/35">
                    <GitBranch className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    {p.repo_full_name}
                    <span className="text-white/20">·</span>
                    {p.production_branch}
                  </p>
                </div>

                {/* Hostname — above the stretched link so it stays clickable. */}
                <div className="relative z-10 min-w-0">
                  {hostname ? (
                    <ExternalLink href={`https://${hostname}`}>{hostname}</ExternalLink>
                  ) : (
                    <span className="font-mono text-[10.5px] text-white/25">
                      awaiting first deploy
                    </span>
                  )}
                </div>

                <div>
                  <StateBadge state={state?.state ?? null} />
                </div>

                <div className="font-mono text-[11px] text-white/50">
                  {p.tier} ×{p.instance_count}
                </div>

                <div className="font-mono text-[11px] text-white/40 md:text-right">
                  {state ? timeAgo(state.at) : "never"}
                </div>
              </div>
            );
          })}
        </ListTable>
      ) : null}
    </ServiceShell>
  );
}
