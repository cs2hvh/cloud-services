/**
 * GET    /api/inference/connectors/[id]        — status + counters
 * PATCH  /api/inference/connectors/[id]        — edit config/schedule/credential/webhook
 * DELETE /api/inference/connectors/[id]?purge= — remove (purge=true also deletes its rows)
 *
 * Dashboard-session twin of workers/inference/src/routes/connectors.ts.
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
  updateConnectorSchema,
  validateConfigForKind,
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

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid connector id" }, { status: 400 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const { data, error } = await service()
    .schema("inference")
    .from("connectors")
    .select(CONNECTOR_COLS)
    .eq("org_id", org.org_id)
    .eq("id", id)
    .maybeSingle<ConnectorRow>();

  if (error) return NextResponse.json({ error: "Failed to load connector" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: toConnectorResponse(data) });
}

// ── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid connector id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:inf-conn-update", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = updateConnectorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") return NextResponse.json({ error: "Viewers cannot edit connectors" }, { status: 403 });

  // A config patch is validated against the connector's stored kind (kind is
  // immutable, so the row is the only place it lives).
  let existingKind: "s3" | "web_crawl" | undefined;
  if (d.config || d.credential) {
    const { data: existing } = await service()
      .schema("inference")
      .from("connectors")
      .select("kind")
      .eq("org_id", org.org_id)
      .eq("id", id)
      .maybeSingle<{ kind: "s3" | "web_crawl" }>();
    if (!existing) return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    existingKind = existing.kind;
  }

  let config: Record<string, unknown> | undefined;
  if (d.config) {
    const checked = validateConfigForKind(existingKind!, d.config);
    if (!checked.ok) return NextResponse.json({ error: checked.message }, { status: 400 });
    config = checked.config;
  }

  let credentialEnc: string | undefined;
  if (d.credential) {
    if (existingKind !== "s3") {
      return NextResponse.json({ error: "Only S3 connectors can store source credentials" }, { status: 400 });
    }
    const dek = process.env.BYOK_DEK;
    if (!dek) return NextResponse.json({ error: "BYOK_DEK is not configured on the server" }, { status: 500 });
    try {
      credentialEnc = bytesToPostgresBytea(await encryptAesGcm(JSON.stringify(d.credential), dek));
    } catch {
      return NextResponse.json({ error: "Failed to encrypt credentials" }, { status: 500 });
    }
  }

  // null = explicitly clear the secret (back to unsigned); undefined = keep.
  let webhookSecretEnc: string | null | undefined;
  if (d.webhook_secret === null) {
    webhookSecretEnc = null;
  } else if (d.webhook_secret) {
    const dek = process.env.BYOK_DEK;
    if (!dek) return NextResponse.json({ error: "BYOK_DEK is not configured on the server" }, { status: 500 });
    try {
      webhookSecretEnc = bytesToPostgresBytea(await encryptAesGcm(d.webhook_secret, dek));
    } catch {
      return NextResponse.json({ error: "Failed to encrypt webhook secret" }, { status: 500 });
    }
  }

  const patch: Record<string, unknown> = {
    display_name: d.display_name,
    config,
    sync_schedule: d.sync_schedule,
    credential_enc: credentialEnc,
    webhook_url: d.webhook_url,
    webhook_secret_enc: webhookSecretEnc,
  };
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];

  const { data, error } = await service()
    .schema("inference")
    .from("connectors")
    .update(patch)
    .eq("org_id", org.org_id)
    .eq("id", id)
    .select(CONNECTOR_COLS)
    .maybeSingle<ConnectorRow>();

  if (error) return NextResponse.json({ error: "Failed to update connector" }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Connector not found" }, { status: 404 });

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id, actorUserId: auth.user!.id, action: "connector.updated",
    targetType: "connector", targetId: id, metadata: { fields: Object.keys(d) },
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
  return NextResponse.json({ success: true, data: toConnectorResponse(data) });
}

// ── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid connector id" }, { status: 400 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") return NextResponse.json({ error: "Viewers cannot delete connectors" }, { status: 403 });

  const purge = request.nextUrl.searchParams.get("purge") === "true";
  const supabase = service();

  const { data: conn } = await supabase
    .schema("inference")
    .from("connectors")
    .select("id, collection_id, status")
    .eq("org_id", org.org_id)
    .eq("id", id)
    .maybeSingle<{ id: string; collection_id: string; status: string }>();
  if (!conn) return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  // Deleting mid-sync orphans rows: the ledger cascades away, but vector_rows
  // has no FK to connectors, so anything the running sync writes AFTER the
  // purge survives as conn-{dead-id}-* rows nothing can ever clean up.
  if (conn.status === "syncing") {
    return NextResponse.json(
      { error: "This connector is syncing right now — wait for it to finish, then delete it." },
      { status: 409 }
    );
  }

  if (purge) {
    // Prefix-delete every vector_row this connector produced (external_id =
    // "conn-{connectorId}-...") in ONE query — scales to any doc count, unlike
    // an IN-list of thousands of external_ids which would overflow the URL.
    // Best-effort: a failure still lets the connector be deleted below.
    await supabase
      .schema("inference")
      .from("vector_rows")
      .delete()
      .eq("collection_id", conn.collection_id)
      .like("external_id", `conn-${id}-%`);
  }

  const { error } = await supabase.schema("inference").from("connectors").delete().eq("org_id", org.org_id).eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to delete connector" }, { status: 500 });

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id, actorUserId: auth.user!.id, action: "connector.deleted",
    targetType: "connector", targetId: id, metadata: { purged: purge },
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
  return NextResponse.json({ success: true, deleted: true, purged: purge });
}
