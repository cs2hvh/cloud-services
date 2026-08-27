/**
 * GET    /api/v2/projects/{ref}/env — which variables are set (NEVER the values)
 * PUT    /api/v2/projects/{ref}/env — set or replace variables
 * DELETE /api/v2/projects/{ref}/env?key=NAME — remove one
 *
 * VALUES ARE WRITE-ONLY. The GET returns names, whether a variable is public,
 * and when it changed — never plaintext, never ciphertext, not even a masked
 * prefix. A dashboard that can show a secret is a dashboard that leaks every
 * secret the moment a session is stolen or a screenshot is shared, and "reveal"
 * buttons are how that becomes routine. Rotating is cheap; unleaking is not.
 *
 * ENCRYPTION IS BOUND TO (project, key), not merely stored beside it — moving a
 * row to another project or renaming its key makes it undecryptable rather than
 * silently readable in the wrong context. So the project ref is resolved under
 * RLS FIRST, and the ref the caller sees is the ref the ciphertext is bound to.
 *
 * PUBLIC VARIABLES ARE A DIFFERENT THING and are marked as such. A
 * NEXT_PUBLIC_-prefixed value is baked into a JavaScript bundle at build time
 * and is readable by anyone who loads the page. Storing it encrypted would imply
 * a secrecy the deployment cannot honour, so the flag records the truth rather
 * than the wish.
 */

import { createClient } from "@/lib/supabase/server";
import { encryptEnvValue, bytesToPgHex } from "@/lib/paas/secrets";
import { json, unauthenticated, notFound, invalid, apiError } from "../../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ ref: string }> };

const PROJECT_REF = /^prj-[0-9a-f]{12}$/;
/** POSIX-ish env name. Rejected rather than sanitised: a silently renamed variable is not set. */
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

async function project(supabase: Awaited<ReturnType<typeof createClient>>, ref: string) {
  return supabase
    .schema("paas")
    .from("projects")
    .select("id,ref,deleted_at")
    .eq("ref", ref)
    .maybeSingle();
}

async function requireProject(ref: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: unauthenticated() as Response };
  if (!PROJECT_REF.test(ref)) return { error: notFound("Project") as Response };

  const p = await project(supabase, ref);
  if (p.error) {
    console.error("[v2/env] project read failed:", JSON.stringify(p.error));
    return { error: apiError("internal", "Could not read the project.", 500) as Response };
  }
  if (!p.data || p.data.deleted_at) return { error: notFound("Project") as Response };
  return { supabase, project: p.data };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { ref } = await ctx.params;
  const r = await requireProject(ref);
  if ("error" in r) return r.error;

  const { data, error } = await r.supabase
    .schema("paas")
    .from("env_vars")
    .select("key,is_public,environment_id,updated_at")
    .eq("project_id", r.project.id)
    .order("key");

  if (error) {
    console.error("[v2/env GET] read failed:", JSON.stringify(error));
    return apiError("internal", "Could not read environment variables.", 500);
  }

  return json({
    // No values. See the header.
    vars: (data ?? []).map((v) => ({
      key: v.key,
      isPublic: v.is_public,
      scope: v.environment_id ? "environment" : "all",
      updatedAt: v.updated_at,
    })),
  });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { ref } = await ctx.params;
  const r = await requireProject(ref);
  if ("error" in r) return r.error;

  let body: { vars?: unknown };
  try {
    body = (await req.json()) as { vars?: unknown };
  } catch {
    return invalid("Body is not JSON.");
  }

  const entries = body?.vars;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return invalid('Expected {"vars": {"NAME": "value", ...}}.');
  }

  const pairs = Object.entries(entries as Record<string, unknown>);
  if (!pairs.length) return invalid("No variables given.");
  if (pairs.length > 100) return invalid("Too many variables in one request (max 100).");

  const rows: Array<Record<string, unknown>> = [];
  for (const [key, value] of pairs) {
    if (!ENV_KEY.test(key)) {
      return invalid(`"${key}" is not a valid variable name.`, { key: "shape" });
    }
    if (typeof value !== "string") {
      return invalid(`Value for "${key}" must be a string.`, { [key]: "type" });
    }
    if (value.length > 32_768) {
      return invalid(`Value for "${key}" is too large.`, { [key]: "size" });
    }

    let enc;
    try {
      // Bound to THIS project's ref — the one RLS just proved the caller owns.
      enc = encryptEnvValue(r.project.ref, key, value);
    } catch (e) {
      // A missing master key must not become an unencrypted write. Refusing
      // loudly is the only safe answer; storing plaintext "for now" is how a
      // secret store stops being one.
      console.error("[v2/env PUT] encryption failed:", (e as Error).message);
      return apiError("internal", "Secret storage is not configured. Nothing has been saved.", 500);
    }

    rows.push({
      project_id: r.project.id,
      environment_id: null,
      key,
      value_ct: bytesToPgHex(enc.valueCt),
      dek_id: enc.dekId,
      is_public: key.startsWith("NEXT_PUBLIC_") || key.startsWith("PUBLIC_"),
    });
  }

  const { error } = await r.supabase
    .schema("paas")
    .from("env_vars")
    .upsert(rows, { onConflict: "project_id,environment_id,key" });

  if (error) {
    console.error("[v2/env PUT] write failed:", JSON.stringify(error));
    return apiError("internal", "Could not save environment variables.", 500);
  }

  return json({
    saved: rows.map((x) => x.key),
    // Stated because it is not obvious and it is the usual surprise: a running
    // pod keeps the environment it started with.
    note: "Saved. Redeploy for these to take effect.",
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { ref } = await ctx.params;
  const r = await requireProject(ref);
  if ("error" in r) return r.error;

  const key = new URL(req.url).searchParams.get("key");
  if (!key || !ENV_KEY.test(key)) return invalid("Give a valid ?key= to delete.");

  const { error } = await r.supabase
    .schema("paas")
    .from("env_vars")
    .delete()
    .eq("project_id", r.project.id)
    .eq("key", key);

  if (error) {
    console.error("[v2/env DELETE] failed:", JSON.stringify(error));
    return apiError("internal", "Could not delete that variable.", 500);
  }

  // Deliberately not 404 when the key was absent: DELETE is idempotent, and
  // reporting "not found" would let a caller probe which names exist.
  return json({ deleted: key, note: "Redeploy for this to take effect." });
}
