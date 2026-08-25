/**
 * POST /api/inference/batches/[id]/cancel
 *
 * Flips status from in_progress/validating → cancelling. The processor
 * polls status between requests and stops cleanly when it sees this,
 * writing whatever partial output it has and flipping to cancelled.
 *
 * For terminal-state batches (completed/failed/expired/cancelled) this
 * returns 409. Cancelling a batch already in cancelling is a no-op (200).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { serializeBatch, type BatchRow, type BatchStatus } from "@/lib/inference/batches";

function isBatchId(s: string): boolean {
  return /^batch_[a-z0-9]+$/i.test(s);
}

const CANCELLABLE: BatchStatus[] = ["validating", "in_progress", "finalizing"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id } = await params;
  if (!isBatchId(id)) return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-batch-cancel",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot cancel batches" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: existing } = await supabase
    .schema("inference")
    .from("batches")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<BatchRow>();

  if (!existing) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  // Already cancelled or cancelling — return current state, idempotent.
  if (existing.status === "cancelling" || existing.status === "cancelled") {
    return NextResponse.json(serializeBatch(existing));
  }

  if (!CANCELLABLE.includes(existing.status)) {
    return NextResponse.json(
      { error: `Cannot cancel batch in terminal status "${existing.status}"` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { data: updatedRaw, error } = await supabase
    .schema("inference")
    .from("batches")
    .update({ status: "cancelling", cancelling_at: now })
    .eq("id", id)
    .eq("org_id", org.org_id)
    .select("*")
    .single();
  const updated = updatedRaw as unknown as BatchRow | null;

  if (error || !updated) {
    console.error("[Inference Batches] cancel error:", error);
    return NextResponse.json({ error: "Failed to cancel batch" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "batch.cancelled",
    targetType: "batch",
    targetId: id,
    metadata: { prior_status: existing.status },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json(serializeBatch(updated));
}
