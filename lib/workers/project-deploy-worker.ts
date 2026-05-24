import { Worker, Queue } from 'bullmq';
import { getRedis } from '@/lib/queue';
import { provisionProject, type ProvisionJobData } from '@/lib/templates/operations/project-provisioner';
import { createWorkerClient } from '@/lib/supabase/server';

const QUEUE_NAME = 'project-deploy-queue';
const WORKER_CONCURRENCY = parseInt(process.env.DEPLOY_WORKER_CONCURRENCY ?? '3', 10);

// Module-level queue instance — created once per process on first use
let deployQueue: Queue<ProvisionJobData> | null = null;

function getQueue(): Queue<ProvisionJobData> {
  if (!deployQueue) {
    deployQueue = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return deployQueue;
}

export async function enqueueProjectDeploy(data: ProvisionJobData): Promise<void> {
  // jobId = operationId deduplicates: safe to call twice for the same operation
  await getQueue().add('provision', data, { jobId: data.operationId });
}

export function startProjectDeployWorker(): { close: () => Promise<void> } {
  if (!process.env.REDIS_URL) {
    console.warn('[ProjectDeployWorker] REDIS_URL not set — worker not started');
    return { close: async () => {} };
  }

  const worker = new Worker<ProvisionJobData>(
    QUEUE_NAME,
    async (job) => {
      console.info(`[ProjectDeployWorker] start operationId=${job.data.operationId} attempt=${job.attemptsMade + 1}`);

      // Update heartbeat at job start so the DB reflects the worker is alive
      try {
        const db = await createWorkerClient();
        await db.from('operations').update({
          last_heartbeat_at: new Date().toISOString(),
        }).eq('id', job.data.operationId);
      } catch (heartbeatErr) {
        console.warn('[ProjectDeployWorker] heartbeat update failed:', heartbeatErr);
      }

      await provisionProject(job.data);
      console.info(`[ProjectDeployWorker] done  operationId=${job.data.operationId}`);
    },
    { connection: getRedis(), concurrency: WORKER_CONCURRENCY },
  );

  worker.on('failed', async (job, err) => {
    console.error(
      `[ProjectDeployWorker] failed operationId=${job?.data?.operationId} ` +
      `attempt=${job?.attemptsMade}/${job?.opts?.attempts ?? 3}: ${err.message}`,
    );

    // When BullMQ has exhausted all retry attempts, the 'failed' event fires
    // with attemptsMade === maxAttempts. At that point we must mark the operation
    // as failed in Postgres — otherwise it stays 'running' or 'queued' forever.
    const isLastAttempt = job && job.attemptsMade >= (job.opts?.attempts ?? 3);
    if (isLastAttempt && job?.data?.operationId) {
      try {
        const db = await createWorkerClient();
        await db.from('operations').update({
          status: 'failed',
          error_message: err.message,
          finished_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
        }).eq('id', job.data.operationId).in('status', ['queued', 'running', 'waiting']);

        await db.from('stacks').update({ status: 'failed' }).eq('id', job.data.projectId).in('status', ['creating', 'deploying']);
        await db.from('stacks').update({ status: 'degraded' }).eq('id', job.data.projectId).eq('status', 'deleting');
        await db.from('services').update({ status: 'failed' }).eq('project_id', job.data.projectId).in('status', ['pending', 'building', 'deploying', 'starting']);
      } catch (dbErr) {
        console.error('[ProjectDeployWorker] failed to record terminal failure in DB:', dbErr);
      }
    }
  });

  worker.on('error', (err) => {
    console.error('[ProjectDeployWorker] error:', err.message);
  });

  console.info(
    `[ProjectDeployWorker] started (concurrency=${WORKER_CONCURRENCY}, attempts=3, backoff=exponential)`,
  );

  return {
    close: async () => {
      await worker.close();
      await deployQueue?.close();
      deployQueue = null;
    },
  };
}
