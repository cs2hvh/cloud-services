/**
 * POST /api/inference/fine-tuning/jobs/[id]/heartbeat
 *
 * Receives liveness pings from the training container's heartbeat.py
 * every 30s. We store the latest heartbeat in Upstash Redis with a 90s
 * TTL — the ft-runner's stall detector checks for absence (key missing)
 * to decide whether to mark a pod dead.
 *
 * HMAC-verified the same way as the completion webhook. Same secret.
 *
 * Returns 200 quickly (<10ms typical) — must NOT block the training
 * container or its 30s cadence drifts.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { Redis } from "@upstash/redis";

const WEBHOOK_SECRET = process.env.FT_WEBHOOK_SECRET ?? "";

// Reuse the Upstash Redis we already provisioned for rate limits / SPEND
// counters. Single connection shared across requests; new Redis() pulls
// REST URL + token from env automatically.
const redis = (() => {
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
})();

interface HeartbeatPayload {
  job_id: string;
  uptime_seconds: number;
  global_step?: number;
  epoch?: number;
  max_steps?: number;
  loss?: number;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

function verifySignature(body: string, providedB64: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("base64");
  const a = Buffer.from(providedB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Heartbeat receiver not configured" },
      { status: 500 }
    );
  }
  if (!redis) {
    return NextResponse.json(
      { error: "Redis not configured — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN" },
      { status: 500 }
    );
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const sig = request.headers.get("x-ahura-webhook-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const body = await request.text();
  if (!verifySignature(body, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: HeartbeatPayload;
  try {
    payload = JSON.parse(body) as HeartbeatPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.job_id !== id) {
    return NextResponse.json({ error: "job_id mismatch" }, { status: 400 });
  }

  // Store with 90s TTL — ft-runner's stall detector treats missing key as dead
  const key = `ft-heartbeat:${id}`;
  await redis.set(
    key,
    {
      received_at: Date.now(),
      uptime_seconds: payload.uptime_seconds,
      global_step: payload.global_step ?? null,
      epoch: payload.epoch ?? null,
      max_steps: payload.max_steps ?? null,
      loss: payload.loss ?? null,
    },
    { ex: 90 }
  );

  return NextResponse.json({ ok: true });
}
