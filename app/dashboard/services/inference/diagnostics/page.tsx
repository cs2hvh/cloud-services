import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { isPlatformOperator } from "@/lib/inference/operators";
import {
  Diagnostics,
  type DiagnosticCheck,
} from "@/components/dashboard/inference/diagnostics";
import {
  ServiceHealth,
  type ServiceHealthCategory,
  type ServiceHealthStatus,
} from "@/components/dashboard/inference/service-health";

export const dynamic = "force-dynamic";
// Fresh check on every load — no caching. Operators are here BECAUSE
// something is wrong; serving stale data would defeat the point.
export const revalidate = 0;

const INFERENCE_API_BASE =
  process.env.NEXT_PUBLIC_INFERENCE_API_BASE ?? "https://api.ahurasense.com/v1";

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
  "WOKEY_PLATFORM_KEY",
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

async function checkUpstreamKey(): Promise<DiagnosticCheck> {
  const key = process.env.WOKEY_PLATFORM_KEY;
  if (!key) {
    return {
      id: "upstream",
      name: "Upstream model provider key",
      status: "fail",
      detail: "WOKEY_PLATFORM_KEY missing from Next.js env — batch processor + managed-serving warmup will 401.",
    };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    // Wokey exposes no /auth/key introspection endpoint the way OpenRouter
    // did, so the cheapest authenticated probe is the model list. A 200 here
    // proves the credential is live and the base URL is reachable.
    const base = process.env.WOKEY_BASE_URL ?? "https://api.wokey.ai/v1";
    const r = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      return {
        id: "upstream",
        name: "Upstream model provider key",
        status: "fail",
        detail: `Upstream auth returned ${r.status}`,
        remediation: "WOKEY_PLATFORM_KEY is invalid or revoked. Generate a fresh one in the Wokey console.",
      };
    }
    return { id: "upstream", name: "Upstream model provider key", status: "pass", detail: "Model-list probe returned 200." };
  } catch (err) {
    return {
      id: "upstream",
      name: "Upstream model provider key",
      status: "warn",
      detail: `Could not reach upstream: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Customer-facing roll-up ──────────────────────────────────────
//
// Maps the internal infra checks (which name upstream providers and
// internal mechanics) onto vendor-neutral customer categories. The
// detailed view stays gated behind isPlatformOperator(); everyone else
// sees this.

interface CategorySpec {
  id: string;
  label: string;
  /** Internal check ids that roll up into this category. Worst status
   *  of any contributing check becomes the category status. */
  checkIds: string[];
  copy: Record<ServiceHealthStatus, string>;
}

const CUSTOMER_CATEGORIES: CategorySpec[] = [
  {
    id: "control_plane",
    label: "Control plane",
    checkIds: ["env", "supabase", "schema"],
    copy: {
      operational:
        "Dashboard, API, and metadata stores are responding normally.",
      degraded:
        "Some control-plane operations may be slower than usual. Authentication and reads are unaffected.",
      down:
        "Control-plane operations (creating keys, saving settings) are currently disrupted. Inference traffic in flight is unaffected.",
    },
  },
  {
    id: "object_storage",
    label: "Object storage",
    checkIds: ["r2"],
    copy: {
      operational: "Uploads + downloads for adapters, batches, and files are healthy.",
      degraded: "Storage operations may be slower or intermittent.",
      down: "Adapter uploads, batch file uploads, and downloads are currently unavailable.",
    },
  },
  {
    id: "real_time_state",
    label: "Real-time state",
    checkIds: ["upstash", "upstash_crossside"],
    copy: {
      operational: "Rate limits, spend counters, and live progress are tracking normally.",
      degraded:
        "Live progress + spend may be reporting with a delay. Limits and caps are still enforced.",
      down:
        "Live progress and spend tracking are temporarily unavailable. Inference requests are still served and billed.",
    },
  },
  {
    id: "inference_gateway",
    label: "Inference gateway",
    checkIds: ["gateway", "upstream"],
    copy: {
      operational:
        "All inference endpoints are routing normally to the model catalog.",
      degraded:
        "Some models may have elevated latency or intermittent errors. Retry with exponential backoff.",
      down: "Inference endpoints are currently disrupted. We're actively investigating.",
    },
  },
];

function rollupForCustomer(checks: DiagnosticCheck[]): ServiceHealthCategory[] {
  const byId = new Map(checks.map((c) => [c.id, c]));

  return CUSTOMER_CATEGORIES.map((cat): ServiceHealthCategory => {
    const contributing = cat.checkIds
      .map((id) => byId.get(id))
      .filter((c): c is DiagnosticCheck => Boolean(c));

    let status: ServiceHealthStatus = "operational";
    for (const c of contributing) {
      if (c.status === "fail") {
        status = "down";
        break;
      }
      if (c.status === "warn" && status === "operational") {
        status = "degraded";
      }
    }

    return {
      id: cat.id,
      label: cat.label,
      status,
      summary: cat.copy[status],
    };
  });
}

// ─── Page ─────────────────────────────────────────────────────────

export default async function DiagnosticsPage() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");

  // Three audiences:
  //   1. Platform operators (AhuraCloud staff, allowlisted by email):
  //      see the detailed infra view with real provider names + remediation.
  //   2. Customer admins/owners: see the vendor-neutral health rollup.
  //   3. Regular members: restricted message.
  const isOperator = isPlatformOperator(user.email);
  const canViewHealth = org.role === "owner" || org.role === "admin";

  if (!canViewHealth) {
    // Reuse the existing Diagnostics restricted-mode message — it's
    // already worded for this case (canView=false branch).
    return (
      <Diagnostics
        checks={[]}
        canView={false}
        orgName={org.org_name}
        fetchedAt={new Date().toISOString()}
      />
    );
  }

  const checks = await Promise.all([
    checkEnvVars(),
    checkSupabase(),
    checkSchemaColumns(),
    checkR2(),
    checkUpstash(),
    checkUpstashCrossSide(),
    checkGateway(),
    checkUpstreamKey(),
  ]);
  const fetchedAt = new Date().toISOString();

  if (isOperator) {
    return (
      <Diagnostics
        checks={checks}
        canView={true}
        orgName={org.org_name}
        fetchedAt={fetchedAt}
      />
    );
  }

  return (
    <ServiceHealth
      categories={rollupForCustomer(checks)}
      orgName={org.org_name}
      fetchedAt={fetchedAt}
    />
  );
}
