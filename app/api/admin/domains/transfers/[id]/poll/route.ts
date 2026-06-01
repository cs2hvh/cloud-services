import { NextResponse } from "next/server";
import { getDomainTransferService } from "@/lib/domain-service/transfer";
import { createServiceClient } from "@/lib/supabase/server";
import { createAdminDomainActor, requireDomainAdmin, resolveUserEmail } from "../../../_lib/admin-domain-utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireDomainAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  const { id } = await params;
  const supabase = await createServiceClient();
  const { data: transfer, error: fetchErr } = await supabase
    .from("domain_transfer_requests")
    .select("id, domain, user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !transfer) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  try {
    const updated = await getDomainTransferService().pollTransferRequest({
      actor: createAdminDomainActor(req, transfer.user_id, await resolveUserEmail(transfer.user_id)),
      requestId: transfer.id,
    });

    return NextResponse.json({
      data: updated,
      message: `Transfer for ${transfer.domain} synced from registrar`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transfer poll failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
