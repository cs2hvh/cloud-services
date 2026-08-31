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
import { Activity, Boxes, Receipt } from "lucide-react";
import { TabNav } from "@/components/v2/tab-nav";
import { AutoRefresh } from "@/components/v2/auto-refresh";
import { isSection } from "@/components/v2/sections";
import { createClient } from "@/lib/supabase/server";
import { summariseCharges } from "@/lib/paas/usage";
import { DOMAIN_COLUMNS, liveStateFor, toDomainDto, type DomainRow } from "@/lib/paas/domain-view";
import { summariseHealth, healthVerdict, humanDuration, type UsageSample } from "@/lib/paas/health";
import {
  BILLING_HOURS_PER_MONTH,
  clampInstances,
  hourlyRateUsd,
  requireTier,
  resourcesFor,
  TIERS,
  MIN_INSTANCES,
  MAX_INSTANCES,
} from "@/lib/paas/tiers";
import { isPlaceholderSha } from "@/app/api/v2/_lib/deployments";
import { replicaStates, type ReplicaState } from "@/lib/paas/replicas";
import { ReplicaBadge } from "@/components/v2/state-badge";
import {
  Card,
  Empty,
  Failed,
  PageHeader,
  ServiceShell,
  Facts,
  Stat,
  StateBadge,
  timeAgo,
} from "@/components/v2/kit";
import { DeployButton, EnvEditor } from "./actions";
import { RuntimeLogs } from "@/components/v2/runtime-logs";
// Ported from the parallel dashboard this page replaced. These are the four
// controls that lane had and this one did not; the routes here won because
// they are the ones verified end to end against real data.
import { SizingPicker } from "@/components/v2/sizing-picker";
import { SleepSettings } from "@/components/v2/sleep-settings";
import { BuildSettings } from "@/components/v2/build-settings";
import { DeleteProject } from "@/components/v2/delete-project";
import { SourceSettings } from "@/components/v2/source-settings";
import { PromoteControl } from "@/components/v2/promote-control";
import { DomainManager } from "@/components/v2/domain-manager";
import { Notice } from "@/components/v2/notice";
// Same modules the deployment detail page uses, so the log is scrubbed by one
// set of rules rather than two that can drift.
import { getObject, r2Keys } from "@/lib/paas/build/r2.ts";
import { sanitizeBuildLog, tail, alterationNotice } from "@/lib/paas/telemetry/build-log.ts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROJECT_REF = /^prj-[0-9a-f]{12}$/;


export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { ref } = await params;
  const { tab: requestedTab } = await searchParams;
  // An unknown tab falls back to overview rather than rendering nothing. A
  // hand-edited or stale URL should show the page, not a blank one.
  const tab = isSection(requestedTab) ? requestedTab : "overview";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?redirectTo=${encodeURIComponent(`/dashboard/services/apps/${ref}`)}`);
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
    .select("id,ref,name,slug,repo_full_name,production_branch,tier,instance_count,scale_to_zero,idle_seconds,root_directory,build_context_repo_root,deleted_at")
    .eq("ref", ref)
    .maybeSingle();

  if (projectError) {
    return (
      <ServiceShell>
        <Failed what="this project" />
      </ServiceShell>
    );
  }
  if (!project || project.deleted_at) notFound();

  const [deployments, aliases, envVars, environments, domains, charges, samples] = await Promise.all([
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
    // Same column list the API uses. This selected `hostname` and `status`,
    // which are not columns — the table has `domain` and `state` — so the
    // query errored and the tab reported a read failure on a readable table.
    db
      .from("domains")
      .select(DOMAIN_COLUMNS)
      .eq("project_id", project.id)
      // MATCHING THE API, which has always excluded removed rows. This page
      // reimplemented the query and left that filter out, so a removed domain
      // stayed listed for ever — and its Remove button answered 404, because
      // DELETE looks for a row that is NOT already removed. Seen live on
      // task1.cs2hvh.com: two clicks, two 404s, nothing wrong with the button
      // or the route.
      //
      // The row is kept rather than deleted so the Cloudflare custom hostname
      // can still be torn down; `removed` is a state, not an absence.
      .neq("state", "removed")
      .order("created_at", { ascending: true }),
    // Read here rather than through /api/v2/projects/{ref}/usage for the same
    // reason as everything else on this page: a server render taking an HTTP
    // round trip to its own process adds a failure mode and an auth hop for
    // nothing. Both paths sum with summariseCharges, so they cannot disagree.
    db
      .from("project_charges")
      .select("period_start,amount_usd,tier,instances")
      .eq("project_id", project.id)
      .gte(
        "period_start",
        new Date(Date.now() - 31 * 86_400_000).toISOString(),
      )
      .order("period_start", { ascending: false }),
    // The health samples sweep-usage-sample has been writing every fifteen
    // minutes since the platform existed. Nothing had ever read them: the data
    // behind "is my app healthy" was on disk the whole time with nothing in
    // front of it.
    db
      .from("usage_samples")
      .select("sampled_at,pod_seconds,warm_seconds,peak_pods,restarts,unobserved_seconds,period_seconds")
      .eq("project_id", project.id)
      .gte("sampled_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .order("sampled_at", { ascending: false })
      .limit(700),
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

  // Runtime logs follow what production POINTS AT when something does, because
  // logs from a superseded build are almost never what somebody wants. With
  // nothing pointed — a project built but not yet routed — the newest
  // deployment is the only sensible answer, and the API says so if it has no
  // pods.
  const logsTarget =
    (deployments.data ?? []).find((d) => production?.deployment_id && d.ref === latest?.ref) ?? latest;

  /**
   * Why there is no output, when there is no output.
   *
   * The API can only report what the cluster shows it — zero pods. It does not
   * read aliases or the sleep setting, so it cannot tell a build that was never
   * routed from one asleep on purpose from one whose build failed. Those need
   * three different actions from the reader, and this page is the only place
   * that holds all three facts.
   *
   * Ordered most-specific first. A failed build is why there is no pod even if
   * the project is also unrouted, and saying 'deploy it' to somebody whose
   * deploy just failed is the least useful thing on the page.
   */
  // Cloudflare's live view, merged with the rows. Without it the tab could
  // show a domain Cloudflare calls verified while its certificate is still
  // pending — configured-looking and serving nothing.
  const domainRows = (domains.data ?? []) as unknown as DomainRow[];
  const liveHostnames = await liveStateFor(domainRows.map((d) => d.domain));
  const domainDtos = domainRows.map((d) =>
    toDomainDto(d, liveHostnames.get(d.domain.toLowerCase()) ?? null),
  );

  // Live while ANY deployment is moving, not only the newest. A rollback or a
  // second push leaves an older row building, and a page that stopped
  // refreshing because the top row settled would freeze mid-build.
  const anyInFlight = (deployments.data ?? []).some(
    (d) => d.state === "queued" || d.state === "building" || d.state === "publishing",
  );

  const emptyExplanation =
    logsTarget?.state === "error"
      ? {
          what: "The last deployment failed, so nothing was ever started.",
          action:
            "Open it under Deployments — the build log says where it stopped. Runtime logs only exist once a container runs.",
        }
      : !production
        ? {
            what: "This project has no hostname yet, so its build was never routed.",
            action:
              "The image is built and waiting. Use Deploy to publish it — that creates the hostname and starts a pod.",
          }
        : project.scale_to_zero
          ? {
              what: "This project is asleep. Scale to zero is on, so it runs no pods until a request arrives.",
              action:
                "Open the site and it will wake, then output appears here. Turn this off under Settings if you want it always warm.",
            }
          : null;

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

  /*
    THE LATEST BUILD'S LOG, read here so the Deployments tab can show it
    without a click. Only on that tab — R2 is a network call and the other
    tabs have no use for it.

    Only the most recent deployment. Older builds keep their own page:
    rendering every log inline would turn a list into a wall and make the
    one that matters harder to find, not easier.
  */
  let latestLog: string | null = null;
  let latestLogNotice: string | null = null;
  let latestLogFailed = false;
  // `latest` is already resolved above — the newest deployment is the newest
  // deployment, and two names for it is how they drift apart.
  const latestInFlight =
    latest?.state === "queued" || latest?.state === "building" || latest?.state === "publishing";

  if (tab === "deployments" && latest) {
    try {
      const bytes = await getObject(r2Keys.buildLog(latest.ref));
      if (bytes) {
        // Whole log sanitised BEFORE the tail is taken. The reverse order
        // can split a credential across the cut and hide it in both halves.
        const clean = sanitizeBuildLog(bytes.toString("utf8"));
        latestLog = tail(clean, 200).lines.join("\n");
        latestLogNotice = alterationNotice(clean);
      }
    } catch (err) {
      console.error("[dashboard/v2] inline build log read failed:", err);
      latestLogFailed = true;
    }
  }

  return (
    <ServiceShell>
      <PageHeader
        title={project.slug}
        back={{ href: "/dashboard/services/apps", label: "Projects" }}
        description={
          <span className="font-mono text-xs">
            {project.repo_full_name} · {project.production_branch}
            {project.root_directory ? ` · /${project.root_directory}` : ""}
          </span>
        }
        actions={<DeployButton projectRef={project.ref} branch={project.production_branch} />}
      />

      {/*
        Sections, not one long column. This page carries serving state, build
        history, previews, domains, environment, billing and sizing — stacked,
        the settings pushed the deployment list below the fold, which is the
        thing people open the page to look at.

        ServiceTabBar is the same control compute, database, kubernetes and
        object storage use. Its own header calls it the single source of truth,
        and a second tab control for v2 would make the newest surface the one
        that looks like a different product.
      */}
      <TabNav active={tab} />

      {/*
        Deploying is the one time somebody sits on this page waiting, and it
        was the one time the page did not move. It stops on its own the
        moment nothing is in flight.
      */}
      <div className="-mt-2 mb-4">
        <AutoRefresh active={anyInFlight} label="Deploying — this page is updating itself." />
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
      {/*
        HEALTH FIRST. Serving tells you where the app is; this tells you
        whether it has been working, which is the question somebody opens the
        page to answer at the moment it matters.
      */}
      <Card title="Health" icon={Activity}>
        {samples.error ? (
          <Failed what="health samples" detail="The app is unaffected — this is a monitoring read." />
        ) : (
          (() => {
            const health = summariseHealth((samples.data ?? []) as unknown as UsageSample[]);
            const verdict = healthVerdict(health);
            return (
              <>
                <div className="flex flex-wrap gap-6">
                  <Stat
                    label="Uptime"
                    // Null renders as a dash, never as 0%. Zero means we
                    // watched and it was down; a dash means nobody looked.
                    value={health.uptimePct === null ? "—" : `${health.uptimePct}%`}
                    tone={
                      verdict.state === "healthy"
                        ? "good"
                        : verdict.state === "degraded"
                          ? "warn"
                          : verdict.state === "down"
                            ? "bad"
                            : "default"
                    }
                    hint="of time we could observe"
                  />
                  <Stat label="Serving" value={humanDuration(health.warmSeconds)} hint="at least one pod ready" />
                  <Stat
                    label="Restarts"
                    value={health.restarts}
                    tone={health.restarts > 0 ? "warn" : "default"}
                    hint={health.restarts > 0 ? "a crash loop shows up here first" : undefined}
                  />
                  <Stat label="Peak pods" value={health.peakPods} hint="most running at once" />
                </div>

                <p className="mt-3 text-xs text-white/50">
                  {verdict.reason}{" "}
                  <span className="text-white/30">Last 7 days, sampled every 15 minutes.</span>
                </p>

                {/*
                  Said out loud rather than folded into the percentage. Time
                  nobody measured is OUR gap, and hiding it would let a
                  sampler outage read as the customer's app being down.
                */}
                {health.unobservedSeconds > 0 ? (
                  <p className="mt-1 text-xs text-white/35">
                    {humanDuration(health.unobservedSeconds)} of this window could not be measured and is
                    excluded from the percentage — that is a gap in our sampling, not downtime.
                  </p>
                ) : null}
              </>
            );
          })()
        )}
      </Card>

      <Card title="Serving">
        {production ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a
              href={`https://${production.hostname}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-sky-300 transition-colors hover:text-sky-200"
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
        {/* Counted AFTER removing what is already serving — promotable holds the
            live deployment too, so the old check drew a divider above an empty
            control whenever the newest build was the one running. */}
        {production && promotable.some((p) => p.ref !== latest?.ref) && (
          <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/10">
            <PromoteControl
              projectRef={project.ref}
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
          <p className="mt-3 text-xs text-white/40">
            {sizing.label} · {sizing.memory} memory · {sizing.cpu} CPU · ×{project.instance_count}
          </p>
        ) : (
          <p className="mt-3 text-xs text-red-300">
            Plan &quot;{project.tier}&quot; is not in the price list — this project cannot be sized. Contact support.
          </p>
        )}
      </Card>

      {/*
        WHAT THIS APP IS, which the page never said. Health and Serving answer
        'is it up' and 'where'; somebody arriving cold also needs to know which
        repository and branch this builds from, what commit is live, and what it
        is costing — and every one of those was only discoverable by clicking
        into another tab or reading a build log.

        Facts, not prose. Each row is a value somebody might need to copy or
        compare, which is why they are monospaced and why the commit is here at
        all: 'it deployed' and 'it deployed THIS' are different claims.
      */}
      <Card title="This app" icon={Boxes}>
        <Facts
          items={[
            {
              label: "Repository",
              value: (
                <a
                  href={`https://github.com/${project.repo_full_name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-300 transition-colors hover:text-sky-200"
                >
                  {project.repo_full_name}
                </a>
              ),
            },
            { label: "Production branch", value: project.production_branch },
            {
              label: "Root directory",
              // A monorepo deploys from a subdirectory, and getting this wrong
              // is one of the commonest reasons a build fails confusingly.
              value: project.root_directory ?? <span className="text-white/40">repository root</span>,
            },
            {
              label: "Live commit",
              value: latest?.git_sha ? (
                <a
                  href={`https://github.com/${project.repo_full_name}/commit/${latest.git_sha}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-300 transition-colors hover:text-sky-200"
                >
                  {latest.git_sha.slice(0, 7)}
                </a>
              ) : (
                <span className="text-white/40">not deployed yet</span>
              ),
            },
            {
              label: "Size",
              value: sizing
                ? `${sizing.label} · ${sizing.memory} · ${sizing.cpu} · ×${project.instance_count}`
                : `${project.tier} (not in the price list)`,
            },
            {
              label: "Sleeps when idle",
              // Named because it changes what a visitor experiences, and it is
              // off unless somebody turned it on.
              value: project.scale_to_zero ? (
                `after ${Math.round((project.idle_seconds ?? 900) / 60)} min idle`
              ) : (
                <span className="text-white/40">no — always warm</span>
              ),
            },
            {
              label: "Preview branches",
              value:
                previewAliases.length > 0 ? (
                  `${previewAliases.length} live`
                ) : (
                  <span className="text-white/40">none right now</span>
                ),
            },
            { label: "Project id", value: project.ref },
          ]}
        />
      </Card>
        </div>
      ) : null}

      {tab === "deployments" ? (
        <div className="space-y-4">
      <Card
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
          <ul className="divide-y divide-white/[0.06]">
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
                      href={`/dashboard/services/apps/${project.ref}/deployments/${d.ref}`}
                      className="text-xs text-sky-300 transition-colors hover:text-sky-200"
                    >
                      <code className="text-xs">
                        {isPlaceholderSha(d.git_sha) ? d.ref : d.git_sha!.slice(0, 7)}
                      </code>
                    </Link>
                    <span className="text-xs text-white/40">{d.git_ref}</span>
                    <span className="text-xs text-white/30">{d.trigger}</span>
                  </div>
                  {d.error_message ? (
                    <p className="mt-0.5 truncate text-xs text-red-300">{d.error_message}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-white/40">{timeAgo(d.ready_at ?? d.queued_at)}</span>
                  <StateBadge state={d.state} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/*
        The newest build's output, in place. The row above is still a link
        for anything older — this is the one somebody is actually waiting on.
      */}
      {latest ? (
        <Card
          title="Build log"
          subtitle={`${isPlaceholderSha(latest.git_sha) ? latest.ref : latest.git_sha!.slice(0, 7)} · newest build`}
          actions={<AutoRefresh active={Boolean(latestInFlight)} />}
        >
          {latestLogFailed ? (
            <Notice tone="blocked" title="Could not read the build log.">
              The deployment exists; the log store did not respond.
            </Notice>
          ) : latestLog === null ? (
            <Notice
              title={
                latest.state === "queued"
                  ? "The build has not started yet."
                  : latestInFlight
                    ? "The build machine has not sent anything yet."
                    : "No build log was stored for this deployment."
              }
            >
              {latestInFlight
                ? "Output is scrubbed of credentials on the build machine before it is sent, so the first lines appear a few seconds in. This page is updating itself."
                : null}
            </Notice>
          ) : (
            <>
              {latestLogNotice ? (
                <p className="m-0 mb-2 text-[12px] text-white/40">{latestLogNotice}</p>
              ) : null}
              <pre className="m-0 max-h-[460px] overflow-auto rounded-[6px] border border-white/[0.09] bg-black/40 p-4 font-mono text-[12px] leading-[1.65] text-white/75">
                {latestLog}
              </pre>
            </>
          )}
        </Card>
      ) : null}

      <Card
        title="Previews"
        subtitle="Free, Starter-sized, and removed 48 hours after their last push"
      >
        {previewEnvs.length === 0 ? (
          <p className="text-sm text-white/40">
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
                      className="shrink-0 text-xs text-sky-300 transition-colors hover:text-sky-200"
                    >
                      {alias.hostname}
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-white/30">building</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
        </div>
      ) : null}

      {tab === "logs" ? (
        <div className="space-y-4">
          {/*
            What the app is PRINTING, as opposed to why it built. The API has
            existed since the platform did and nothing reached it, so the
            question a customer asks every day after the first deploy had no
            answer in the product.

            Scoped to the deployment production points at. Runtime logs for a
            superseded build are almost never what somebody wants, and offering
            every historical deployment here would bury the one that matters.
          */}
          <Card
            title="Runtime logs"
           
          >
            {/*
              GATED ON A DEPLOYMENT EXISTING, NOT ON ONE BEING ROUTED.

              This asked for a production alias too, and refused to render
              without one — so a project whose build is ready but whose hostname
              has not been pointed yet showed 'nothing is serving' and never
              asked the cluster. The pods may well be running; an alias is about
              ROUTING, not about whether a container is alive.

              The API already answers the empty case properly, and better than a
              guess from here: it distinguishes a superseded deployment scaled to
              zero from one that has not started, and explains which. Duplicating
              that decision in the page is how the two came to disagree.
            */}
            {logsTarget ? (
              <RuntimeLogs deploymentRef={logsTarget.ref} emptyExplanation={emptyExplanation} />
            ) : (
              <Empty title="Nothing deployed yet">
                Runtime logs come from running pods. Deploy this project and they will appear here;
                until then the build log on a deployment is the place to look.
              </Empty>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="space-y-4">
      {/* First, because it is the only setting that decides WHAT gets built.
          Size, sleep and build context all describe how to run whatever this
          points at. */}
      <Card title="Source">
        <SourceSettings
          projectRef={project.ref}
          repoFullName={project.repo_full_name}
          productionBranch={project.production_branch}
          rootDirectory={project.root_directory}
        />
      </Card>

      <Card title="Size">
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
      </Card>

      <Card title="Sleep">
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
      </Card>

      <Card title="Build">
        <BuildSettings
          projectRef={project.ref}
          rootDirectory={project.root_directory}
          contextRepoRoot={project.build_context_repo_root === true}
        />
      </Card>

      {/*
        Last, and visually separated, because it is the one control on this page
        that cannot be undone. DELETE used to mark the row and leave the workload
        running — prj-61de90bd2dae sat for eleven hours with three Deployments
        still in its namespace — so this had no honest UI to attach to until the
        route actually tore things down.
      */}
      <Card title="Delete this project" subtitle="Permanent, and it takes the running app with it">
        <DeleteProject
          projectRef={project.ref}
          projectName={project.name}
          hostnames={(aliases.data ?? []).map((a) => a.hostname as string)}
        />
      </Card>
        </div>
      ) : null}

      {tab === "domains" ? (
        <div className="space-y-4">
      <Card title="Custom domains">
        {domains.error ? (
          <Failed what="custom domains" />
        ) : (
          <DomainManager
            projectRef={project.ref}
            // toDomainDto, not a second mapping. The copy here passed
            // `verification: null` unconditionally and threw away
            // verification_txt, so even with the columns right the customer
            // was never shown the TXT record they have to add. A domains page
            // that lists a domain and cannot tell you how to verify it is
            // worse than one that admits it is broken.
            domains={domainDtos}
            customHostnamesEnabled={customHostnamesEnabled}
          />
        )}
      </Card>
        </div>
      ) : null}

      {tab === "environment" ? (
        <div className="space-y-4">
      <Card title="Environment variables" subtitle="Encrypted at rest, available to the build and the container">
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
      </Card>
        </div>
      ) : null}

      {tab === "usage" ? (
        <div className="space-y-4">
      {/*
        Billing existed and nothing showed it. A customer whose balance is drawn
        down with no way to see what for has to take our word for the number,
        and the first time they doubt it there is nothing to point at.

        EVERY FIGURE IS SUMMED FROM THE ROWS, never recomputed from the tier.
        The rows record what was actually taken, including the tier at the time,
        so re-deriving from today's tier would restate history the moment
        somebody resized — and the restated figure would disagree with the
        balance for reasons nobody could trace.
      */}
      <Card title="Usage" subtitle="Charged by the hour, last 31 days" icon={Receipt}>
        {charges.error ? (
          // NOT an empty bill. Rendering a failed read as "you have been charged
          // nothing" is the one direction a billing panel must never fail in.
          <Failed what="your usage" detail="This is a display problem, not a billing one." />
        ) : (
          (() => {
            const summary = summariseCharges(charges.data ?? []);
            let monthly: number | null = null;
            try {
              const t = requireTier(project.tier);
              monthly =
                Math.round(
                  hourlyRateUsd(t, clampInstances(project.instance_count ?? 1)) *
                    BILLING_HOURS_PER_MONTH *
                    100,
                ) / 100;
            } catch {
              // An unpriceable tier shows no projection rather than a guessed
              // one. A projection based on the cheapest plan understates a bill.
              monthly = null;
            }
            return (
              <>
                <div className="flex flex-wrap gap-6">
                  <Stat
                    label="Charged"
                    value={`${summary.totalUsd.toFixed(4)}`}
                    hint={`${summary.hoursBilled} hour${summary.hoursBilled === 1 ? "" : "s"} billed`}
                  />
                  {monthly !== null ? (
                    <Stat
                      label="At this size"
                      value={`${monthly.toFixed(2)}`}
                      hint="per month if it never sleeps"
                    />
                  ) : null}
                </div>

                {summary.unreadable > 0 ? (
                  <p className="mt-3 text-xs text-amber-300">
                    {summary.unreadable} charge row(s) could not be read and are excluded from the total
                    above. Please contact support before relying on this figure.
                  </p>
                ) : null}

                {summary.hoursBilled === 0 ? (
                  <p className="mt-3 text-xs text-white/40">
                    Nothing charged yet. Metering runs hourly and only bills hours the app was actually
                    running — an app asleep or stopped costs nothing.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {summary.byDay.slice(0, 7).map((d) => (
                      <li key={d.day} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-mono text-white/50">{d.day}</span>
                        <span className="text-white/30">{d.hours}h</span>
                        <span className="font-mono tabular-nums text-white/70">
                          ${d.amountUsd.toFixed(4)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()
        )}
      </Card>
        </div>
      ) : null}
    </ServiceShell>
  );
}
