/**
 * /dashboard/services/apps/[ref]/deployments/[dpl] — one deployment and its build log.
 *
 * The log is fetched server-side through the same R2 helper the API route
 * uses, after the deployment has been resolved through RLS. It is never
 * exposed as a presigned URL — see app/api/v2/deployments/[ref]/logs.
 */

import { notFound } from "next/navigation";

import { getObject, r2Keys } from "@/lib/paas/build/r2.ts";
import { sanitizeBuildLog, tail, alterationNotice } from "@/lib/paas/telemetry/build-log.ts";
import { getCaller } from "@/app/api/v2/_lib/auth";
import {
  DEPLOYMENT_COLUMNS_EXPANDED,
  toDeploymentDto,
  type DeploymentRow,
} from "@/app/api/v2/_lib/deployments";
import { ServiceShell, PageHeader } from "@/components/v2/kit";
import { Notice } from "@/components/v2/notice";
import { StateBadge, Timestamp, Duration } from "@/components/v2/state-badge";
import { AutoRefresh } from "@/components/v2/auto-refresh";

export const dynamic = "force-dynamic";

/**
 * Two segments now, not one. This page moved under the project when the two
 * parallel dashboards were merged, so `ref` is the PROJECT and `dpl` is the
 * deployment — the opposite of what it meant at the old top-level path. Naming
 * the deployment segment `dpl` rather than a second `ref` is deliberate: two
 * segments called `ref` would be a silent mix-up every time someone edits this
 * file, and the failure would be a 404 on a deployment that exists.
 */
type Params = { params: Promise<{ ref: string; dpl: string }> };

const LOG_TAIL_LINES = 400;

export default async function DeploymentPage({ params }: Params) {
  // `dpl` is this deployment; the project segment is not needed to resolve it,
  // because the deployment ref is unique and RLS decides visibility.
  const { dpl: ref } = await params;
  const caller = await getCaller();

  if (!caller) {
    return (
      <Shell>
        <Notice title="Sign in to continue." />
      </Shell>
    );
  }

  const { data } = await caller.db
    .from("deployments")
    .select(`id, ${DEPLOYMENT_COLUMNS_EXPANDED}`)
    .eq("ref", ref)
    .maybeSingle();

  if (!data) notFound();

  const row = data as DeploymentRow & { id: string };
  const d = toDeploymentDto(row);

  // Authorization already happened above; only now is R2 touched.
  let log: string | null = null;
  let logNotice: string | null = null;
  // Terminal or not. Drives both the polling and what an empty log means:
  // nothing yet on a running build is normal, nothing on a finished one is a
  // fact about the build.
  const inFlight = d.state === "queued" || d.state === "building" || d.state === "publishing";

  let logError = false;
  try {
    const bytes = await getObject(r2Keys.buildLog(d.ref));
    if (bytes) {
      // Sanitise the whole log, then take the tail. The type forbids the
      // reverse order — a credential straddling a cut looks innocuous in both
      // halves. Same module the API route uses, so one set of rules.
      const clean = sanitizeBuildLog(bytes.toString("utf8"));
      log = tail(clean, LOG_TAIL_LINES).lines.join("\n");
      logNotice = alterationNotice(clean);
    }
  } catch (err) {
    console.error("[dashboard/v2] build log read failed:", err);
    logError = true;
  }

  return (
    // Title and state now live in PageHeader, like every other page here.
    <Shell project={d.project} label={d.label} state={d.state}>

      {d.error && (
        <Notice
          tone="blocked"
          title={d.error.code ? `Build failed: ${d.error.code}` : "Build failed"}
          className="mb-6"
        >
          {d.error.message}
        </Notice>
      )}

      <dl className="mb-8 grid gap-px border border-white/[0.09] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="Commit"
          value={
            d.commit.message ??
            (d.commit.isPlaceholder ? "Not recorded" : d.commit.ref)
          }
        />
        <Fact label="Author" value={d.commit.author ?? "—"} />
        <Fact label="Branch" value={d.commit.ref} />
        <Fact label="Trigger" value={d.trigger.replace("_", " ")} />
        <Fact
          label="Queued"
          value={<Timestamp value={d.timing.queuedAt} />}
        />
        <Fact
          label="Started"
          value={<Timestamp value={d.timing.startedAt} />}
        />
        <Fact label="Duration" value={<Duration ms={d.timing.durationMs} />} />
        <Fact
          label="Image"
          value={
            d.image ? (
              <span className="font-mono text-[11.5px] break-all">
                {d.image.digest.slice(0, 19)}…
              </span>
            ) : (
              "—"
            )
          }
        />
        {/* Recorded at build time so a rollback restores THIS build's runtime,
            not whatever detection would produce today. Both fields caused
            outages when they lived only in build-time detection. */}
        <Fact
          label="Port"
          value={d.runtime.port === null ? "not recorded" : String(d.runtime.port)}
        />
        <Fact
          label="Runs as"
          value={
            d.runtime.user === null
              ? "not recorded"
              : d.runtime.user === 0
                ? "root"
                : `uid ${d.runtime.user}`
          }
        />
      </dl>

      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
          Build log
        </h2>
        {/*
          The page is a server snapshot and a build takes minutes, so without
          this the first thing somebody sees on their first deploy is an empty
          log with no way to tell whether that means working, broken, or done.
          It stops itself the moment the deployment reaches a terminal state.
        */}
        <AutoRefresh active={inFlight} />
      </div>

      {logError ? (
        <Notice tone="blocked" title="Could not read the build log.">
          The deployment exists; the log store did not respond.
        </Notice>
      ) : log === null ? (
        <Notice
          busy={inFlight}
          title={
            d.state === "queued" || !d.timing.startedAt
              ? "Preparing environment"
              : inFlight
                ? "Starting build"
                : "No build log was stored for this deployment."
          }
        >
          {inFlight
            ? "Output appears once the build machine reports in."
            : null}
        </Notice>
      ) : (
        <>
          {logNotice && (
            <p className="m-0 mb-2 text-[12px] text-white/40">{logNotice}</p>
          )}
          <pre className="max-h-[560px] overflow-auto border border-white/[0.09] bg-black/40 p-4 font-mono text-[12px] leading-[1.65] text-white/75">
            {log}
          </pre>
        </>
      )}
    </Shell>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-[#0c0d10] px-4 py-3">
      <dt className="text-[10.5px] uppercase tracking-[0.12em] text-white/30">
        {label}
      </dt>
      <dd className="m-0 mt-1 truncate text-[13px] text-white/80">{value}</dd>
    </div>
  );
}

function Shell({
  project,
  label,
  state,
  children,
}: {
  project?: { ref: string; name: string } | null;
  label?: string | null;
  state?: string | null;
  children: React.ReactNode;
}) {
  return (
    // THE SAME SHELL AS EVERY OTHER PAGE IN THIS LANE. This had its own,
    // capped at 1100px with a bare text link, so opening a build log dropped
    // you out of the dashboard's chrome onto a narrow column — on the page
    // somebody reaches precisely when a build is failing.
    //
    // PageHeader's `back` is the same control the project page uses, so the
    // way out of here looks like the way out of everywhere else.
    <ServiceShell>
      <PageHeader
        title={label ?? "Build"}
        back={{
          href: project ? `/dashboard/services/apps/${project.ref}` : "/dashboard/services/apps",
          label: project ? project.name : "Projects",
        }}
        description={
          project ? <span className="font-mono text-xs">{project.name}</span> : undefined
        }
        actions={state ? <StateBadge state={state} /> : undefined}
      />
      {children}
    </ServiceShell>
  );
}
