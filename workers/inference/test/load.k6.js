// AhuraCloud Inference — k6 load test
//
// Validates the edge gateway under sustained load. Tests the auth + rate-limit
// + spend-cap + KV/Postgres lookup paths WITHOUT proxying real OpenRouter calls
// (those cost money — at 500 RPS for 4 min we'd burn ~$50-$150 just on
// upstream). The proxy path is validated separately with a small smoke scenario.
//
// Target: sustain 500 RPS with p95 < 400ms for authenticated requests,
//         p95 < 150ms for the unauthenticated health endpoint, error rate < 1%.
//
// ── Install k6 ─────────────────────────────────────────────────────────
//   Windows:  winget install GrafanaLabs.k6   (or: scoop install k6)
//   macOS:    brew install k6
//   Linux:    https://k6.io/docs/get-started/installation/
//
// ── Run ────────────────────────────────────────────────────────────────
//   $env:AHURA_API_KEY = "ahu_live_..."
//   k6 run workers/inference/test/load.k6.js
//
//   # Target a different deployment
//   $env:BASE_URL = "https://api.cs2hvh.com/v1"
//   k6 run workers/inference/test/load.k6.js
//
//   # Run only a single scenario (e.g. just the health scenario)
//   k6 run --scenario health_throughput workers/inference/test/load.k6.js
//
// ── Interpret ──────────────────────────────────────────────────────────
//   ✓ thresholds met            → ready for public beta at this scale
//   ✗ http_req_duration p95     → edge tier or Postgres lookup slow
//   ✗ http_req_failed rate>1%   → rate-limiter or upstream issues
//   ✗ checks failing            → auth/spend/route logic regression

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE = __ENV.BASE_URL || "https://api.cs2hvh.com/v1";
const KEY = __ENV.AHURA_API_KEY;

// Custom metrics for cleaner reports
const authLatency = new Trend("ahura_auth_latency", true);
const catalogLatency = new Trend("ahura_catalog_latency", true);
const rateLimitedRate = new Rate("ahura_rate_limited");
const spendBlockedRate = new Rate("ahura_spend_blocked");

export const options = {
  discardResponseBodies: true,
  scenarios: {
    // 1. Raw edge throughput — unauthenticated /v1/health
    //    Validates CF Worker isolate cold-starts + global routing.
    health_throughput: {
      executor: "ramping-arrival-rate",
      startRate: 50,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { duration: "30s", target: 250 },
        { duration: "30s", target: 500 },
        { duration: "2m", target: 500 },
        { duration: "30s", target: 0 },
      ],
      exec: "health",
    },

    // 2. Authenticated path — /v1/key (sha256 hash → KV → Postgres fallback)
    //    Capped at 8 RPS to stay UNDER the per-key 10 RPS default rate limit
    //    (workers/inference/src/middleware/rate-limit.ts DEFAULT_RPS=10).
    //    If you provision a load-test key with higher caps in the future,
    //    bump these numbers and re-baseline.
    auth_path: {
      executor: "constant-arrival-rate",
      rate: 8,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 20,
      maxVUs: 50,
      startTime: "30s",
      exec: "keyInfo",
    },

    // 3. Catalog read — /v1/models (auth + Postgres SELECT with RLS filter)
    //    Same per-key rate-limit constraint applies. 5 RPS leaves headroom
    //    for the auth_path scenario running concurrently on the same key
    //    (token bucket is shared per key).
    catalog: {
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 15,
      maxVUs: 30,
      startTime: "1m",
      exec: "models",
    },
  },

  thresholds: {
    "http_req_failed": ["rate<0.01"],
    "http_req_duration{endpoint:health}": ["p(95)<150"],
    "http_req_duration{endpoint:key}": ["p(95)<400"],
    "http_req_duration{endpoint:models}": ["p(95)<600"],
    // Rate-limited metric is informational only. With per-key 10 RPS limit and
    // concurrent auth (8 RPS) + catalog (5 RPS) overlap, we expect ~10-15% of
    // auth/catalog requests to be correctly throttled during the overlap window.
    // Set to <30% to flag a real RL misbehavior, not normal overlap throttling.
    "ahura_rate_limited": ["rate<0.30"],
    "ahura_spend_blocked": ["rate<0.01"], // shouldn't hit spend cap at all
  },
};

// ─── Scenarios ───────────────────────────────────────────────────────

export function health() {
  const r = http.get(`${BASE}/health`, {
    tags: { endpoint: "health" },
  });
  check(r, {
    "health 200": (res) => res.status === 200,
  });
}

export function keyInfo() {
  if (!KEY) {
    throw new Error("Set AHURA_API_KEY env var to run the auth scenarios");
  }
  const r = http.get(`${BASE}/key`, {
    headers: { Authorization: `Bearer ${KEY}` },
    tags: { endpoint: "key" },
  });
  authLatency.add(r.timings.duration);
  rateLimitedRate.add(r.status === 429);
  spendBlockedRate.add(r.status === 402);
  check(r, {
    "key 200 or 429 (RL)": (res) => res.status === 200 || res.status === 429,
  });
}

export function models() {
  if (!KEY) {
    throw new Error("Set AHURA_API_KEY env var to run the catalog scenario");
  }
  const r = http.get(`${BASE}/models`, {
    headers: { Authorization: `Bearer ${KEY}` },
    tags: { endpoint: "models" },
  });
  catalogLatency.add(r.timings.duration);
  rateLimitedRate.add(r.status === 429);
  check(r, {
    "models 200 or 429": (res) => res.status === 200 || res.status === 429,
  });
}

// ─── Summary handler — terse human-friendly output ───────────────────

export function handleSummary(data) {
  const lines = [];
  const m = data.metrics;
  const fmt = (n) => (n == null ? "—" : `${Math.round(n)} ms`);
  const pct = (n) => (n == null ? "—" : `${(n * 100).toFixed(2)}%`);

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("  AhuraCloud Inference — Load Test Summary");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`  Base URL:           ${BASE}`);
  lines.push(`  Total requests:     ${m.http_reqs?.values?.count ?? 0}`);
  lines.push(`  Failed:             ${pct(m.http_req_failed?.values?.rate ?? 0)}`);
  lines.push("");
  lines.push("  Latency by endpoint (p95):");
  lines.push(`    /v1/health:       ${fmt(m["http_req_duration{endpoint:health}"]?.values?.["p(95)"])}`);
  lines.push(`    /v1/key:          ${fmt(m["http_req_duration{endpoint:key}"]?.values?.["p(95)"])}`);
  lines.push(`    /v1/models:       ${fmt(m["http_req_duration{endpoint:models}"]?.values?.["p(95)"])}`);
  lines.push("");
  lines.push("  Edge behavior:");
  lines.push(`    Rate-limited:     ${pct(m.ahura_rate_limited?.values?.rate ?? 0)}`);
  lines.push(`    Spend-blocked:    ${pct(m.ahura_spend_blocked?.values?.rate ?? 0)}`);
  lines.push("");

  // Threshold pass/fail roll-up
  const thresholdsPassed = Object.values(data.metrics)
    .flatMap((m) => Object.values(m.thresholds ?? {}))
    .every((t) => t.ok);
  lines.push(`  Thresholds:         ${thresholdsPassed ? "✓ all passed" : "✗ some failed"}`);
  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");

  return {
    stdout: lines.join("\n"),
    "load-result.json": JSON.stringify(data, null, 2),
  };
}
