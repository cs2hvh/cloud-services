// GET /api/v1/apps/[id]/deployments — deployment history for an app (PAT auth)
import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";
import jenkins from "@/lib/jenkins";
import {
  getAppHistoryType,
  isReleaseHistoryEntry,
  parseOperationDetails,
} from "@/lib/app-operations";
import type { AppDeploymentTrigger } from "@/lib/app-operations";

type DbDeployment = {
  build_number: number | null;
  commit_sha: string | null;
  status: string;
  trigger: AppDeploymentTrigger;
  failure_reason: string | null;
  rollback_target_build_number: number | null;
  operation_details: unknown;
  created_at: string;
  [key: string]: unknown;
};

export const GET = withV1Auth("apps:deployments:list", async (_req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) return idResult.error;
  const appId = idResult.id;

  const existing = await Platform_Apps.get(appId);
  if (!existing.success || !existing.data) {
    return v1Error("NOT_FOUND", 404, "App not found");
  }
  if (existing.data.user_id !== auth.userId) {
    return v1Error("FORBIDDEN", 403, "Access denied");
  }

  const app = existing.data;

  // Pending apps have no deployments yet
  if (app.status === "pending") {
    return v1Ok({
      data: {
        app_id: appId,
        app_name: app.name,
        deployments: [],
        total: 0,
        pending: true,
      },
    });
  }

  const jobName = app.name;

  // Fetch deployment records from DB
  const dbDeployments = (await Platform_App_Deployments.list_by_app(appId, 10)) as DbDeployment[];
  const dbDeploymentMap = new Map<number, DbDeployment>(
    dbDeployments
      .filter((d) => typeof d.build_number === "number")
      .map((d) => [d.build_number as number, d])
  );

  const deployments: Array<Record<string, unknown>> = [];
  const seenBuildNumbers = new Set<number>();

  // Merge with Jenkins build history
  try {
    const buildList = await jenkins.getBuildList(jobName, { limit: 10 });

    if (buildList && buildList.builds && buildList.builds.length > 0) {
      const buildPromises = buildList.builds.map(
        async (build: { number: number }) => {
          try {
            const buildInfo = await jenkins.getBuild(jobName, build.number);

            // Extract commit SHA from build actions (3-method fallback)
            let commitSha: string | null = null;
            let commitMessage: string | null = null;
            if (buildInfo.actions) {
              for (const action of buildInfo.actions) {
                if (action.lastBuiltRevision?.SHA1) {
                  commitSha = action.lastBuiltRevision.SHA1.substring(0, 7);
                }
                if (!commitSha && action.buildsByBranchName) {
                  const branches = Object.values(action.buildsByBranchName) as Array<{
                    revision?: { SHA1?: string };
                  }>;
                  for (const branch of branches) {
                    if (branch.revision?.SHA1) {
                      commitSha = branch.revision.SHA1.substring(0, 7);
                      break;
                    }
                  }
                }
                if (!commitSha && action.parameters) {
                  const shaParam = action.parameters.find(
                    (p: { name: string }) => p.name === "GIT_COMMIT"
                  ) as { value?: string } | undefined;
                  if (shaParam?.value) {
                    commitSha = shaParam.value.substring(0, 7);
                  }
                }
                if (!commitMessage) {
                  commitMessage =
                    (action as { lastBuiltRevision?: { branch?: Array<{ message?: string; msg?: string; comment?: string }> } })
                      .lastBuiltRevision?.branch?.[0]?.message ||
                    (action as { msg?: string }).msg ||
                    (action as { comment?: string }).comment ||
                    null;
                }
              }
            }

            const dbRecord = dbDeploymentMap.get(buildInfo.number);
            const operationDetails = dbRecord?.operation_details
              ? parseOperationDetails(dbRecord.operation_details, { trigger: dbRecord.trigger })
              : null;
            const historyType = getAppHistoryType({
              trigger: dbRecord?.trigger,
              buildNumber: buildInfo.number,
              operationDetails,
            });

            return {
              build_number: buildInfo.number,
              status: buildInfo.building ? "BUILDING" : buildInfo.result || "UNKNOWN",
              started_at: new Date(buildInfo.timestamp).toISOString(),
              duration: buildInfo.duration,
              commit_sha: commitSha || dbRecord?.commit_sha?.substring(0, 7),
              commit_message: commitMessage,
              trigger: dbRecord?.trigger,
              failure_reason: dbRecord?.failure_reason,
              rollback_target_build_number: dbRecord?.rollback_target_build_number ?? null,
              operation_type:
                operationDetails?.type ?? (dbRecord?.trigger === "resize" ? "resize" : "deploy"),
              history_type: historyType,
              is_release_build: historyType === "release",
            };
          } catch {
            const dbRecord = dbDeploymentMap.get(build.number);
            const operationDetails = dbRecord?.operation_details
              ? parseOperationDetails(dbRecord.operation_details, { trigger: dbRecord.trigger })
              : null;
            const historyType = getAppHistoryType({
              trigger: dbRecord?.trigger,
              buildNumber: build.number,
              operationDetails,
            });
            return {
              build_number: build.number,
              status:
                dbRecord?.status === "success"
                  ? "SUCCESS"
                  : dbRecord?.status === "failed"
                  ? "FAILURE"
                  : "UNKNOWN",
              started_at: dbRecord?.created_at || new Date().toISOString(),
              trigger: dbRecord?.trigger,
              failure_reason: dbRecord?.failure_reason,
              rollback_target_build_number: dbRecord?.rollback_target_build_number ?? null,
              operation_type:
                operationDetails?.type ?? (dbRecord?.trigger === "resize" ? "resize" : "deploy"),
              history_type: historyType,
              is_release_build: isReleaseHistoryEntry({
                trigger: dbRecord?.trigger,
                buildNumber: build.number,
                operationDetails,
              }),
            };
          }
        }
      );

      const builds = await Promise.all(buildPromises);
      builds.forEach((b: Record<string, unknown>) => {
        if (typeof b.build_number === "number") seenBuildNumbers.add(b.build_number as number);
      });
      deployments.push(...builds);
    }
  } catch (jenkinsErr) {
    console.error(`[v1/deployments] Jenkins error for ${jobName}:`, jenkinsErr);
    // Fall through to DB-only results
  }

  // Add DB-only records not already covered by Jenkins
  for (const dep of dbDeployments as DbDeployment[]) {
    const hasSeen =
      typeof dep.build_number === "number" && seenBuildNumbers.has(dep.build_number as number);
    if (hasSeen) continue;

    const operationDetails = dep.operation_details
      ? parseOperationDetails(dep.operation_details, { trigger: dep.trigger })
      : null;
    const historyType = getAppHistoryType({
      trigger: dep.trigger,
      buildNumber: dep.build_number ?? null,
      operationDetails,
    });
    deployments.push({
      build_number: dep.build_number ?? null,
      status:
        dep.status === "success"
          ? "SUCCESS"
          : dep.status === "failed"
          ? "FAILURE"
          : "BUILDING",
      started_at: dep.created_at,
      commit_sha: dep.commit_sha?.substring(0, 7) ?? null,
      trigger: dep.trigger,
      failure_reason: dep.failure_reason,
      rollback_target_build_number: dep.rollback_target_build_number ?? null,
      operation_type:
        operationDetails?.type ??
        (dep.trigger === "resize" ? "resize" : dep.trigger === "rollback" ? "rollback" : "deploy"),
      history_type: historyType,
      is_release_build: isReleaseHistoryEntry({
        trigger: dep.trigger,
        buildNumber: dep.build_number ?? null,
        operationDetails,
      }),
    });
  }

  deployments.sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(b.started_at as string).getTime() - new Date(a.started_at as string).getTime()
  );

  return v1Ok({
    data: {
      app_id: appId,
      app_name: app.name,
      deployments,
      total: deployments.length,
    },
  });
});
