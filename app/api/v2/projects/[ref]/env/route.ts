/**
 * /api/v2/projects/[ref]/env — environment variables.
 *
 * GET returns KEYS AND METADATA ONLY. It never returns a value, and there is
 * no query parameter that makes it. v1's public API returned every decrypted
 * value in one unaudited response, which bypassed the controls its own
 * dashboard enforced; the fix is that this surface has no code path capable of
 * decryption.
 *
 * Reading a value requires an audited RPC that does not exist yet — the
 * decrypt path is in the infrastructure lane. Until it lands, values are
 * write-only from here, which is the correct default anyway: a dashboard needs
 * to SET secrets far more often than it needs to show them.
 *
 * Writes encrypt here, in the route, so the master key never leaves the
 * server — and the INSERT still goes through the RLS client, so RLS remains
 * the authorization boundary. lib/paas/secrets deliberately exports no
 * decrypt path for this lane: values reach containers via the reconciler and
 * never come back through the API.
 */

import { isPublicEnvKey } from "@/lib/paas/build/dockerfile.ts";
import { encryptEnvValue, bytesToPgHex } from "@/lib/paas/secrets.ts";
import { getCaller } from "../../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  conflict,
  fromPostgrestError,
  apiError,
} from "../../../_lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

/** POSIX-ish env name. Rejecting early keeps junk out of a build arg. */
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

async function resolveProject(
  caller: NonNullable<Awaited<ReturnType<typeof getCaller>>>,
  ref: string
) {
  const { data } = await caller.db
    .from("projects")
    .select("id, ref, name")
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();
  return (data ?? null) as { id: string; ref: string; name: string } | null;
}

export async function GET(_request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  const project = await resolveProject(caller, ref);
  if (!project) return notFound("Project");

  // value_ct is deliberately absent from this select. Adding it would put
  // ciphertext on the wire for no reason and invite a future decrypt-on-read.
  const { data, error } = await caller.db
    .from("env_vars")
    .select("key, is_public, created_at, updated_at, environments:environment_id (ref, kind)")
    .eq("project_id", project.id)
    .order("key", { ascending: true });

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/env] list failed:", error);
    return apiError("internal", "Could not load environment variables.", 500);
  }

  const rows = data as Array<{
    key: string;
    is_public: boolean;
    created_at: string;
    updated_at: string;
    environments: { ref: string; kind: string } | null;
  }>;

  return json({
    project: { ref: project.ref, name: project.name },
    variables: rows.map((row) => ({
      key: row.key,
      /** Public keys are baked into the build; the rest are runtime-only. */
      isPublic: row.is_public,
      scope: row.environments
        ? { ref: row.environments.ref, kind: row.environments.kind }
        : { ref: null, kind: "all" },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      /** Constant, not a flag — no request can change it. */
      valueVisible: false,
    })),
    note:
      "Values are never returned by this endpoint. Reading one requires an " +
      "audited lookup, which is not available yet.",
  });
}

interface PutBody {
  key?: unknown;
  value?: unknown;
  environment?: unknown;
}

export async function PUT(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return invalid("Request body must be JSON.");
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!ENV_KEY.test(key)) {
    return invalid(
      "Key must start with a letter or underscore and contain only letters, numbers and underscores.",
      { key: "malformed" }
    );
  }
  if (typeof body.value !== "string") {
    return invalid("A string value is required.", { value: "required" });
  }

  const project = await resolveProject(caller, ref);
  if (!project) return notFound("Project");

  // isPublicEnvKey is the single source of truth for which prefixes become
  // build args. Re-deriving the prefix list here is how the UI and the builder
  // end up disagreeing about whether a value is baked into an image.
  const isPublic = isPublicEnvKey(key);

  // Encrypt before the write. projectRef and key are bound into the key
  // derivation and the AAD, so a row copied to another project or renamed onto
  // a public-prefixed key becomes undecryptable rather than quietly readable
  // in the wrong context.
  let valueCt: string;
  let dekId: string;
  try {
    const enc = encryptEnvValue(project.ref, key, body.value);
    valueCt = bytesToPgHex(enc.valueCt);
    dekId = enc.dekId;
  } catch (err) {
    // Most likely a missing master key. Never fall back to storing plaintext
    // in a column named ciphertext.
    console.error("[v2/env] encryption failed:", err);
    return apiError(
      "internal",
      "Could not encrypt the value. Nothing was written.",
      500
    );
  }

  // Not an upsert. paas.env_vars' unique index is an EXPRESSION index —
  // (project_id, COALESCE(environment_id, '000...'), key) — and PostgREST's
  // onConflict only accepts plain column names, so it cannot name this
  // constraint. Update-then-insert is the honest way to express it.
  const stamp = new Date().toISOString();
  const { data: updated, error: updateError } = await caller.db
    .from("env_vars")
    .update({
      value_ct: valueCt,
      dek_id: dekId,
      is_public: isPublic,
      updated_at: stamp,
    })
    .eq("project_id", project.id)
    .eq("key", key)
    .is("environment_id", null)
    .select("key")
    .maybeSingle();

  if (updateError) {
    const mapped = fromPostgrestError(updateError);
    if (mapped) return mapped;
    console.error("[v2/env] update failed:", updateError);
    return apiError("internal", "Could not save the variable.", 500);
  }

  if (!updated) {
    const { error: insertError } = await caller.db.from("env_vars").insert({
      project_id: project.id,
      environment_id: null,
      key,
      value_ct: valueCt,
      dek_id: dekId,
      is_public: isPublic,
    });

    if (insertError) {
      // Two concurrent first-writes of the same key: the expression index
      // rejects the loser. Report it rather than silently discarding a value
      // the user believes they saved.
      if (insertError.code === "23505") {
        return conflict(
          `"${key}" was created by another request at the same time. Try again.`
        );
      }
      const mapped = fromPostgrestError(insertError);
      if (mapped) return mapped;
      console.error("[v2/env] insert failed:", insertError);
      return apiError("internal", "Could not save the variable.", 500);
    }
  }

  return json({
    key,
    isPublic,
    status: "saved_restarting",
    // Kubernetes reads envFrom once at container start, so a Secret change is
    // invisible to a running pod. The reconciler rolls the pods via a content
    // hash on the template. Saying "saved" alone would imply it already took
    // effect, which it has not.
    note: isPublic
      ? "Saved. This is a build argument, so it applies on the next deployment, not to running pods."
      : "Saved. Pods restart to pick up the new value, so it takes effect in a few seconds.",
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !ENV_KEY.test(key)) {
    return invalid("A valid `key` is required.", { key: "required" });
  }

  const project = await resolveProject(caller, ref);
  if (!project) return notFound("Project");

  // Delete is safe to implement fully: it needs no encryption, and RLS scopes
  // it to the caller's project.
  const { data, error } = await caller.db
    .from("env_vars")
    .delete()
    .eq("project_id", project.id)
    .eq("key", key)
    .select("key")
    .maybeSingle();

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/env] delete failed:", error);
    return apiError("internal", "Could not delete the variable.", 500);
  }
  if (!data) return notFound("Variable");

  return json({
    key: (data as { key: string }).key,
    status: "deleted",
    note: "Running deployments keep the old value until they are redeployed.",
  });
}
