/**
 * Generic Postgres → BullMQ bridge.
 *
 * Owns the polling machinery (timer, single-flight tick, graceful drain) and
 * the enqueue semantics shared by every runner: deterministic jobId for
 * natural dedup across restarts, attempts:1 (lifecycles own their own retry),
 * and standard retention. Each runner supplies a `scan()` that queries its own
 * table(s) and returns the jobs to enqueue — that's the only thing that differs.
 *
 * Why poll instead of LISTEN/NOTIFY? Supabase REST doesn't expose LISTEN, and
 * polling self-heals from any missed notification (e.g. runner down at insert).
 */
import type { JobsOptions, Queue } from "bullmq";
import type { Logger } from "./logger.js";

/**
 * Minimal job shape passed to each runner's handler. Covers only what lifecycle
 * functions actually use (data + optional id) so the handler type doesn't pull
 * in BullMQ's full Job class and create duplicate-package type conflicts.
 */
export interface RunnerJob<T> {
  id?: string;
  data: T;
}

/** One job the claimer should enqueue. */
export interface EnqueueRequest<T> {
  /** BullMQ job name. */
  name: string;
  /** Deterministic id — dedupes across restarts (BullMQ rejects duplicates). */
  jobId: string;
  data: T;
}

export interface ClaimerOptions<T> {
  queue: Queue<T, unknown, string>;
  logger: Logger;
  intervalMs: number;
  /** Query Postgres for queued work and return the jobs to enqueue. */
  scan: () => Promise<EnqueueRequest<T>[]>;
  /** Called after each successful scan tick (empty or not) — use to update health state. */
  onTickSuccess?: () => void;
}

export class Claimer<T> {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(private readonly opts: ClaimerOptions<T>) {}

  start(): void {
    if (this.timer) return;
    this.opts.logger.info({ intervalMs: this.opts.intervalMs }, "claimer started");
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Wait briefly for an in-flight tick to drain.
    let waited = 0;
    while (this.running && waited < 5_000) {
      await sleep(50);
      waited += 50;
    }
    this.opts.logger.info("claimer stopped");
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const jobs = await this.opts.scan();
      for (const job of jobs) await this.enqueue(job);
      this.opts.onTickSuccess?.();
    } catch (err) {
      this.opts.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "claimer tick failed"
      );
    } finally {
      this.running = false;
    }
  }

  private async enqueue(req: EnqueueRequest<T>): Promise<void> {
    // BullMQ derives the job-name type from the data generic; with a bare T it
    // can't prove `name` is a plain string, so add() is typed locally here.
    const add = this.opts.queue.add.bind(this.opts.queue) as (
      name: string,
      data: T,
      opts: JobsOptions
    ) => Promise<unknown>;
    try {
      await add(req.name, req.data, {
        jobId: req.jobId, // deterministic — dedupes across restarts
        attempts: 1, // lifecycle handles all retry logic itself
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 86_400 * 7, count: 1_000 },
      });
    } catch (err) {
      // BullMQ throws on duplicate jobId — expected and fine.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("already exists")) {
        this.opts.logger.warn({ err: msg, jobId: req.jobId }, "enqueue failed");
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
