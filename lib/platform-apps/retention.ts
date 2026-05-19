export type PlatformAppPlan = "free" | "pro" | "team" | "enterprise";
export type PlatformAppBuildStatus = "success" | "failed" | "building" | "unknown";

export interface PlatformAppRetentionPolicy {
  plan: PlatformAppPlan;
  appLimit: number | null;
  deploymentHistory: {
    defaultVisible: number;
    maxLoadable: number;
    adminMax: number;
  };
  rollback: {
    successfulBuilds: number;
  };
  jenkins: {
    buildsToKeep: number;
    daysToKeep: number;
    artifactBuildsToKeep: number;
    artifactDaysToKeep: number;
  };
  logs: {
    successfulBuildDays: number;
    failedBuildDays: number;
    productionBuildDays: number;
    runtimeHotDays: number;
    pinnedBuildDays: null;
  };
}
export const PLATFORM_APP_RETENTION_POLICIES: Record<PlatformAppPlan, PlatformAppRetentionPolicy> = {
  free: {
    plan: "free",
    appLimit: 1,
    deploymentHistory: {
      defaultVisible: 10,
      maxLoadable: 20,
      adminMax: 50,
    },
    rollback: {
      successfulBuilds: 3,
    },
    jenkins: {
      buildsToKeep: 20,
      daysToKeep: 7,
      artifactBuildsToKeep: 5,
      artifactDaysToKeep: 7,
    },
    logs: {
      successfulBuildDays: 7,
      failedBuildDays: 14,
      productionBuildDays: 30,
      runtimeHotDays: 3,
      pinnedBuildDays: null,
    },
  },
  pro: {
    plan: "pro",
    appLimit: 10,
    deploymentHistory: {
      defaultVisible: 20,
      maxLoadable: 50,
      adminMax: 100,
    },
    rollback: {
      successfulBuilds: 20,
    },
    jenkins: {
      buildsToKeep: 50,
      daysToKeep: 30,
      artifactBuildsToKeep: 20,
      artifactDaysToKeep: 30,
    },
    logs: {
      successfulBuildDays: 30,
      failedBuildDays: 90,
      productionBuildDays: 180,
      runtimeHotDays: 7,
      pinnedBuildDays: null,
    },
  },
  team: {
    plan: "team",
    appLimit: 50,
    deploymentHistory: {
      defaultVisible: 50,
      maxLoadable: 100,
      adminMax: 250,
    },
    rollback: {
      successfulBuilds: 50,
    },
    jenkins: {
      buildsToKeep: 100,
      daysToKeep: 90,
      artifactBuildsToKeep: 50,
      artifactDaysToKeep: 90,
    },
    logs: {
      successfulBuildDays: 90,
      failedBuildDays: 180,
      productionBuildDays: 180,
      runtimeHotDays: 14,
      pinnedBuildDays: null,
    },
  },
  enterprise: {
    plan: "enterprise",
    appLimit: null,
    deploymentHistory: {
      defaultVisible: 100,
      maxLoadable: 250,
      adminMax: 1000,
    },
    rollback: {
      successfulBuilds: 50,
    },
    jenkins: {
      buildsToKeep: 250,
      daysToKeep: 90,
      artifactBuildsToKeep: 100,
      artifactDaysToKeep: 90,
    },
    logs: {
      successfulBuildDays: 90,
      failedBuildDays: 180,
      productionBuildDays: 365,
      runtimeHotDays: 30,
      pinnedBuildDays: null,
    },
  },
};

// Current billing is instance-size based, not subscription-plan based. Use Pro as
// the active default until account plans are enforced in billing.
export const DEFAULT_PLATFORM_APP_PLAN: PlatformAppPlan = "pro";

export function getPlatformAppRetentionPolicy(
  plan: PlatformAppPlan | null | undefined = DEFAULT_PLATFORM_APP_PLAN
): PlatformAppRetentionPolicy {
  return PLATFORM_APP_RETENTION_POLICIES[plan ?? DEFAULT_PLATFORM_APP_PLAN] ?? PLATFORM_APP_RETENTION_POLICIES.pro;
}

export function clampDeploymentHistoryLimit(
  requested: number | null | undefined,
  policy = getPlatformAppRetentionPolicy()
): number {
  if (!requested || !Number.isFinite(requested)) {
    return policy.deploymentHistory.defaultVisible;
  }

  return Math.min(
    Math.max(Math.trunc(requested), 1),
    policy.deploymentHistory.maxLoadable
  );
}

export function getBuildLogRetentionDays(params: {
  status: PlatformAppBuildStatus;
  production?: boolean;
  pinned?: boolean;
  policy?: PlatformAppRetentionPolicy;
}): number | null {
  const policy = params.policy ?? getPlatformAppRetentionPolicy();
  if (params.pinned) return policy.logs.pinnedBuildDays;
  if (params.production) return policy.logs.productionBuildDays;
  if (params.status === "failed") return policy.logs.failedBuildDays;
  return policy.logs.successfulBuildDays;
}

export function getBuildLogRetentionUntil(params: {
  status: PlatformAppBuildStatus;
  production?: boolean;
  pinned?: boolean;
  from?: Date;
  policy?: PlatformAppRetentionPolicy;
}): string | null {
  const days = getBuildLogRetentionDays(params);
  if (days === null) return null;

  const from = params.from ?? new Date();
  const retentionUntil = new Date(from);
  retentionUntil.setUTCDate(retentionUntil.getUTCDate() + days);
  return retentionUntil.toISOString();
}
