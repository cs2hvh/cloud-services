import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createDomainBillingAdapter } from "@/lib/domain-service/integrations/billing.adapter";
import { logAdminDomainAction, requireDomainAdmin } from "../../../_lib/admin-domain-utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireDomainAdmin();
  if (!adminCheck.ok) return adminCheck.response;
  const { admin } = adminCheck;

  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: purchase, error: fetchErr } = await supabase
    .from("domain_purchase_requests")
    .select("id, domain, status, purchase_price, currency, user_id, app_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  const cancelable = ["requested", "processing"];
  if (!cancelable.includes(purchase.status)) {
    return NextResponse.json(
      { error: `Cannot cancel purchase in status: ${purchase.status}` },
      { status: 400 }
    );
  }

  const { error: updateErr } = await supabase
    .from("domain_purchase_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  let refunded = false;
  let refundError: string | null = null;
  const price = Number(purchase.purchase_price ?? 0);
  if (price > 0) {
    try {
      await createDomainBillingAdapter().refundDomainPurchase({
        userId: purchase.user_id,
        purchaseRequestId: purchase.id,
        domain: purchase.domain,
        amount: price,
        currency: purchase.currency || "USD",
        reason: "Cancelled by admin",
      });
      refunded = true;
    } catch (e) {
      refundError = e instanceof Error ? e.message : "Refund failed";
      console.error("[admin/domains/purchases/cancel] Refund failed:", e);
      await supabase
        .from("domain_purchase_requests")
        .update({
          last_error: `Cancelled by admin but refund failed: ${refundError}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
  }

  await logAdminDomainAction({
    admin,
    req,
    action: "update",
    serviceId: purchase.id,
    serviceName: purchase.domain,
    metadata: {
      event: "domain_purchase_cancelled_by_admin",
      target_user_id: purchase.user_id,
      app_id: purchase.app_id,
      previous_status: purchase.status,
      refunded,
      amount: price,
      currency: purchase.currency || "USD",
    },
  });

  if (refundError) {
    return NextResponse.json(
      { error: `Purchase cancelled, but refund failed: ${refundError}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: refunded
      ? `Purchase cancelled and $${price.toFixed(2)} refunded`
      : "Purchase cancelled",
  });
}
