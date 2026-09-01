import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import {
  auditCustomerRead,
  requireCustomerDataAccess,
} from "@admin/lib/customer-data";
import { PageHeader } from "@admin/components/page-header";
import {
  Panel,
  StatusChip,
  Table,
  Callout,
  money,
  seconds,
} from "@admin/components/deploy/bits";

export const dynamic = "force-dynamic";

/**
 * One project, deleted or not: deployment history with customer-facing error
 * messages, env var KEYS (never values — they are ciphertext and stay that
 * way), and billed charges. No repository contents beyond repo name and SHA
 * — commit messages, diffs and source stay out by condition. Every view of
 * this page writes an audit row naming the admin and the project.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const admin = await requireCustomerDataAccess();
  if (!admin.ok) {
    notFound();
  }

  const { ref } = await params;
  const supabase = await createServiceClient();
  const paas = supabase.schema("paas");

  const { data: projects, error } = await paas
    .from("projects")
    .select("*")
    .eq("ref", ref)
    .limit(1);
  if (error || !projects?.[0]) {
    notFound();
  }
  const project = projects[0];

  const [teamRes, deploysRes, envRes, chargesRes] = await Promise.all([
    paas.from("teams").select("slug, name, created_by").eq("id", project.team_id).limit(1),
    paas
      .from("deployments")
      .select(
        "ref, state, trigger, git_ref, git_sha, error_code, error_message, queued_at, started_at, ready_at, scaled_to_zero_at",
      )
      .eq("project_id", project.id)
      .order("queued_at", { ascending: false })
      .limit(50),
    // KEYS ONLY. value_ct / dek_id are never selected on any admin surface.
    paas
      .from("env_vars")
      .select("key, is_public, created_at")
      .eq("project_id", project.id)
      .order("key"),
    paas
      .from("project_charges")
      .select("period_start, amount_usd, tier, instances")
      .eq("project_id", project.id)
      .order("period_start", { ascending: false })
      .limit(48),
  ]);

  const team = teamRes.data?.[0];
  const deployments = deploysRes.data ?? [];
  const envKeys = envRes.data ?? [];
  const charges = chargesRes.data ?? [];
  const chargedTotal = charges.reduce((s, c) => s + Number(c.amount_usd), 0);

  await auditCustomerRead({
    admin,
    serviceType: "platform_apps",
    subjectId: project.ref,
    subjectName: project.name,
    viewed: "project detail: deployments, env keys, charges",
    metadata: { deleted: Boolean(project.deleted_at), team: team?.slug },
  });

  return (
    <div>
      <PageHeader
        title={project.name}
        description={`${project.ref} · team ${team?.slug ?? "?"} · ${project.repo_full_name ?? "no repo"}`}
        actions={
          <Link href="/deploy/projects" className="text-xs text-muted-foreground underline">
            ← all projects
          </Link>
        }
      />

      {project.deleted_at && (
        <Callout tone="warning">
          Deleted {new Date(project.deleted_at).toUTCString()}. The customer
          can no longer reach this project; rows persist so past charges stay
          auditable. How long deleted projects are retained is an open product
          decision — nothing here assumes forever.
        </Callout>
      )}

      <div className="space-y-6">
        <Panel title="Project" subtitle="Configuration as recorded — no repository contents">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs sm:grid-cols-3">
            {(
              [
                ["framework", project.framework],
                ["tier", project.tier],
                ["instances", project.instance_count],
                ["branch", project.production_branch],
                ["root dir", project.root_directory || "/"],
                ["scale to zero", project.scale_to_zero ? `yes (${project.idle_seconds}s idle)` : "no"],
                ["provider", project.provider],
                ["created", project.created_at?.slice(0, 16).replace("T", " ")],
                ["arrears since", project.arrears_since?.slice(0, 16).replace("T", " ") ?? "—"],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <span className="text-muted-foreground">{k}: </span>
                <span className="font-mono">{String(v ?? "—")}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title={`Deployments (${deployments.length})`}
          subtitle="Customer-facing error text only — build logs are customer content and have no admin reader, by decision"
        >
          <Table head={["ref", "state", "trigger", "branch", "sha", "queued", "build time", "error"]}>
            {deployments.map((d) => {
              const buildSecs =
                d.started_at && d.ready_at
                  ? Math.round((Date.parse(d.ready_at) - Date.parse(d.started_at)) / 1000)
                  : null;
              return (
                <tr key={d.ref} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{d.ref}</td>
                  <td className="py-1.5 pr-4"><StatusChip status={d.state} /></td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{d.trigger}</td>
                  <td className="py-1.5 pr-4">{d.git_ref}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{d.git_sha?.slice(0, 7) ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">
                    {d.queued_at?.slice(5, 16).replace("T", " ")}
                  </td>
                  <td className="py-1.5 pr-4">{buildSecs !== null ? seconds(buildSecs) : "—"}</td>
                  <td className="max-w-[320px] truncate py-1.5 text-red-300">
                    {d.error_message ?? d.error_code ?? ""}
                  </td>
                </tr>
              );
            })}
          </Table>
          {deployments.length === 0 && (
            <p className="text-xs text-muted-foreground">No deployments recorded.</p>
          )}
        </Panel>

        <Panel
          title={`Environment variables (${envKeys.length})`}
          subtitle="Keys only — values are encrypted customer secrets and are never shown on any admin surface"
        >
          {envKeys.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {envKeys.map((e) => (
                <span
                  key={e.key}
                  className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {e.key}
                  {e.is_public && <span className="text-muted-foreground"> · public</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">None.</p>
          )}
        </Panel>

        <Panel
          title={`Charges (${charges.length}${charges.length === 48 ? "+" : ""})`}
          subtitle={`paas.project_charges — one row per billed hour · shown total ${money(chargedTotal, 4)}`}
        >
          {charges.length > 0 ? (
            <Table head={["period", "tier", "instances", "amount"]}>
              {charges.map((c) => (
                <tr key={c.period_start} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">{c.period_start.slice(0, 13).replace("T", " ")}:00</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{c.tier}</td>
                  <td className="py-1.5 pr-4">{c.instances}</td>
                  <td className="py-1.5">{money(Number(c.amount_usd), 4)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">
              No billed hours — metering began 2026-08-28 and unpriced or
              never-running hours are never charged.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
