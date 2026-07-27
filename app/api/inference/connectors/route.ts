/**
 * GET  /api/inference/connectors?collection_id=UUID   — list a KB's connectors
 * POST /api/inference/connectors                       — create a connector
 *
 * The dashboard-session twin of the API-key gateway routes
 * (workers/inference/src/routes/connectors.ts). Same table, same validation,
 * same credential masking — credentials are AES-GCM encrypted on write and
 * never returned (has_credential:true).
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§7, Slice C1).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { bytesToPostgresBytea, encryptAesGcm } from "@/lib/inference/crypto";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import {
  createConnectorSchema,
  toConnectorResponse,
  CONNECTOR_COLS,
  type ConnectorRow,
} from "@/lib/inference/connectors";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

// ── GET (list by collection) ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:inf-conn-list", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const collectionId = request.nextUrl.searchParams.get("collection_id");
  if (!collectionId || !isUuid(collectionId)) {
    return NextResponse.json({ error: "collection_id (uuid) query param required" }, { status: 400 });
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = service();
  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .select(CONNECTOR_COLS)
    .eq("collection_id", collectionId)
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false })
    .returns<ConnectorRow[]>();

  if (error) {
    console.error("[Inference Connectors] list error:", error);
    return NextResponse.json({ error: "Failed to list connectors" }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: (data ?? []).map(toConnectorResponse) });
}

// ── POST (create) ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:inf-conn-create", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = createConnectorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") return NextResponse.json({ error: "Viewers cannot create connectors" }, { status: 403 });

  const supabase = service();

  // Collection must belong to the caller's org.
  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id")
    .eq("id", d.collection_id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string }>();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  // Encrypt the S3 credential before it touches the DB. web_crawl has none.
  let credentialEnc: string | null = null;
  if (d.kind === "s3") {
    const dek = process.env.BYOK_DEK;
    if (!dek) return NextResponse.json({ error: "BYOK_DEK is not configured on the server" }, { status: 500 });
    try {
      credentialEnc = bytesToPostgresBytea(await encryptAesGcm(JSON.stringify(d.credential), dek));
    } catch {
      return NextResponse.json({ error: "Failed to encrypt credentials" }, { status: 500 });
    }
  }

  // Same treatment for the optional webhook signing secret (both source types).
  let webhookSecretEnc: string | null = null;
  if (d.webhook_secret) {
    const dek = process.env.BYOK_DEK;
    if (!dek) return NextResponse.json({ error: "BYOK_DEK is not configured on the server" }, { status: 500 });
    try {
      webhookSecretEnc = bytesToPostgresBytea(await encryptAesGcm(d.webhook_secret, dek));
    } catch {
      return NextResponse.json({ error: "Failed to encrypt webhook secret" }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .insert({
      org_id: org.org_id,
      collection_id: d.collection_id,
      kind: d.kind,
      display_name: d.display_name,
      config: d.config,
      credential_enc: credentialEnc,
      webhook_url: d.webhook_url ?? null,
      webhook_secret_enc: webhookSecretEnc,
      sync_schedule: d.sync_schedule,
      created_by: auth.user!.id,
    })
    .select(CONNECTOR_COLS)
    .single<ConnectorRow>();

  if (error || !data) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: `A connector named "${d.display_name}" already exists on this collection` }, { status: 409 });
    }
    console.error("[Inference Connectors] create error:", error);
    return NextResponse.json({ error: "Failed to create connector" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "connector.created",
    targetType: "connector",
    targetId: data.id,
    metadata: { kind: d.kind, display_name: d.display_name, collection_id: d.collection_id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data: toConnectorResponse(data) }, { status: 201 });
}
