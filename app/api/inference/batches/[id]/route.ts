/**
 * GET    /api/inference/batches/[id]    — single batch (OpenAI shape)
 * DELETE /api/inference/batches/[id]    — soft remove (only allowed when
 *                                          status is terminal). For
 *                                          in-flight cancels, use the
 *                                          /cancel sub-route.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { serializeBatch, type BatchRow, type BatchStatus } from "@/lib/inference/batches";

function isBatchId(s: string): boolean {
  return /^batch_[a-z0-9]+$/i.test(s);
}

const TERMINAL: BatchStatus[] = ["failed", "completed", "expired", "cancelled"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isBatchId(id)) return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("batches")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<BatchRow>();

  if (!data) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  return NextResponse.json(serializeBatch(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isBatchId(id)) return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json({ error: "Only owners/admins can delete batches" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: existing } = await supabase
    .schema("inference")
    .from("batches")
    .select("id, status")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; status: BatchStatus }>();

  if (!existing) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (!TERMINAL.includes(existing.status)) {
    return NextResponse.json(
      {
        error: `Cannot delete batch in status "${existing.status}". Cancel it first via POST /api/inference/batches/${id}/cancel.`,
      },
      { status: 409 }
    );
  }

  await supabase
    .schema("inference")
    .from("batches")
    .delete()
    .eq("id", id)
    .eq("org_id", org.org_id);

  return NextResponse.json({ id, object: "batch", deleted: true });
}
