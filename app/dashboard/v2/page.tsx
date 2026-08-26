/**
 * /dashboard/v2 — project list.
 *
 * Server component reading through the same RLS-scoped client the API uses,
 * so what renders is exactly what /api/v2/projects would return. No
 * service-role client, no per-page ownership check to forget.
 */

import Link from "next/link";

import { getCaller } from "@/app/api/v2/_lib/auth";
import {
  PROJECT_COLUMNS_WITH_TEAM,
  toProjectDto,
  type ProjectRow,
} from "@/app/api/v2/_lib/serialize";
import { Notice, Empty } from "@/components/v2/notice";
import { Timestamp } from "@/components/v2/state-badge";

export const dynamic = "force-dynamic";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const caller = await getCaller();

  if (!caller) {
    return (
      <Shell>
        <Notice title="Sign in to continue.">
          This page shows the projects belonging to your team.
        </Notice>
      </Shell>
    );
  }

  const { data, error } = await caller.db
    .from("projects")
    .select(PROJECT_COLUMNS_WITH_TEAM)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[dashboard/v2] project list failed:", error);
    return (
      <Shell>
        <Notice tone="blocked" title="Could not load your projects.">
          The request failed. This is not an empty list — try again.
        </Notice>
      </Shell>
    );
  }

  const projects = (data as ProjectRow[]).map(toProjectDto);

  return (
    <Shell>
      {projects.length === 0 ? (
        <>
          <Empty title="No projects yet.">
            Connect a Git repository to create one.
          </Empty>
          <Notice
            title="Connect a GitHub repository to get started."
            action="You need admin on the team you are connecting to."
            className="mt-3"
          >
            Installing the app records which repositories your team can deploy.
            Nothing is deployed until you pick one.
          </Notice>
        </>
      ) : (
        <div className="border border-white/[0.09]">
          {projects.map((project, i) => (
            <Link
              key={project.ref}
              href={`/dashboard/v2/${project.ref}`}
              className={`flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.04] ${
                i > 0 ? "border-t border-white/[0.06]" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="m-0 truncate text-[14.5px] font-medium text-white">
                  {project.name}
                </p>
                <p className="m-0 mt-0.5 truncate text-[12.5px] text-white/45">
                  {project.repo.fullName} · {project.repo.productionBranch}
                  {project.framework ? ` · ${project.framework}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right text-[12px] text-white/35">
                {!project.repo.installed && (
                  <span className="mr-3 border border-amber-400/30 bg-amber-400/[0.08] px-2 py-0.5 text-[11px] text-amber-300">
                    Not connected
                  </span>
                )}
                <Timestamp value={project.createdAt} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 text-[26px] font-normal tracking-tight text-white">
          Projects
        </h1>
        <p className="m-0 mt-1.5 text-[13.5px] text-white/45">
          Applications deployed from a Git repository.
        </p>
      </div>
      {children}
    </div>
  );
}
