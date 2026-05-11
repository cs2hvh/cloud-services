import { buildQueue, quickBuildQueue } from "./queue-build";

export interface BuildJobData {
  appId: string;
  buildType: "patch" | "minor" | "major" | "full";
  sourceHash: string;
  branch?: string;
  timestamp: number;
  deliveryId?: string;
  webhookId?: string;
}

export async function queueBuild(data: BuildJobData) {
  const isQuick = data.buildType === "patch";
  const queue = isQuick ? quickBuildQueue : buildQueue;

  // Use delivery ID as job ID when provided — prevents duplicate queue entries
  // for the same git push event (e.g. GitHub re-delivers on timeout).
  const jobId = data.deliveryId
    ? `delivery-${data.deliveryId}`
    : `build-${data.appId}-${data.timestamp}`;

  return queue.add("build", data, {
    jobId,
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
