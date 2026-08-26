/**
 * GET /api/v2/projects
 *
 * The caller's projects, with what each one is currently serving.
 *
 * THE FIRST TENANT-FACING v2 ROUTE. Until now every v2 endpoint was either
 * operator-only or the GitHub webhook, which means a customer could not list
 * their own apps by any means except a script run by us. Every UI surface needs
 * this one first.
 *
 * RLS-SCOPED, NEVER THE SERVICE ROLE. lib/paas/db.ts bypasses RLS entirely and
 * is for reconcilers; a route serving a logged-in customer must let the database
 * decide what they can see. boundary.test.ts fails if this file imports it.
 *
 * The filtering is therefore NOT in the query. There is no `.eq("team_id", …)`
 * below, and adding one would be a second, weaker copy of a rule the database
 * already enforces — the kind that drifts out of agreement with the policy and
 * is only noticed when it lets something through.
 */

import { createClient } from "@/lib/supabase/server";
import { json, unauthenticated, apiError } from "../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ProjectView {
  ref: string;
  name: string;
  slug: string;
  repo: string | null;
  productionBranch: string | null;
  tier: string;
  instances: number;
  hostname: string | null;
  /** null when nothing has ever deployed, which is different from a failed one. */
  state: string | null;
  lastDeployedAt: string | null;
  previews: number;
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  const db = supabase.schema("paas");

  // Three reads, joined in memory. A join per project would be N+1 against
  // PostgREST, and this list is the first thing a dashboard loads.
  const [projects, aliases, environments] = await Promise.all([
    db.from("projects").select("ref,name,slug,repo_full_name,production_branch,tier,instance_count,id").order("created_at"),
    db.from("aliases").select("project_id,hostname,kind,deployment_id"),
    db.from("environments").select("project_id,kind"),
  ]);

  // AN ERROR IS NOT AN EMPTY LIST. PostgREST returns `{ data: null, error }` on
  // failure, and rendering that as "you have no projects" is the exact defect
  // this codebase keeps finding: a read that could not run, reported as a read
  // that found nothing. A customer seeing an empty dashboard would reasonably
  // conclude their apps were gone.
  //
  // An empty list AFTER a successful read is genuinely "no projects" — RLS
  // returning zero rows for someone else's project is the same answer as the
  // project not existing, and that is deliberate (see _lib/http).
  for (const r of [projects, aliases, environments]) {
    if (r.error) {
      return apiError("internal", "Could not read your projects. Nothing has been changed.", 500);
    }
  }

  const latest = await db
    .from("deployments")
    .select("project_id,state,ready_at,queued_at")
    .order("queued_at", { ascending: false });
  if (latest.error) {
    return apiError("internal", "Could not read deployment state. Nothing has been changed.", 500);
  }

  const newestByProject = new Map<string, { state: string; at: string | null }>();
  for (const d of latest.data ?? []) {
    // Ordered newest-first above, so the first row seen per project wins.
    if (!newestByProject.has(d.project_id)) {
      newestByProject.set(d.project_id, { state: d.state, at: d.ready_at ?? d.queued_at ?? null });
    }
  }

  const previewCount = new Map<string, number>();
  for (const e of environments.data ?? []) {
    if (e.kind === "preview") previewCount.set(e.project_id, (previewCount.get(e.project_id) ?? 0) + 1);
  }

  const productionHost = new Map<string, string>();
  for (const a of aliases.data ?? []) {
    // A branch alias is a preview's hostname, never the app's own address.
    if (a.kind === "branch") continue;
    if (a.kind === "production" || !productionHost.has(a.project_id)) {
      productionHost.set(a.project_id, a.hostname);
    }
  }

  const view: ProjectView[] = (projects.data ?? []).map((p) => {
    const newest = newestByProject.get(p.id);
    return {
      ref: p.ref,
      name: p.name,
      slug: p.slug,
      repo: p.repo_full_name ?? null,
      productionBranch: p.production_branch ?? null,
      tier: p.tier ?? "starter",
      instances: p.instance_count ?? 1,
      hostname: productionHost.get(p.id) ?? null,
      state: newest?.state ?? null,
      lastDeployedAt: newest?.at ?? null,
      previews: previewCount.get(p.id) ?? 0,
    };
  });

  return json({ projects: view, count: view.length });
}
