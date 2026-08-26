/**
 * /dashboard/v2/[ref] — project detail: what serves traffic, and the
 * deployment history behind it.
 *
 * The aliases table is above the deployment list on purpose. "Which build is
 * my site actually running" is the question this page exists to answer, and a
 * deployment marked ready is not necessarily the one being served.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { getCaller } from "@/app/api/v2/_lib/auth";
import {
  DEPLOYMENT_COLUMNS,
  toDeploymentDto,
  type DeploymentRow,
} from "@/app/api/v2/_lib/deployments";
import { Notice, Empty } from "@/components/v2/notice";
import { StateBadge, Timestamp, Duration } from "@/components/v2/state-badge";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

interface AliasRow {
  ref: string;
  hostname: string;
  kind: string;
  deployments: { ref: string; git_sha: string; state: string } | null;
}

export default async function ProjectPage({ params }: Params) {
  const { ref } = await params;
  const caller = await getCaller();

  if (!caller) {
    return (
      <Shell name={ref} repo={null}>
        <Notice title="Sign in to continue." />
      </Shell>
    );
  }

  const { data: projectRow } = await caller.db
    .from("projects")
    .select("id, ref, name, repo_full_name, production_branch, framework, installation_id")
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();

  // Not-visible and not-existing are the same answer here, exactly as in the
  // API. A distinct "forbidden" page would confirm the ref is real.
  if (!projectRow) notFound();

  const project = projectRow as {
    id: string;
    ref: string;
    name: string;
    repo_full_name: string;
    production_branch: string;
    framework: string | null;
    installation_id: number | null;
  };

  const [{ data: aliasRows }, { data: deploymentRows }] = await Promise.all([
    caller.db
      .from("aliases")
      .select("ref, hostname, kind, deployments:deployment_id (ref, git_sha, state)")
      .eq("project_id", project.id)
      .order("kind", { ascending: true }),
    caller.db
      .from("deployments")
      .select(DEPLOYMENT_COLUMNS)
      .eq("project_id", project.id)
      .order("queued_at", { ascending: false })
      .limit(20),
  ]);

  const aliases = (aliasRows ?? []) as AliasRow[];
  const deployments = ((deploymentRows ?? []) as DeploymentRow[]).map(
    toDeploymentDto
  );

  return (
    <Shell name={project.name} repo={project.repo_full_name}>
      {project.installation_id === null && (
        <Notice
          tone="blocked"
          title="This project has no GitHub App installation."
          action="Install the GitHub App on the repository owner to enable builds."
          className="mb-6"
        >
          Deployments cannot be triggered or built until it is connected.
        </Notice>
      )}

      <Section title="Serving">
        {aliases.length === 0 ? (
          <Empty title="No hostnames yet.">
            A production alias is created with the first deployment.
          </Empty>
        ) : (
          <div className="border border-white/[0.09]">
            {aliases.map((alias, i) => (
              <div
                key={alias.ref}
                className={`flex items-center justify-between gap-4 px-5 py-3.5 ${
                  i > 0 ? "border-t border-white/[0.06]" : ""
                }`}
              >
                <div className="min-w-0">
                  <a
                    href={`https://${alias.hostname}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="truncate text-[13.5px] text-white hover:text-sky-300"
                  >
                    {alias.hostname}
                  </a>
                  <p className="m-0 mt-0.5 text-[11.5px] uppercase tracking-[0.1em] text-white/30">
                    {alias.kind}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[12.5px]">
                  {alias.deployments ? (
                    <Link
                      href={`/dashboard/v2/deployments/${alias.deployments.ref}`}
                      className="font-mono text-white/70 hover:text-white"
                    >
                      {alias.deployments.git_sha.slice(0, 7)}
                    </Link>
                  ) : (
                    <span className="text-white/30">nothing assigned</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Deployments">
        {deployments.length === 0 ? (
          <Empty title="No deployments yet.">
            Pushing to {project.production_branch} will create one once the
            build pipeline is connected.
          </Empty>
        ) : (
          <div className="overflow-x-auto border border-white/[0.09]">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="bg-[linear-gradient(90deg,rgba(0,149,255,0.10),rgba(255,255,255,0.04)_22%,rgba(255,255,255,0.03)_100%)]">
                  {["Commit", "State", "Trigger", "Queued", "Duration"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-white/[0.08] px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deployments.map((d, i) => (
                  <tr
                    key={d.ref}
                    className={`transition-colors hover:bg-white/[0.05] ${
                      i % 2 === 1 ? "bg-white/[0.02]" : ""
                    } ${i < deployments.length - 1 ? "border-b border-white/[0.05]" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/v2/deployments/${d.ref}`}
                        className="font-mono text-[13px] text-white hover:text-sky-300"
                      >
                        {d.commit.shortSha}
                      </Link>
                      <p className="m-0 mt-0.5 max-w-[280px] truncate text-[12px] text-white/40">
                        {d.commit.message ?? d.commit.ref}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StateBadge state={d.state} />
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-white/50">
                      {d.trigger.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-white/50">
                      <Timestamp value={d.timing.queuedAt} />
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-white/50">
                      <Duration ms={d.timing.durationMs} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </Shell>
  );
}

function Shell({
  name,
  repo,
  children,
}: {
  name: string;
  repo: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-10">
      <Link
        href="/dashboard/v2"
        className="text-[12.5px] text-white/40 hover:text-white"
      >
        ← Projects
      </Link>
      <div className="mb-8 mt-3">
        <h1 className="m-0 text-[26px] font-normal tracking-tight text-white">
          {name}
        </h1>
        {repo && (
          <p className="m-0 mt-1.5 text-[13.5px] text-white/45">{repo}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {title}
      </h2>
      {children}
    </section>
  );
}
