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
import {
  requireTier,
  resourcesFor,
  TIERS,
  MIN_INSTANCES,
  MAX_INSTANCES,
} from "@/lib/paas/tiers";
import { isPlaceholderSha } from "@/app/api/v2/_lib/deployments";
import { replicaStates, type ReplicaState } from "@/lib/paas/replicas";
import { ReplicaBadge } from "@/components/v2/state-badge";
import { Panel, StateBadge, Empty, Failed, timeAgo } from "../ui";
import { DeployButton, EnvEditor } from "./actions";
// Ported from the parallel dashboard this page replaced. These are the four
// controls that lane had and this one did not; the routes here won because
// they are the ones verified end to end against real data.
import { SizingPicker } from "@/components/v2/sizing-picker";
import { SleepSettings } from "@/components/v2/sleep-settings";
import { PromoteControl } from "@/components/v2/promote-control";
import { DomainManager } from "@/components/v2/domain-manager";

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
    // ONE STRING LITERAL, not a concatenation. supabase-js parses this select
    // at the TYPE level to infer the row shape, and it can only do that for a
    // literal — splitting it across a `+` collapsed `project` to
    // GenericStringError and produced fifteen "property does not exist"
    // errors that all looked like the columns were wrong.
    // scale_to_zero and idle_seconds were added here for the sleep control.
    .select("id,ref,name,slug,repo_full_name,production_branch,tier,instance_count,scale_to_zero,idle_seconds,root_directory,deleted_at")
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

  const [deployments, aliases, envVars, environments, domains] = await Promise.all([
    db
      .from("deployments")
      // image_digest and scaled_to_zero_at feed replicaStates below. Without
      // scaled_to_zero_at a sleeping production app is indistinguishable from
      // a superseded build — both zero replicas, opposite meanings.
      .select("ref,state,trigger,git_sha,git_ref,queued_at,ready_at,error_message,image_digest,scaled_to_zero_at")
      .eq("project_id", project.id)
      .order("queued_at", { ascending: false })
      .limit(20),
    db.from("aliases").select("ref,hostname,kind,deployment_id").eq("project_id", project.id),
    db.from("env_vars").select("key,is_public,updated_at").eq("project_id", project.id).order("key"),
    db.from("environments").select("id,kind,name").eq("project_id", project.id),
    db
      .from("domains")
      .select("ref,hostname,status,verified_at,cf_hostname_id,created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
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

  // Only READY deployments may be promoted. Offering a queued or errored one
  // would let someone point production at a build that has no image, and the
  // failure would surface as a dead hostname rather than as a refused action.
  const promotable = (deployments.data ?? [])
    .filter((d) => d.state === "ready")
    .map((d) => ({
      ref: d.ref,
      // git_sha is NULLABLE — a redeploy has none until the build resolves it.
      // isPlaceholderSha handles null, all-zeroes and non-hex alike, and the
      // ref is the fallback because it is the thing that is always present.
      shortSha: isPlaceholderSha(d.git_sha) ? d.ref : d.git_sha!.slice(0, 7),
      message: null,
      readyAt: d.ready_at,
    }));

  /**
   * Whether the platform can actually issue a certificate for a custom
   * hostname. Reads the FEATURE FLAG, deliberately not V2_CF_API_TOKEN: this
   * is a page, and a page reaching for a deploy-path credential is precisely
   * the elevation boundary.test.ts exists to catch. The manager renders the
   * list either way and refuses to promise issuance it cannot perform.
   */
  const customHostnamesEnabled = process.env.V2_ACM_ENABLED === "true";

  const production = (aliases.data ?? []).find((a) => a.kind === "production");
  const previewAliases = (aliases.data ?? []).filter((a) => a.kind === "branch");
  const previewEnvs = (environments.data ?? []).filter((e) => e.kind === "preview");
  const latest = deployments.data?.[0] ?? null;

  /**
   * Runtime replica status, and the reason it is worth the extra call.
   *
   * A state string alone cannot tell a SLEEPING app from a SUPERSEDED one.
   * Both sit at zero replicas and they mean opposite things: one is the
   * customer's live site waiting to be woken, the other is an old build kept
   * for rollback. Showing "stopped" over a working production app is the
   * specific lie this avoids, and it is why scaled_to_zero_at is passed rather
   * than left to default — omitting it degrades silently into exactly that
   * confusion. boundary.test.ts fails on any call that omits it.
   *
   * That guard is also what caught this being lost. Deleting the old dashboard
   * removed the only replicaStates caller, and the check refused to report
   * clean while examining zero call sites rather than passing vacuously.
   *
   * replicaStates reads the CLUSTER, which genuinely needs elevation because
   * there is no tenant credential for Kubernetes. It reads no database: it is
   * handed rows RLS already allowed, so it cannot see another team's
   * deployments because it is never told about them.
   *
   * A cluster failure must not blank the page — every row falls back to
   * "unknown" with a null count, which renders as "Can't tell", never as zero.
   */
  let replicas = new Map<string, ReplicaState>();
  try {
    const states = await replicaStates(
      project.ref,
      (deployments.data ?? []).map((d) => ({
        ref: d.ref,
        state: d.state,
        image_digest: d.image_digest,
        scaled_to_zero_at: d.scaled_to_zero_at,
      })),
      {
        // Which build production currently points at, so a superseded one is
        // not mistaken for the live app that happens to be asleep.
        servingRef: (deployments.data ?? []).find(
          (d) => d.ref === latest?.ref && production?.deployment_id
        )?.ref,
      }
    );
    replicas = new Map(states.map((r) => [r.ref, r]));
  } catch (err) {
    console.error("[dashboard/v2] replica read failed:", err);
  }

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
            <div className="flex items-center gap-2">
              <StateBadge state={latest?.state ?? null} />
              {/*
                The replica badge, not a second state string. This is what
                says "Sleeping — wakes on next request" instead of showing a
                live customer site as stopped.
              */}
              {latest && replicas.get(latest.ref) ? (
                <ReplicaBadge
                  status={replicas.get(latest.ref)!.status}
                  replicas={replicas.get(latest.ref)!.replicas}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <Empty title="No hostname yet">
            A hostname is created by the first successful deploy. Nothing is broken.
          </Empty>
        )}

        {/*
          Rollback. One alias update repoints production at another READY
          build, which is the whole mechanism — superseded deployments are kept
          and scaled to zero precisely so this is possible.

          Only shown when there is something to choose: an alias to move, and
          at least one ready build that is not already serving.
        */}
        {production && promotable.length > 0 && (
          <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/10">
            <PromoteControl
              projectRef={project.ref}
              aliasRef={production.ref}
              hostname={production.hostname}
              currentDeploymentRef={
                promotable.find((p) => p.ref === latest?.ref)?.ref ?? null
              }
              candidates={promotable}
              routingLive
            />
          </div>
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
                    {/*
                      Now a link. This list previously went nowhere, so a
                      failed build showed a truncated error here and the full
                      logs were unreachable from the UI — which is exactly the
                      moment a customer needs them.

                      isPlaceholderSha rather than a bare null check: a
                      redeploy writes no sha, and the deploy path also writes
                      "0000000", so `d.git_sha ? …` rendered a row of
                      indistinguishable zeroes. Falls back to the ref, which
                      is always present and is what the link uses anyway.
                    */}
                    <Link
                      href={`/dashboard/v2/projects/${project.ref}/deployments/${d.ref}`}
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <code className="text-xs">
                        {isPlaceholderSha(d.git_sha) ? d.ref : d.git_sha!.slice(0, 7)}
                      </code>
                    </Link>
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

      <Panel title="Size" subtitle="What each instance gets, and how many run">
        {/*
          Replaces the read-only cpu/memory line this page used to show. Same
          source — lib/paas/tiers — so what the page says and what the pod gets
          still cannot disagree; the difference is that it can now be changed.

          TIERS is mapped field by field ON THE SERVER rather than spread,
          because Tier carries costUsd alongside priceUsd and spreading it
          would serialise our margin into the page. cost-leak.test.ts fails if
          a cost-bearing name ever reaches a client file.
        */}
        {sizing === null ? (
          <Failed
            what="this project's size"
            detail={`Its stored tier "${project.tier}" is not one this platform offers.`}
          />
        ) : (
          <SizingPicker
            projectRef={project.ref}
            tiers={TIERS.map((t) => ({
              id: t.id,
              label: t.label,
              cls: t.cls,
              memoryMib: t.memoryMib,
              vcpu: t.vcpu,
              transferGb: t.transferGb,
              priceUsd: t.priceUsd,
              priceInr: t.priceInr,
            }))}
            currentTier={project.tier}
            currentInstances={project.instance_count}
            minInstances={MIN_INSTANCES}
            maxInstances={MAX_INSTANCES}
            deployRequired
          />
        )}
      </Panel>

      <Panel title="Sleep" subtitle="Scale to zero when nothing is asking">
        {/*
          sweepScheduled={false}: the idle sweep is a script someone runs, not
          a schedule. The panel records the setting and says plainly that
          nothing acts on it yet, rather than describing behaviour the platform
          does not have — which is the v1 dashboard's habit this rebuild exists
          to break.
        */}
        <SleepSettings
          projectRef={project.ref}
          enabled={project.scale_to_zero}
          idleSeconds={project.idle_seconds}
          sweepScheduled={false}
        />
      </Panel>

      <Panel title="Custom domains" subtitle="Your own hostname in front of this project">
        {domains.error ? (
          <Failed what="custom domains" />
        ) : (
          <DomainManager
            projectRef={project.ref}
            domains={(domains.data ?? []).map((d) => ({
              ref: d.ref,
              domain: d.hostname,
              state: d.status,
              // The DNS record to add is issued by Cloudflare when the custom
              // hostname is created; until then there is nothing to show and a
              // fabricated record would send the customer to edit DNS for a
              // value that will not match.
              verification: null,
              lastError: null,
            }))}
            customHostnamesEnabled={customHostnamesEnabled}
          />
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
