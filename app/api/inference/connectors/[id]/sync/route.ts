/**
 * POST /api/inference/connectors/[id]/sync — trigger a sync now.
 *
 * Flips an idle/error connector to 'queued' (+ next_sync_at=now()); the
 * data-runner claims it out of band. Already queued/syncing → idempotent no-op.
 * Dashboard-session twin of the gateway's POST /v1/connectors/:id/sync.
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§7, Slice C1).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { toConnectorResponse, CONNECTOR_COLS, type ConnectorRow } from "@/lib/inference/connectors";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid connector id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:inf-conn-sync", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") return NextResponse.json({ error: "Viewers cannot trigger a sync" }, { status: 403 });

  const supabase = service();

  // Only an idle/error connector can be queued — win the transition atomically.
  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .update({ status: "queued", next_sync_at: new Date().toISOString(), last_error: null })
    .eq("org_id", org.org_id)
    .eq("id", id)
    .in("status", ["idle", "error"])
    .select(CONNECTOR_COLS)
    .maybeSingle<ConnectorRow>();

  if (error) return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  if (data) return NextResponse.json({ success: true, data: toConnectorResponse(data) }, { status: 202 });

  // No row transitioned — either not found in this org, or already in flight.
  const { data: existing } = await supabase
    .schema("inference")
    .from("connectors")
    .select(CONNECTOR_COLS)
    .eq("org_id", org.org_id)
    .eq("id", id)
    .maybeSingle<ConnectorRow>();
  if (!existing) return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: toConnectorResponse(existing) }, { status: 202 });
}
