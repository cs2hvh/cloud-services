import { buildQueue, quickBuildQueue } from "./queue-build";

export interface BuildJobData {
  appId: string;
  buildType: "patch" | "minor" | "major" | "full";
  sourceHash: string;
  timestamp: number;
}

export async function queueBuild(data: BuildJobData) {
  const isQuick = data.buildType === "patch";
  const queue = isQuick ? quickBuildQueue : buildQueue;

  return queue.add("build", data, {
    jobId: `build-${data.appId}-${data.timestamp}`,
    priority: isQuick ? 100 : 1,
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function getBuildStats() {
  const [buildCounts, quickCounts] = await Promise.all([
    buildQueue.getJobCounts('waiting', 'active'),
    quickBuildQueue.getJobCounts('waiting', 'active'),
  ]);

  return {
    totalPending: (buildCounts.waiting ?? 0) + (quickCounts.waiting ?? 0),
    totalActive: (buildCounts.active ?? 0) + (quickCounts.active ?? 0),
  };
}
