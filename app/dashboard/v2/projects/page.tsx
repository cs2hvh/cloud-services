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
import { createClient } from "@/lib/supabase/server";
import { Panel, StateBadge, Empty, Failed, timeAgo } from "./ui";

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
    db.from("projects").select("id,ref,name,slug,repo_full_name,tier,instance_count,production_branch").order("created_at"),
    db.from("aliases").select("project_id,hostname,kind"),
    db.from("deployments").select("project_id,state,ready_at,queued_at").order("queued_at", { ascending: false }),
    db.from("installations").select("installation_id,account_login,deleted_at"),
  ]);

  const readFailed = bootstrapError || projects.error || aliases.error || deployments.error;

  const newest = new Map<string, { state: string; at: string | null }>();
  for (const d of deployments.data ?? []) {
    if (!newest.has(d.project_id)) newest.set(d.project_id, { state: d.state, at: d.ready_at ?? d.queued_at });
  }
  const host = new Map<string, string>();
  for (const a of aliases.data ?? []) {
    if (a.kind === "branch") continue;
    if (a.kind === "production" || !host.has(a.project_id)) host.set(a.project_id, a.hostname);
  }

  const connected = (installations.data ?? []).filter((i) => !i.deleted_at);
  const rows = projects.data ?? [];

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Apps deployed from your repositories. Billed from credits by the hour.
          </p>
        </div>
        <Link
          href="/dashboard/v2/projects/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          New project
        </Link>
      </header>

      {readFailed ? (
        <Failed
          what="your projects"
          detail="Your apps are still running — this page could not read them. Try again in a moment."
        />
      ) : null}

      {!readFailed && !connected.length ? (
        <Panel title="Connect GitHub" subtitle="Needed before a repository can be deployed">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            No GitHub account is connected yet. Install the app to choose which repositories are visible.
          </p>
        </Panel>
      ) : null}

      {!readFailed && rows.length === 0 ? (
        <Empty title="No projects yet">
          Create one from a repository and it will build, get a hostname, and start serving.
        </Empty>
      ) : null}

      {rows.length > 0 ? (
        <Panel title={`${rows.length} project${rows.length === 1 ? "" : "s"}`}>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((p) => {
              const state = newest.get(p.id);
              const hostname = host.get(p.id);
              return (
                <li key={p.ref} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/v2/projects/${p.ref}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {p.slug}
                    </Link>
                    <p className="truncate text-xs text-neutral-500">
                      {p.repo_full_name} · {p.production_branch} · {p.tier} ×{p.instance_count}
                    </p>
                    {hostname ? (
                      <a
                        href={`https://${hostname}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {hostname}
                      </a>
                    ) : (
                      // Distinct from a broken hostname: nothing has deployed,
                      // so there is nothing to route yet.
                      <span className="text-xs text-neutral-400">No hostname until the first deploy</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-neutral-500">{timeAgo(state?.at ?? null)}</span>
                    <StateBadge state={state?.state ?? null} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </main>
  );
}
