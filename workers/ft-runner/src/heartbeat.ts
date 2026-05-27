/**
 * Heartbeat reader. The training container POSTs to
 * /api/inference/fine-tuning/jobs/[id]/heartbeat every 30s; that route stores
 * the latest snapshot in Upstash Redis under `ft-heartbeat:<jobId>` with a
 * 90s TTL.
 *
 * Here we just read the key. Absence = stalled. The lifecycle.ts uses this
 * to decide when to inspect pod status + force termination.
 */
import { Redis } from "@upstash/redis";
import type { RunnerEnv } from "./env.js";

export interface HeartbeatSnapshot {
  received_at: number;
  uptime_seconds: number;
  global_step: number | null;
  epoch: number | null;
  max_steps: number | null;
  loss: number | null;
}

export class HeartbeatStore {
  private readonly redis: Redis;

  constructor(env: RunnerEnv) {
    this.redis = new Redis({
      url: env.upstashRedisUrl,
      token: env.upstashRedisToken,
    });
  }

  async read(jobId: string): Promise<HeartbeatSnapshot | null> {
    const key = `ft-heartbeat:${jobId}`;
    const raw = await this.redis.get<HeartbeatSnapshot | null>(key);
    return raw ?? null;
  }

  /** True if no heartbeat at all or the latest one is older than `staleMs`. */
  async isStale(jobId: string, staleMs: number): Promise<boolean> {
    const snap = await this.read(jobId);
    if (!snap) return true;
    return Date.now() - snap.received_at > staleMs;
  }
}
