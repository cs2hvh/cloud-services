import { Worker, Job } from "bullmq";
import { getRedis } from "@/lib/queue";
import type { BuildJobData } from "@/lib/build-job";

declare global {
  var __buildWorker: Worker | undefined;
  var __quickBuildWorker: Worker | undefined;
}

async function processBuildJob(job: Job<BuildJobData>): Promise<void> {
  const { appId, sourceHash, branch: queuedBranch, deliveryId } = job.data;

  console.log(`[BuildWorker] Processing job ${job.id} for app ${appId} commit ${sourceHash?.slice(0, 7)}`);

  // Dynamic imports keep Next.js server modules out of the server.ts load path.
  // They are safe here because by the time a job is processed, Next.js is fully
  // initialized and the modules can be resolved without AsyncLocalStorage errors.
  const [{ Platform_Apps }, { AutoDeployService }] = await Promise.all([
    import("@/lib/supabase/queries"),
    import("@/lib/services/auto-deploy"),
  ]);

  const appResult = await Platform_Apps.get(appId);
  if (!appResult.success || !appResult.data) {
    throw new Error(`App not found: ${appId}`);
  }

  const app = appResult.data as {
    id: string;
    name: string;
    user_id: string;
    git_provider?: string | null;
    repository_url?: string | null;
    branch?: string | null;
    deploy_branch?: string | null;
    framework?: string | null;
    size?: string | null;
    port?: number | null;
  };

  if (!app.repository_url) {
    throw new Error(`App ${app.name} has no repository URL`);
  }

  const provider = (app.git_provider ?? 'github') as 'github' | 'gitlab' | 'bitbucket';
  const targetBranch = queuedBranch ?? app.deploy_branch ?? app.branch ?? 'main';

  const result = await AutoDeployService.deploy({
    appId: app.id,
    appName: app.name,
    userId: app.user_id,
    gitProvider: provider,
    repositoryUrl: app.repository_url,
    branch: targetBranch,
    framework: app.framework ?? 'nodejs',
    size: app.size ?? 'small',
    containerPort: app.port ?? undefined,
    commitSha: sourceHash,
    deliveryId: deliveryId,
  });

  if (result.skipped) {
    console.log(`[BuildWorker] Job ${job.id} skipped: ${result.skipReason}`);
    return;
  }

  if (!result.success) {
    throw new Error(result.error ?? 'AutoDeployService returned failure without an error message');
  }

  console.log(`[BuildWorker] Job ${job.id} dispatched build #${result.buildNumber} for ${app.name}`);
}

export function startBuildWorkers(): { close: () => Promise<void> } {
  const connection = getRedis();

  async function onJobFailed(job: Job<BuildJobData> | undefined, err: Error) {
    console.error(`[BuildWorker] Job ${job?.id} failed:`, err.message);
    const webhookId = job?.data?.webhookId;
    if (webhookId) {
      try {
        const { Platform_App_Webhooks } = await import("@/lib/supabase/queries");
        await Platform_App_Webhooks.record_trigger(webhookId, err.message);
      } catch (recordErr) {
        console.error(`[BuildWorker] Failed to record trigger error for webhook ${webhookId}:`, recordErr);
      }
    }
  }

  if (!globalThis.__buildWorker) {
    globalThis.__buildWorker = new Worker<BuildJobData>(
      "app-build-queue",
      processBuildJob,
      { connection, concurrency: 5 },
    );
    globalThis.__buildWorker.on("failed", onJobFailed);
    globalThis.__buildWorker.on("error", (err) => console.error("[BuildWorker] app-build-queue error:", err.message));
    console.log("[BuildWorker] app-build-queue worker started (concurrency=5)");
  }

  if (!globalThis.__quickBuildWorker) {
    globalThis.__quickBuildWorker = new Worker<BuildJobData>(
      "quick-build-queue",
      processBuildJob,
      { connection, concurrency: 10 },
    );
    globalThis.__quickBuildWorker.on("failed", onJobFailed);
    globalThis.__quickBuildWorker.on("error", (err) => console.error("[BuildWorker] quick-build-queue error:", err.message));
    console.log("[BuildWorker] quick-build-queue worker started (concurrency=10)");
  }

  return {
    async close() {
      await Promise.all([
        globalThis.__buildWorker?.close(),
        globalThis.__quickBuildWorker?.close(),
      ]);
      globalThis.__buildWorker = undefined;
      globalThis.__quickBuildWorker = undefined;
    },
  };
}
