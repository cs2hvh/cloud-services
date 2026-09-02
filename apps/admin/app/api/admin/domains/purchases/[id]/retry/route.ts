import { NextResponse } from "next/server";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { createServiceClient } from "@/lib/supabase/server";
import { createAdminDomainActor, logAdminDomainAction, requireDomainAdmin, resolveUserEmail } from "../../../_lib/admin-domain-utils";

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
    .select("id, domain, status, user_id, app_id, metadata")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  if (purchase.status !== "failed") {
    return NextResponse.json(
      { error: `Only failed purchases can be retried. Current status: ${purchase.status}` },
      { status: 400 }
    );
  }

  try {
    const metadata = (purchase.metadata ?? {}) as Record<string, unknown>;
    const ownerEmail = await resolveUserEmail(purchase.user_id);
    const retry = await getDomainMarketplaceService().createPurchaseRequest({
      actor: createAdminDomainActor(req, purchase.user_id, ownerEmail),
      appId: purchase.app_id ?? undefined,
      domain: purchase.domain,
      idempotencyKey: `admin-retry-${purchase.id}-${Date.now()}`,
      metadata: {
        retry_of_purchase_request_id: purchase.id,
        retried_by_admin_id: admin.userId,
      },
      registrantContact: metadata.registrant_contact as
        | {
            firstName?: string;
            lastName?: string;
            email?: string;
            phone?: string;
            companyName?: string;
            address1?: string;
            city?: string;
            state?: string;
            zip?: string;
            country?: string;
          }
        | undefined,
    });

    await logAdminDomainAction({
      admin,
      req,
      action: "create",
      serviceId: retry.id,
      serviceName: retry.domain,
      metadata: {
        event: "domain_purchase_retried_by_admin",
        target_user_id: purchase.user_id,
        original_purchase_request_id: purchase.id,
        retry_purchase_request_id: retry.id,
      },
    });

    return NextResponse.json({
      data: retry,
      message: `Purchase for ${purchase.domain} retried as request ${retry.id}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Retry failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
