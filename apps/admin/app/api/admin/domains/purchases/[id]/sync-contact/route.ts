import { NextResponse } from "next/server";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminDomainAction, requireDomainAdmin } from "../../../_lib/admin-domain-utils";

type RegistrantContact = {
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
};

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
    .select("id, domain, status, user_id, metadata")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  if (purchase.status !== "completed") {
    return NextResponse.json({ error: "Only completed purchases can sync registrant contact" }, { status: 400 });
  }

  const { data: userResult } = await supabase.auth.admin.getUserById(purchase.user_id);
  const user = userResult?.user;
  const metadata = (purchase.metadata ?? {}) as Record<string, unknown>;
  const savedContact = metadata.registrant_contact as RegistrantContact | undefined;
  const email = savedContact?.email || user?.email;

  if (!email) {
    return NextResponse.json({ error: "No registrant email available for this user" }, { status: 400 });
  }

  const fullName = String(user?.user_metadata?.name || "").trim();
  const [first, ...rest] = fullName.split(" ").filter(Boolean);

  try {
    await new NameComRegistrarAdapter().setRegistrantContact(purchase.domain, {
      email,
      firstName: savedContact?.firstName || first || undefined,
      lastName: savedContact?.lastName || rest.join(" ") || undefined,
      phone: savedContact?.phone,
      companyName: savedContact?.companyName,
      address1: savedContact?.address1,
      city: savedContact?.city,
      state: savedContact?.state,
      zip: savedContact?.zip,
      country: savedContact?.country,
    });

    const { error: updateErr } = await supabase
      .from("domain_purchase_requests")
      .update({ registrant_email: email, updated_at: new Date().toISOString() })
      .eq("id", purchase.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    await logAdminDomainAction({
      admin,
      req,
      action: "update",
      serviceId: purchase.id,
      serviceName: purchase.domain,
      metadata: {
        event: "domain_registrant_contact_synced_by_admin",
        target_user_id: purchase.user_id,
        registrant_email: email,
      },
    });

    return NextResponse.json({
      message: `Registrant contact synced for ${purchase.domain}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Registrant contact sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
