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
import { Boxes, GitBranch, Plug, Plus, Server } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  Empty,
  ExternalLink,
  Failed,
  PageHeader,
  Stat,
  StateBadge,
  buttonClass,
  timeAgo,
} from "@/components/v2/kit";

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
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Projects"
        description="Apps deployed from your repositories, billed from credits by the hour."
        actions={
          <Link href="/dashboard/v2/projects/new" className={buttonClass("primary")}>
            <Plus className="h-4 w-4" aria-hidden />
            New project
          </Link>
        }
      />

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
          <Link href="/dashboard/v2/projects/new" className={buttonClass("secondary", "sm", "mt-3")}>
            Connect an account
          </Link>
        </Card>
      ) : null}

      {!readFailed && rows.length === 0 ? (
        <Empty
          icon={Boxes}
          title="No projects yet"
          action={
            <Link href="/dashboard/v2/projects/new" className={buttonClass("primary", "sm")}>
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
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((p) => {
            const state = newest.get(p.id);
            const hostname = host.get(p.id);
            return (
              <Link
                key={p.ref}
                href={`/dashboard/v2/projects/${p.ref}`}
                className="group flex flex-col gap-3 rounded-lg border border-white/[0.07] bg-[#15171c] p-4 transition-colors hover:border-white/[0.14] hover:bg-white/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white/90">{p.slug}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[11px] text-white/40">
                      <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
                      {p.repo_full_name}
                      <span className="text-white/25">·</span>
                      {p.production_branch}
                    </p>
                  </div>
                  <StateBadge state={state?.state ?? null} className="shrink-0" />
                </div>

                {/*
                  The hostname is the thing people actually came for, so it gets
                  its own line. Its absence is stated rather than left blank —
                  nothing has deployed yet, which is not the same as broken.
                */}
                <div className="min-w-0">
                  {hostname ? (
                    <span onClick={(e) => e.stopPropagation()}>
                      <ExternalLink href={`https://${hostname}`}>{hostname}</ExternalLink>
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-white/30">
                      No hostname until the first deploy
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] pt-3 text-[11px] text-white/35">
                  <span className="inline-flex items-center gap-1.5">
                    <Server className="h-3 w-3" aria-hidden />
                    {p.tier} ×{p.instance_count}
                  </span>
                  <span>{state ? timeAgo(state.at) : "never deployed"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
