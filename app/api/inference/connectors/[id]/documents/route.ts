/**
 * GET /api/inference/connectors/[id]/documents?limit=&offset= — per-document
 * sync status (source_uri, status, chunk_count, error). Feeds the connector
 * detail drill-in. Dashboard-session twin of the gateway's
 * GET /v1/connectors/:id/documents.
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§7, Slice C1).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await controlPlaneAuth(request, { session: "header", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid connector id" }, { status: 400 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(request.nextUrl.searchParams.get("offset") ?? 0) || 0, 0);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: connector, error: connectorError } = await supabase
    .schema("inference")
    .from("connectors")
    .select("id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string }>();
  if (connectorError) return NextResponse.json({ error: "Failed to load connector" }, { status: 500 });
  if (!connector) return NextResponse.json({ error: "Connector not found" }, { status: 404 });

  const { data, error } = await supabase
    .schema("inference")
    .from("connector_documents")
    .select("id, source_uri, status, chunk_count, error, updated_at")
    .eq("connector_id", id)
    .eq("org_id", org.org_id)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: "Failed to list connector documents" }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
