/**
 * /dashboard/v2/deployments/[ref] — one deployment and its build log.
 *
 * The log is fetched server-side through the same R2 helper the API route
 * uses, after the deployment has been resolved through RLS. It is never
 * exposed as a presigned URL — see app/api/v2/deployments/[ref]/logs.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { getObject, r2Keys } from "@/lib/paas/build/r2.ts";
import { redactBuildLog } from "@/app/api/v2/_lib/redact";
import { getCaller } from "@/app/api/v2/_lib/auth";
import {
  DEPLOYMENT_COLUMNS_EXPANDED,
  toDeploymentDto,
  type DeploymentRow,
} from "@/app/api/v2/_lib/deployments";
import { Notice } from "@/components/v2/notice";
import { StateBadge, Timestamp, Duration } from "@/components/v2/state-badge";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

const MAX_LOG_BYTES = 512 * 1024;

export default async function DeploymentPage({ params }: Params) {
  const { ref } = await params;
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
  let logError = false;
  try {
    const bytes = await getObject(r2Keys.buildLog(d.ref));
    if (bytes) {
      // Redact before truncating so a credential straddling the cut is still
      // caught. Same helper the API route uses — one set of rules.
      const { text } = redactBuildLog(bytes.toString("utf8"));
      // Tail, not head — a build fails at the end.
      log = bytes.byteLength > MAX_LOG_BYTES ? text.slice(-MAX_LOG_BYTES) : text;
    }
  } catch (err) {
    console.error("[dashboard/v2] build log read failed:", err);
    logError = true;
  }

  return (
    <Shell project={d.project}>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-mono text-[24px] font-normal tracking-tight text-white">
          {d.label}
        </h1>
        <StateBadge state={d.state} />
      </div>

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

      <h2 className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
        Build log
      </h2>

      {logError ? (
        <Notice tone="blocked" title="Could not read the build log.">
          The deployment exists; the log store did not respond.
        </Notice>
      ) : log === null ? (
        <Notice
          title={
            d.state === "queued" || !d.timing.startedAt
              ? "The build has not started yet."
              : "No build log was stored for this deployment."
          }
        />
      ) : (
        <pre className="max-h-[560px] overflow-auto border border-white/[0.09] bg-black/40 p-4 font-mono text-[12px] leading-[1.65] text-white/75">
          {log}
        </pre>
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
  children,
}: {
  project?: { ref: string; name: string } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-10">
      <Link
        href={project ? `/dashboard/v2/${project.ref}` : "/dashboard/v2"}
        className="text-[12.5px] text-white/40 hover:text-white"
      >
        ← {project ? project.name : "Projects"}
      </Link>
      <div className="mt-3">{children}</div>
    </div>
  );
}
