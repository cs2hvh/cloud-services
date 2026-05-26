import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import {
  Diagnostics,
  type DiagnosticCheck,
} from "@/components/dashboard/inference/diagnostics";

export const dynamic = "force-dynamic";
// Fresh check on every load — no caching. Operators are here BECAUSE
// something is wrong; serving stale data would defeat the point.
export const revalidate = 0;

const INFERENCE_API_BASE =
  process.env.NEXT_PUBLIC_INFERENCE_API_BASE ?? "https://api.cs2hvh.com/v1";

const REQUIRED_SCHEMA_COLUMNS: Array<{ table: string; col: string }> = [
  // Phase 11.A
  { table: "models", col: "serving_url" },
  { table: "models", col: "is_managed" },
  { table: "finetunes", col: "is_managed" },
  // Phase 11.B
  { table: "finetunes", col: "serving_pod_id" },
  { table: "finetunes", col: "serving_pod_state" },
  // Phase 7.D
  { table: "files", col: "id" },
  { table: "batches", col: "id" },
];

const REQUIRED_NEXTJS_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ENDPOINT",
  "OPENROUTER_PLATFORM_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "FT_WEBHOOK_SECRET",
  "BATCH_PROCESSOR_TOKEN",
] as const;

// ─── Individual checks (each returns a DiagnosticCheck) ───────────

async function checkEnvVars(): Promise<DiagnosticCheck> {
  const missing = REQUIRED_NEXTJS_ENV.filter((k) => !process.env[k]);
  if (missing.length === 0) {
    return {
      id: "env",
      name: "Required environment variables",
      status: "pass",
      detail: `All ${REQUIRED_NEXTJS_ENV.length} variables set.`,
    };
  }
  return {
    id: "env",
    name: "Required environment variables",
    status: "fail",
    detail: `Missing: ${missing.join(", ")}`,
    remediation: `Add the missing variables to c:\\cloud-services\\.env and restart Next.js. Pull from kubectl secret for shared values: kubectl -n ahura get secret ahura-ft-runner-secrets -o jsonpath='{.data.<KEY>}' | base64 -d`,
  };
}

async function checkSupabase(): Promise<DiagnosticCheck> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    // Ping by counting one row from any inference table that's been
    // there since Phase 0 — orgs is the earliest table.
    const { error } = await supabase.schema("inference").from("orgs").select("id", { count: "exact", head: true }).limit(1);
    if (error) {
      return {
        id: "supabase",
        name: "Supabase reachable",
        status: "fail",
        detail: error.message,
        remediation: "Check NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Verify the inference schema is exposed in Project Settings → API → Exposed schemas.",
      };
    }
    return { id: "supabase", name: "Supabase reachable", status: "pass", detail: "inference schema is queryable." };
  } catch (err) {
    return {
      id: "supabase",
      name: "Supabase reachable",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkSchemaColumns(): Promise<DiagnosticCheck> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    // Single query against information_schema covers all our migrations'
    // additive columns. Reports any that haven't landed.
    const { data, error } = await supabase
      .schema("information_schema")
      .from("columns")
      .select("table_name, column_name")
      .eq("table_schema", "inference")
      .in("table_name", Array.from(new Set(REQUIRED_SCHEMA_COLUMNS.map((c) => c.table))));
    if (error) {
      return {
        id: "schema",
        name: "Schema migrations applied",
        status: "warn",
        detail: `Could not introspect: ${error.message}`,
      };
    }
    const present = new Set((data ?? []).map((r) => `${r.table_name}.${r.column_name}`));
    const missing = REQUIRED_SCHEMA_COLUMNS
      .map((c) => `${c.table}.${c.col}`)
      .filter((k) => !present.has(k));
    if (missing.length > 0) {
      return {
        id: "schema",
        name: "Schema migrations applied",
        status: "fail",
        detail: `Missing columns: ${missing.join(", ")}`,
        remediation: "Apply pending migrations: see supabase/migrations/2026* — likely 20260526000005 (Phase 11.B serving-pod columns) or 20260526000003 (batch endpoint GRANTs).",
      };
    }
    return {
      id: "schema",
      name: "Schema migrations applied",
      status: "pass",
      detail: `All ${REQUIRED_SCHEMA_COLUMNS.length} expected columns present.`,
    };
  } catch (err) {
    return {
      id: "schema",
      name: "Schema migrations applied",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkR2(): Promise<DiagnosticCheck> {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    return {
      id: "r2",
      name: "R2 object storage",
      status: "fail",
      detail: "Credentials missing in env.",
    };
  }
  try {
    const s3 = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
    // HeadBucket on the two known buckets — fails fast if creds are bad
    // or the bucket doesn't exist.
    await s3.send(new HeadBucketCommand({ Bucket: "ahura-ft-adapters" }));
    await s3.send(new HeadBucketCommand({ Bucket: "ahura-batches" }));
    return {
      id: "r2",
      name: "R2 object storage",
      status: "pass",
      detail: "Both required buckets reachable: ahura-ft-adapters, ahura-batches.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let hint = "";
    if (/NoSuchBucket|NotFound/i.test(msg)) {
      hint = "Create the missing bucket in your Cloudflare R2 dashboard (same account as ahura-ft-adapters). Bucket name must be ahura-batches.";
    } else if (/SignatureDoesNotMatch|InvalidAccessKeyId/i.test(msg)) {
      hint = "R2 credentials are wrong. Pull fresh values from kubectl get secret ahura-ft-runner-secrets.";
    } else if (/Invalid URL/i.test(msg)) {
      hint = "R2_ENDPOINT contains a placeholder. Replace <account-id> with your actual Cloudflare R2 account id.";
    }
    return { id: "r2", name: "R2 object storage", status: "fail", detail: msg.slice(0, 200), remediation: hint || undefined };
  }
}

async function checkUpstash(): Promise<DiagnosticCheck> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return { id: "upstash", name: "Upstash Redis (Next.js side)", status: "fail", detail: "Credentials missing in env." };
  }
  try {
    const redis = new Redis({ url, token });
    const k = `diag:ping:${Date.now()}`;
    await redis.set(k, "ok", { ex: 5 });
    const v = await redis.get(k);
    if (v !== "ok") {
      return {
        id: "upstash",
        name: "Upstash Redis (Next.js side)",
        status: "fail",
        detail: `Round-trip set/get returned ${JSON.stringify(v)} instead of "ok".`,
      };
    }
    return {
      id: "upstash",
      name: "Upstash Redis (Next.js side)",
      status: "pass",
      detail: `Round-trip OK. Database: ${new URL(url).hostname}`,
    };
  } catch (err) {
    return {
      id: "upstash",
      name: "Upstash Redis (Next.js side)",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
      remediation: "Check UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. Verify on console.upstash.com that the database isn't deleted/expired.",
    };
  }
}

/**
 * Critical for FT reliability. If the LKE runner is configured with a
 * DIFFERENT Upstash database than the Next.js receiver, heartbeats
 * from training pods land in one DB and the runner polls the other —
 * every job over 16 min gets falsely killed. We can't reach the
 * runner's env from here, but we CAN write a sentinel key from Next.js
 * and ask the user to confirm it via kubectl.
 */
async function checkUpstashCrossSide(): Promise<DiagnosticCheck> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    return { id: "upstash_crossside", name: "Upstash same on both sides", status: "fail", detail: "Cannot probe; Upstash env missing." };
  }
  const nextHost = new URL(url).hostname;
  return {
    id: "upstash_crossside",
    name: "Upstash same on both sides",
    status: "warn",
    detail: `Next.js writes to ${nextHost}. The LKE ft-runner reads from whatever its own env points at — they MUST match.`,
    remediation: `Verify manually: kubectl -n ahura exec deploy/ahura-ft-runner -- printenv UPSTASH_REDIS_REST_URL — the hostname must match "${nextHost}". If not, kubectl -n ahura patch secret ahura-ft-runner-secrets --type merge --patch '{"stringData":{"UPSTASH_REDIS_REST_URL":"${url}"}}' then rollout restart.`,
  };
}

async function checkGateway(): Promise<DiagnosticCheck> {
  const startedAt = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${INFERENCE_API_BASE}/health`, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    const latencyMs = Date.now() - startedAt;
    if (!r.ok) {
      return {
        id: "gateway",
        name: "Inference gateway",
        status: "fail",
        detail: `${INFERENCE_API_BASE}/health returned ${r.status}`,
        remediation: "Re-deploy the worker: cd workers/inference && npx wrangler deploy",
      };
    }
    return {
      id: "gateway",
      name: "Inference gateway",
      status: "pass",
      detail: `${INFERENCE_API_BASE}/health 200 in ${latencyMs}ms`,
    };
  } catch (err) {
    return {
      id: "gateway",
      name: "Inference gateway",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
      remediation: `${INFERENCE_API_BASE} not reachable. Check the Worker route in Cloudflare or re-deploy with wrangler deploy.`,
    };
  }
}

async function checkOpenRouterKey(): Promise<DiagnosticCheck> {
  const key = process.env.OPENROUTER_PLATFORM_KEY;
  if (!key) {
    return {
      id: "openrouter",
      name: "Upstream model provider key",
      status: "fail",
      detail: "OPENROUTER_PLATFORM_KEY missing from Next.js env — batch processor + managed-serving warmup will 401.",
    };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      return {
        id: "openrouter",
        name: "Upstream model provider key",
        status: "fail",
        detail: `Upstream auth returned ${r.status}`,
        remediation: "OPENROUTER_PLATFORM_KEY is invalid or revoked. Generate a fresh one at openrouter.ai/keys.",
      };
    }
    return { id: "openrouter", name: "Upstream model provider key", status: "pass", detail: "Auth probe returned 200." };
  } catch (err) {
    return {
      id: "openrouter",
      name: "Upstream model provider key",
      status: "warn",
      detail: `Could not reach upstream: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Page ─────────────────────────────────────────────────────────

export default async function DiagnosticsPage() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");
  // Only org admins / owners see this — these checks expose infra
  // detail that's not appropriate for regular members.
  const canView = org.role === "owner" || org.role === "admin";

  const checks = canView
    ? await Promise.all([
        checkEnvVars(),
        checkSupabase(),
        checkSchemaColumns(),
        checkR2(),
        checkUpstash(),
        checkUpstashCrossSide(),
        checkGateway(),
        checkOpenRouterKey(),
      ])
    : [];

  return (
    <Diagnostics
      checks={checks}
      canView={canView}
      orgName={org.org_name}
      fetchedAt={new Date().toISOString()}
    />
  );
}
