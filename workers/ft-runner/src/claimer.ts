/**
 * Postgres → BullMQ bridge.
 *
 * Polls inference.finetunes WHERE status='queued' every claimPollIntervalMs
 * and adds each row to the BullMQ queue with deterministic jobId = finetune.id.
 *
 * Why deterministic? BullMQ rejects duplicate jobIds — so if we crash mid-add
 * and restart, we'll naturally skip the rows already enqueued without needing
 * a separate "enqueued_at" column.
 *
 * Why not LISTEN/NOTIFY? Two reasons:
 *   1. Supabase REST doesn't expose LISTEN
 *   2. Polling at 5s lets us self-heal from missed notifications
 *      (e.g. if the runner was down when the row was inserted)
 *
 * Why not use the BullMQ-attached worker to do the claim? Because we need a
 * single bottleneck for queue ingestion — if two replicas both poll the DB
 * and try to add the same job at the same instant, BullMQ's duplicate-jobId
 * rejection handles it cheaply. If we let workers race a SELECT-FOR-UPDATE
 * we'd need a real lock manager.
 */
import type { Queue } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "./env.js";
import type { Logger } from "./logger.js";
import type { JobPayload } from "./lifecycle.js";

const PAGE_SIZE = 50;

export class Claimer {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(
    private readonly env: RunnerEnv,
    private readonly supabase: SupabaseClient,
    private readonly queue: Queue<JobPayload>,
    private readonly logger: Logger
  ) {}

  start(): void {
    if (this.timer) return;
    this.logger.info(
      { intervalMs: this.env.claimPollIntervalMs },
      "claimer started"
    );
    // Kick off immediately, then schedule
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.env.claimPollIntervalMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Wait briefly for an in-flight tick to drain
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
      const { data, error } = await this.supabase
        .schema("inference")
        .from("finetunes")
        .select("id, created_at")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(PAGE_SIZE);

      if (error) {
        this.logger.warn({ err: error.message }, "claimer poll failed");
        return;
      }
      if (!data || data.length === 0) return;

      this.logger.info({ count: data.length }, "queued jobs found");

      for (const row of data) {
        try {
          await this.queue.add(
            "ft-job",
            { jobId: row.id },
            {
              jobId: row.id, // deterministic — dedupes across restarts
              attempts: 1, // lifecycle handles all retry logic itself
              removeOnComplete: { age: 86_400, count: 1_000 },
              removeOnFail: { age: 86_400 * 7, count: 1_000 },
            }
          );
        } catch (err) {
          // BullMQ throws on duplicate jobId — that's expected and fine
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.toLowerCase().includes("already exists")) {
            this.logger.warn({ err: msg, finetuneId: row.id }, "enqueue failed");
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
