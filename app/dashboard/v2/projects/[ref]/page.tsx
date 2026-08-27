/**
 * One project: what it is serving, its build history, and its configuration.
 *
 * Reads directly through the RLS-scoped client. A project belonging to another
 * team is invisible rather than forbidden, so this 404s for both cases — a 403
 * would confirm the ref exists and let anyone enumerate other teams' projects by
 * probing.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTier, resourcesFor } from "@/lib/paas/tiers";
import { Panel, StateBadge, Empty, Failed, timeAgo } from "../ui";
import { DeployButton, EnvEditor } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROJECT_REF = /^prj-[0-9a-f]{12}$/;

export default async function ProjectPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?redirectTo=${encodeURIComponent(`/dashboard/v2/projects/${ref}`)}`);
  if (!PROJECT_REF.test(ref)) notFound();

  const db = supabase.schema("paas");

  const { data: project, error: projectError } = await db
    .from("projects")
    .select("id,ref,name,slug,repo_full_name,production_branch,tier,instance_count,root_directory,deleted_at")
    .eq("ref", ref)
    .maybeSingle();

  if (projectError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Failed what="this project" />
      </main>
    );
  }
  if (!project || project.deleted_at) notFound();

  const [deployments, aliases, envVars, environments] = await Promise.all([
    db
      .from("deployments")
      .select("ref,state,trigger,git_sha,git_ref,queued_at,ready_at,error_message")
      .eq("project_id", project.id)
      .order("queued_at", { ascending: false })
      .limit(20),
    db.from("aliases").select("ref,hostname,kind,deployment_id").eq("project_id", project.id),
    db.from("env_vars").select("key,is_public,updated_at").eq("project_id", project.id).order("key"),
    db.from("environments").select("id,kind,name").eq("project_id", project.id),
  ]);

  // Sizing is derived from the same table that prices it, so what the page says
  // and what the pod gets cannot disagree.
  let sizing: { cpu: string; memory: string; label: string } | null = null;
  try {
    const t = requireTier(project.tier);
    const r = resourcesFor(t);
    sizing = { cpu: r.requests.cpu, memory: r.requests.memory, label: t.label };
  } catch {
    // An unknown tier is a real problem worth showing rather than defaulting to
    // the cheapest and quietly describing the wrong machine.
    sizing = null;
  }

  const production = (aliases.data ?? []).find((a) => a.kind === "production");
  const previewAliases = (aliases.data ?? []).filter((a) => a.kind === "branch");
  const previewEnvs = (environments.data ?? []).filter((e) => e.kind === "preview");
  const latest = deployments.data?.[0] ?? null;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header>
        <Link href="/dashboard/v2/projects" className="text-xs text-neutral-500 hover:underline">
          ← Projects
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{project.slug}</h1>
            <p className="mt-0.5 text-xs text-neutral-500">
              {project.repo_full_name} · {project.production_branch}
              {project.root_directory ? ` · /${project.root_directory}` : ""}
            </p>
          </div>
          <DeployButton projectRef={project.ref} branch={project.production_branch} />
        </div>
      </header>

      <Panel title="Serving" subtitle="The hostname this project answers on">
        {production ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a
              href={`https://${production.hostname}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              {production.hostname}
            </a>
            <StateBadge state={latest?.state ?? null} />
          </div>
        ) : (
          <Empty title="No hostname yet">
            A hostname is created by the first successful deploy. Nothing is broken.
          </Empty>
        )}
        {sizing ? (
          <p className="mt-3 text-xs text-neutral-500">
            {sizing.label} · {sizing.memory} memory · {sizing.cpu} CPU · ×{project.instance_count}
          </p>
        ) : (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">
            Plan &quot;{project.tier}&quot; is not in the price list — this project cannot be sized. Contact support.
          </p>
        )}
      </Panel>

      <Panel
        title="Deployments"
        subtitle={
          deployments.error ? undefined : `${deployments.data?.length ?? 0} most recent`
        }
      >
        {deployments.error ? (
          <Failed what="deployments" />
        ) : (deployments.data ?? []).length === 0 ? (
          <Empty title="Nothing deployed yet">Use Deploy above, or push to {project.production_branch}.</Empty>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {(deployments.data ?? []).map((d) => (
              <li key={d.ref} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{d.git_sha ? String(d.git_sha).slice(0, 7) : "—"}</code>
                    <span className="text-xs text-neutral-500">{d.git_ref}</span>
                    <span className="text-xs text-neutral-400">{d.trigger}</span>
                  </div>
                  {d.error_message ? (
                    <p className="mt-0.5 truncate text-xs text-red-600 dark:text-red-400">{d.error_message}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-neutral-500">{timeAgo(d.ready_at ?? d.queued_at)}</span>
                  <StateBadge state={d.state} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Previews"
        subtitle="Free, Starter-sized, and removed 48 hours after their last push"
      >
        {previewEnvs.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Push any branch other than {project.production_branch} and a preview appears here.
          </p>
        ) : (
          <ul className="space-y-1">
            {previewEnvs.map((e) => {
              const alias = previewAliases.find((a) => a.hostname.includes(e.name.replace(/[^a-z0-9-]/gi, "-")));
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{e.name}</span>
                  {alias ? (
                    <a
                      href={`https://${alias.hostname}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {alias.hostname}
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-neutral-400">building</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Environment variables" subtitle="Encrypted at rest, injected at runtime">
        {envVars.error ? (
          <Failed what="environment variables" />
        ) : (
          <EnvEditor
            projectRef={project.ref}
            initial={(envVars.data ?? []).map((v) => ({
              key: v.key,
              isPublic: v.is_public,
              updatedAt: v.updated_at,
            }))}
          />
        )}
      </Panel>
    </main>
  );
}
