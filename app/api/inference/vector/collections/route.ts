/**
 * GET  /api/inference/vector/collections — list collections in active org
 * POST /api/inference/vector/collections — create a new collection
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { billableActionRefusal, resolveControlPlaneAuth } from "@/lib/inference/api-key-auth";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { reserveProvision, settleProvision, releaseProvision } from "@/config/billing-flow";
import { getRatesForInferenceVector } from "@/config/pricing";
import { BillingCredits } from "@/lib/billing/credits";

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, digits, hyphens, underscores"),
  description: z.string().max(500).optional().nullable(),
  // Required only for bring-your-own-embeddings (no model). When a model is
  // chosen, the dimensions are derived from the model's catalog entry.
  dimensions: z.number().int().positive().max(4096).optional(),
  distance_metric: z.enum(["cosine", "l2", "inner_product"]).default("cosine"),
  // Optional: omit for a bring-your-own-embeddings collection (you always pass
  // pre-computed vectors; the server never auto-embeds). Set it to enable
  // server-side auto-embed with that catalog model.
  embedding_model_id: z.string().min(1).optional().nullable(),
  index_type: z.enum(["hnsw", "ivfflat", "none"]).default("hnsw"),
  index_params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export async function GET(request: NextRequest) {
  // Reads are open to any valid key — listing your own collections costs
  // nothing, so no billable-action refusal here.
  const resolved = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = await authenticateUserFromHeader(request);
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId, email) => {
      // Throws rather than returning null; uncaught it becomes a bare 500
      // with no JSON body. Swallow to null so the resolver answers normally.
      try {
        const o = await getOrBootstrapOrgForUser(userId, email);
        return { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug };
      } catch {
        return null;
      }
    }
  );
  if (!resolved.ok) return resolved.response;
  const auth = resolved.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-vec-list",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  // Org resolution (and its failure handling) now lives inside
  // resolveControlPlaneAuth, so by here it is settled either way.
  const org = { org_id: auth.orgId };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select(
      "id, name, description, dimensions, distance_metric, embedding_model_id, index_type, index_params, row_count, size_bytes, created_at, updated_at"
    )
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Inference Vector] list error:", error);
    return NextResponse.json({ error: "Failed to list collections" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    org: { id: auth.orgId, slug: auth.orgSlug, name: auth.orgName, role: auth.orgRole },
    data: data ?? [],
  });
}

export async function POST(request: NextRequest) {
  // Accepts an `ahu_` API key as well as a browser session. Creating a
  // collection starts a credit meter, and that billing code lives here in
  // Next — so rather than move it to the gateway, the door widens. See
  // lib/inference/api-key-auth.ts for why that is the safe direction.
  const resolved = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = await authenticateUserFromHeader(request);
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId, email) => {
      // Throws rather than returning null; uncaught it becomes a bare 500
      // with no JSON body. Swallow to null so the resolver answers normally.
      try {
        const o = await getOrBootstrapOrgForUser(userId, email);
        return { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug };
      } catch {
        return null;
      }
    }
  );
  if (!resolved.ok) return resolved.response;
  const auth = resolved.auth;

  // A public-tier or agent-scoped key must not start a meter — see
  // billableActionRefusal for the two distinct reasons.
  if (auth.apiKey) {
    const refusal = billableActionRefusal(auth.apiKey);
    if (refusal) return NextResponse.json({ error: refusal, code: "key_not_permitted" }, { status: 403 });
  }

  // Rate-limited by KEY id for an API caller, so one script cannot spend
  // another key's budget on the same org — and revoking the key drops its
  // history with it.
  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-vec-create",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create collections" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Resolve the collection's vector dimensions:
  //  - Auto-embed (model chosen): derive from the model's catalog entry, so the
  //    stored size always matches what the model produces (the caller doesn't
  //    need to know it, and an auto-embed size mismatch can't happen).
  //  - BYO (no model): the caller's vectors define the size, so it's required.
  let effectiveDimensions: number;
  if (parsed.data.embedding_model_id) {
    const { data: modelRow } = await supabase
      .schema("inference")
      .from("models")
      .select("modality, capabilities")
      .eq("model_id", parsed.data.embedding_model_id)
      .eq("is_active", true)
      .maybeSingle<{ modality: string; capabilities: { dimensions?: number } | null }>();

    if (!modelRow) {
      return NextResponse.json(
        {
          error: `Embedding model "${parsed.data.embedding_model_id}" not found in catalog. List embedding models with GET /api/inference/models?modality=embedding, omit it for a bring-your-own-embeddings collection, or pick a different model_id.`,
        },
        { status: 400 }
      );
    }
    if (modelRow.modality !== "embedding") {
      return NextResponse.json(
        {
          error: `"${parsed.data.embedding_model_id}" has modality "${modelRow.modality}" — must be "embedding".`,
        },
        { status: 400 }
      );
    }
    const modelDims = modelRow.capabilities?.dimensions;
    if (!modelDims) {
      return NextResponse.json(
        {
          error: `Embedding model "${parsed.data.embedding_model_id}" has no declared dimensions in the catalog. Pick another model or contact support.`,
        },
        { status: 400 }
      );
    }
    effectiveDimensions = modelDims;
  } else {
    if (!parsed.data.dimensions) {
      return NextResponse.json(
        {
          error:
            "`dimensions` is required for a bring-your-own-embeddings collection (omit it only when you choose an embedding model).",
        },
        { status: 400 }
      );
    }
    effectiveDimensions = parsed.data.dimensions;
  }

  // ── Billing: resolve org payer + starting-balance gate ────────────
  const { data: orgRow } = await supabase
    .schema("inference")
    .from("orgs")
    .select("billing_user_id, owner_user_id")
    .eq("id", org.org_id)
    .maybeSingle<{ billing_user_id: string | null; owner_user_id: string | null }>();
  // The org names its payer. `auth.userId` is the last-resort fallback and is
  // null for an API key — there is no human in that request — so a key on an org
  // with neither a billing nor an owner user is refused rather than billed to
  // nobody.
  const payerUserId = orgRow?.billing_user_id || orgRow?.owner_user_id || auth.userId;
  if (!payerUserId) {
    return NextResponse.json(
      { error: "This organisation has no billing owner, so a collection cannot be created against it." },
      { status: 409 }
    );
  }

  const vectorRates = await getRatesForInferenceVector();

  // Atomic reservation: debit (initialCost + 1h hold) before creating the
  // collection. Concurrent creates can no longer both pass a non-locking read.
  const reservationResult = await reserveProvision({
    userId: payerUserId,
    initialCost: vectorRates.initialCost,
    hourlyRate: vectorRates.hourlyRate,
  });
  const reservation = reservationResult.reservation;
  if (!reservationResult.ok) {
    return NextResponse.json(
      {
        error: `A managed vector collection costs $${(vectorRates.hourlyRate * 720).toFixed(2)}/month. Insufficient credits.`,
        code: "insufficient_credits",
      },
      { status: 402 }
    );
  }

  let settled = false;
  let createdCollectionId: string | null = null;
  try {
    const { data, error } = await supabase
      .schema("inference")
      .from("vector_collections")
      .insert({
        org_id: org.org_id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        dimensions: effectiveDimensions,
        distance_metric: parsed.data.distance_metric,
        embedding_model_id: parsed.data.embedding_model_id ?? null,
        index_type: parsed.data.index_type,
        index_params: parsed.data.index_params ?? { m: 16, ef_construction: 64 },
      })
      .select("id, name, dimensions, distance_metric, embedding_model_id, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A collection named "${parsed.data.name}" already exists in this org` },
          { status: 409 }
        );
      }
      console.error("[Inference Vector] create error:", error);
      return NextResponse.json({ error: "Failed to create collection" }, { status: 500 });
    }
    createdCollectionId = data.id;

    const ctx = auditContextFrom(request);
    void recordAudit({
      orgId: org.org_id,
      // Null for an API key. The audit row still records WHICH key acted, in
      // metadata below — "created by key ahu_live_xxxx" is more useful to an
      // operator than attributing it to whoever happened to mint that key.
      actorUserId: auth.userId,
      action: "collection.created",
      targetType: "vector_collection",
      targetId: data.id,
      metadata: {
        name: data.name,
        dimensions: data.dimensions,
        embedding_model_id: data.embedding_model_id,
        // How this was created, so the trail distinguishes a dashboard click
        // from a script — and names the key when it was a script.
        via: auth.via,
        api_key_id: auth.apiKey?.keyId ?? null,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Settle: register the meter. If this throws, the collection is live but
    // unmetered — releaseProvision in finally refunds the reservation and
    // we roll the collection back below.
    await settleProvision({
      reservation,
      initialCost: vectorRates.initialCost,
      hourlyRate: vectorRates.hourlyRate,
      serviceId: data.id,
      serviceType: "inference_vector",
      addActive: BillingCredits.addActiveVectorCollection,
    });
    settled = true;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } finally {
    if (!settled) {
      await releaseProvision(reservation);
      // Best-effort rollback only for a row created in this request. Do not
      // delete by name; duplicate-name failures would match an existing row.
      if (createdCollectionId) {
        await supabase.schema("inference").from("vector_collections")
          .delete().eq("id", createdCollectionId)
          .then(() => {}, () => {});
      }
    }
  }
}
