/**
 * GET  /api/inference/vector/collections — list collections in active org
 * POST /api/inference/vector/collections — create a new collection
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { BillingCredits } from "@/lib/billing/credits";

// Managed vector collection pricing: flat $8/month, billed hourly by the credit
// cron (hourly_rate = monthly / 720). See migration 20260614000005.
const VECTOR_COLLECTION_MONTHLY_USD = 8;
const VECTOR_COLLECTION_HOURLY_USD = VECTOR_COLLECTION_MONTHLY_USD / 720;
// Small starting-balance floor so $0 accounts can't spin up collections; the
// cron's 7-day grace handles running low afterward.
const MIN_VECTOR_BALANCE_USD = 1;

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, digits, hyphens, underscores"),
  description: z.string().max(500).optional().nullable(),
  dimensions: z.number().int().positive().max(4096),
  distance_metric: z.enum(["cosine", "l2", "inner_product"]).default("cosine"),
  // Optional: omit for a bring-your-own-embeddings collection (you always pass
  // pre-computed vectors; the server never auto-embeds). Set it to enable
  // server-side auto-embed with that catalog model.
  embedding_model_id: z.string().min(1).optional().nullable(),
  index_type: z.enum(["hnsw", "ivfflat", "none"]).default("hnsw"),
  index_params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-vec-list",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    console.error("[Inference Vector] org resolution failed:", err);
    return NextResponse.json(
      {
        error: customerSafeErrorMessage(
          err instanceof Error ? err.message : "Org resolution failed"
        ) || "Org resolution failed",
      },
      { status: 500 }
    );
  }

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
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name, role: org.role },
    data: data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
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

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    console.error("[Inference Vector] org resolution failed:", err);
    return NextResponse.json(
      {
        error: customerSafeErrorMessage(
          err instanceof Error ? err.message : "Org resolution failed"
        ) || "Org resolution failed",
      },
      { status: 500 }
    );
  }
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create collections" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Auto-embed collections must reference a real embedding model. A null model
  // is a bring-your-own-embeddings collection — skip the catalog check.
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
  }

  // ── Billing: resolve org payer + starting-balance gate ────────────
  const { data: orgRow } = await supabase
    .schema("inference")
    .from("orgs")
    .select("billing_user_id, owner_user_id")
    .eq("id", org.org_id)
    .maybeSingle<{ billing_user_id: string | null; owner_user_id: string | null }>();
  const payerUserId = orgRow?.billing_user_id || orgRow?.owner_user_id || auth.user!.id;

  const bal = await ensureBalance(payerUserId, MIN_VECTOR_BALANCE_USD);
  if (!bal.ok) {
    return NextResponse.json(
      {
        error: `A managed vector collection is $${VECTOR_COLLECTION_MONTHLY_USD}/month. Add at least $${MIN_VECTOR_BALANCE_USD} in credits to create one.`,
        code: "insufficient_credits",
      },
      { status: 402 }
    );
  }

  const { data, error } = await supabase
    .schema("inference")
    .from("vector_collections")
    .insert({
      org_id: org.org_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      dimensions: parsed.data.dimensions,
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

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "collection.created",
    targetType: "vector_collection",
    targetId: data.id,
    metadata: {
      name: data.name,
      dimensions: data.dimensions,
      embedding_model_id: data.embedding_model_id,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Register in the metered billing flow ($8/mo, billed hourly by the cron).
  // If billing registration fails, roll the collection back so we never run an
  // unmetered (free) collection.
  try {
    await postProvisionBilling({
      userId: payerUserId,
      initialCost: 0,
      hourlyRate: VECTOR_COLLECTION_HOURLY_USD,
      serviceId: data.id,
      serviceType: "inference_vector",
      addActive: BillingCredits.addActiveVectorCollection,
    });
  } catch (billingErr) {
    console.error("[Inference Vector] billing wire-up failed, rolling back collection:", billingErr);
    await supabase.schema("inference").from("vector_collections").delete().eq("id", data.id);
    return NextResponse.json(
      { error: "Could not set up billing for the collection. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
