import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getDomainTransferService } from "@/lib/domain-service/transfer";
import { createAdminDomainActor, requireDomainAdmin, resolveUserEmail } from "../../../_lib/admin-domain-utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireDomainAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  const { id } = await params;

  // Fetch transfer directly to get user_id (service client bypasses RLS)
  const supabase = await createServiceClient();
  const { data: transfer, error: fetchErr } = await supabase
    .from("domain_transfer_requests")
    .select("id, domain, status, user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !transfer) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const active = ["initiated", "pending", "approved"];
  if (!active.includes(transfer.status)) {
    return NextResponse.json(
      { error: `Cannot cancel transfer in status: ${transfer.status}` },
      { status: 400 }
    );
  }

  try {
    // Pass the transfer's own user_id as actor so the repo findByIdForUser check passes.
    // userRole: "admin" ensures audit log records this as an admin action.
    const service = getDomainTransferService();
    await service.cancelTransferRequest({
      actor: createAdminDomainActor(req, transfer.user_id, await resolveUserEmail(transfer.user_id)),
      requestId: transfer.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cancel failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    message: `Transfer for ${transfer.domain} cancelled — refund issued if applicable`,
  });
}
