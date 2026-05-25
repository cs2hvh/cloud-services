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
import { createClient } from "@supabase/supabase-js";

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

  // Also persist live progress to Postgres so the dashboard can render
  // "step 142/300 · epoch 1.42 · loss 0.85" without hitting Upstash on
  // every page load. Fire-and-forget — heartbeat liveness is the Upstash
  // path's job; PG write is purely for UX. A failed PG write does not
  // 500 the heartbeat (would make the stall detector kill healthy pods).
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    void supabase
      .schema("inference")
      .from("finetunes")
      .update({
        current_step: payload.global_step ?? null,
        max_steps: payload.max_steps ?? null,
        current_epoch: payload.epoch ?? null,
        latest_loss: payload.loss ?? null,
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.warn("[Heartbeat] PG update failed:", error.message);
      });
  }

  return NextResponse.json({ ok: true });
}
