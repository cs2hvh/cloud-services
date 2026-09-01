import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import {
  auditCustomerRead,
  requireCustomerDataAccess,
} from "@admin/lib/customer-data";
import { PageHeader } from "@admin/components/page-header";
import { Callout } from "@admin/components/deploy/bits";
import {
  ProjectsBrowser,
  type BrowserProject,
} from "@admin/components/deploy/projects-browser";

export const dynamic = "force-dynamic";

/**
 * Every paas project, soft-deleted included — the customer side 404s deleted
 * projects by design, so this surface is the only product path to them and
 * exists so "past charges stay auditable" is true without SQL access.
 * Deliberately designed per-tenant with the v2 lane; every page view is
 * audited (see lib/customer-data.ts). Rows persist indefinitely today —
 * retention for deleted projects is an open product decision.
 *
 * The full set (capped at 500 newest) is sent once and filtered client-side
 * for instant search — one audited read per page view either way.
 */
export default async function ProjectsPage() {
  const admin = await requireCustomerDataAccess();
  if (!admin.ok) {
    notFound();
  }

  const supabase = await createServiceClient();
  const paas = supabase.schema("paas");

  const [projectsRes, teamsRes, deploysRes] = await Promise.all([
    paas
      .from("projects")
      .select(
        "id, ref, name, slug, repo_full_name, framework, tier, team_id, created_at, deleted_at, arrears_since",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    paas.from("teams").select("id, slug"),
    paas.from("deployments").select("project_id"),
  ]);

  if (projectsRes.error) {
    return (
      <div>
        <PageHeader title="V2 Projects" />
        <Callout tone="critical">
          Could not read projects: {projectsRes.error.message}
        </Callout>
      </div>
    );
  }

  const projects = (projectsRes.data ?? []) as BrowserProject[];
  const teamSlugs: Record<string, string> = {};
  for (const t of teamsRes.data ?? []) teamSlugs[t.id] = t.slug;
  const deployCounts: Record<string, number> = {};
  for (const d of deploysRes.data ?? []) {
    deployCounts[d.project_id] = (deployCounts[d.project_id] ?? 0) + 1;
  }

  await auditCustomerRead({
    admin,
    serviceType: "platform_apps",
    subjectId: "paas:projects-list",
    subjectName: "project list",
    viewed: `project list (${projects.length} rows, deleted included)`,
  });

  return (
    <div>
      <PageHeader
        title="V2 Projects"
        description="Every project on the platform, soft-deleted included — kept reachable so past charges stay auditable. Page views are audited."
      />
      <ProjectsBrowser
        projects={projects}
        teamSlugs={teamSlugs}
        deployCounts={deployCounts}
      />
      {projects.length === 500 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the 500 newest projects — older rows exist but are not
          loaded here yet.
        </p>
      )}
    </div>
  );
}
