import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import {
  auditCustomerRead,
  requireCustomerDataAccess,
} from "@admin/lib/customer-data";
import { PageHeader } from "@admin/components/page-header";
import { StatusChip, Table, Callout } from "@admin/components/deploy/bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface ProjectRow {
  id: string;
  ref: string;
  name: string;
  slug: string;
  repo_full_name: string | null;
  framework: string | null;
  tier: string | null;
  team_id: string;
  created_at: string;
  deleted_at: string | null;
  arrears_since: string | null;
}

/**
 * Every paas project, soft-deleted included — the customer side 404s deleted
 * projects by design, so this surface is the only product path to them and
 * exists so "past charges stay auditable" is true without SQL access.
 * Deliberately designed per-tenant with the v2 lane; every page view is
 * audited (see lib/customer-data.ts). Rows persist indefinitely today —
 * retention for deleted projects is an open product decision.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await requireCustomerDataAccess();
  if (!admin.ok) {
    notFound();
  }

  const { q } = await searchParams;
  const search = (q ?? "").trim().slice(0, 80);

  const supabase = await createServiceClient();
  const paas = supabase.schema("paas");

  let query = paas
    .from("projects")
    .select(
      "id, ref, name, slug, repo_full_name, framework, tier, team_id, created_at, deleted_at, arrears_since",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (search) {
    const like = `%${search.replace(/[%_]/g, "")}%`;
    query = query.or(
      `ref.ilike.${like},name.ilike.${like},slug.ilike.${like},repo_full_name.ilike.${like}`,
    );
  }

  const [{ data: projects, error }, { data: teams }] = await Promise.all([
    query,
    paas.from("teams").select("id, slug"),
  ]);

  if (error) {
    return (
      <div>
        <PageHeader title="V2 Projects" />
        <Callout tone="critical">Could not read projects: {error.message}</Callout>
      </div>
    );
  }

  const rows = (projects ?? []) as ProjectRow[];
  const teamSlug = new Map((teams ?? []).map((t) => [t.id, t.slug]));

  await auditCustomerRead({
    admin,
    serviceType: "platform_apps",
    subjectId: "paas:projects-list",
    subjectName: "project list",
    viewed: `project list (${rows.length} rows, deleted included)`,
    metadata: search ? { search } : undefined,
  });

  return (
    <div>
      <PageHeader
        title="V2 Projects"
        description="Every project, soft-deleted included — this view exists so past charges stay auditable without SQL. Page views are audited."
      />

      <form method="GET" className="mb-4 flex max-w-md gap-2">
        <Input
          name="q"
          defaultValue={search}
          placeholder="Search ref, name, slug, repo…"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <div className="rounded-xl border border-border bg-card p-4">
        <Table head={["project", "ref", "team", "repo", "framework", "tier", "created", "status"]}>
          {rows.map((p) => (
            <tr key={p.id} className={`border-t border-border/60 ${p.deleted_at ? "opacity-60" : ""}`}>
              <td className="py-1.5 pr-4">
                <Link href={`/deploy/projects/${encodeURIComponent(p.ref)}`} className="underline-offset-2 hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">{p.ref}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{teamSlug.get(p.team_id) ?? "—"}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{p.repo_full_name ?? "—"}</td>
              <td className="py-1.5 pr-4">{p.framework ?? "—"}</td>
              <td className="py-1.5 pr-4">{p.tier ?? "—"}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{p.created_at.slice(0, 10)}</td>
              <td className="py-1.5">
                {p.deleted_at ? (
                  <StatusChip status="deleted" />
                ) : p.arrears_since ? (
                  <StatusChip status="arrears" />
                ) : (
                  <StatusChip status="live" />
                )}
              </td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">No projects match.</p>
        )}
        {rows.length === 100 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the first 100 — narrow the search to see the rest.
          </p>
        )}
      </div>
    </div>
  );
}
