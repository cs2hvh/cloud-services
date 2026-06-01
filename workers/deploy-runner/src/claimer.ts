/**
 * Postgres → BullMQ bridge for deployments.
 *
 * Scans inference.deployments for rows that need work and enqueues them
 * with deterministic jobIds for natural dedup:
 *   status='building'  → enqueue create
 *   status='paused' + runpod_endpoint_id NOT NULL → enqueue delete
 *
 * 'scale' is enqueued by the API directly when the user updates autoscale —
 * no claimer path. (If the API enqueue fails, the user re-saves; we don't
 * want stale autoscale jobs floating around.)
 */
import type { Queue } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "./env.js";
import type { Logger } from "./logger.js";
import type { DeployJobPayload } from "./lifecycle.js";

const PAGE_SIZE = 50;

export class Claimer {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(
    private readonly env: RunnerEnv,
    private readonly supabase: SupabaseClient,
    private readonly queue: Queue<DeployJobPayload>,
    private readonly logger: Logger
  ) {}

  start(): void {
    if (this.timer) return;
    this.logger.info({ intervalMs: this.env.claimPollIntervalMs }, "claimer started");
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.env.claimPollIntervalMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    let waited = 0;
    while (this.running && waited < 5_000) {
      await sleep(50);
      waited += 50;
    }
    this.logger.info("claimer stopped");
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      await this.scanBuilding();
      await this.scanPaused();
    } finally {
      this.running = false;
    }
  }

  private async scanBuilding(): Promise<void> {
    const { data, error } = await this.supabase
      .schema("inference")
      .from("deployments")
      .select("id")
      .eq("status", "building")
      .order("created_at", { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      this.logger.warn({ err: error.message }, "scanBuilding poll failed");
      return;
    }
    if (!data || data.length === 0) return;

    for (const row of data) {
      await this.enqueue(row.id, "create");
    }
  }

  private async scanPaused(): Promise<void> {
    const { data, error } = await this.supabase
      .schema("inference")
      .from("deployments")
      .select("id")
      .eq("status", "paused")
      .not("runpod_endpoint_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      this.logger.warn({ err: error.message }, "scanPaused poll failed");
      return;
    }
    if (!data || data.length === 0) return;

    for (const row of data) {
      await this.enqueue(row.id, "delete");
    }
  }

  private async enqueue(deploymentId: string, action: "create" | "delete"): Promise<void> {
    try {
      await this.queue.add(
        "deploy-job",
        { deploymentId, action },
        {
          jobId: `${deploymentId}:${action}`,
          attempts: 1,
          removeOnComplete: { age: 86_400, count: 1_000 },
          removeOnFail: { age: 86_400 * 7, count: 1_000 },
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("already exists")) {
        this.logger.warn({ err: msg, deploymentId, action }, "enqueue failed");
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
