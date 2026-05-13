import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
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
  const { data: domain, error: fetchErr } = await supabase
    .from("platform_app_domains")
    .select("id, domain, status, user_id, app_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  if (!["pending", "failed"].includes(domain.status)) {
    return NextResponse.json(
      { error: `Domain is already in status: ${domain.status}` },
      { status: 400 }
    );
  }

  const { error: updateErr } = await supabase
    .from("platform_app_domains")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await logAdminDomainAction({
    admin,
    req,
    action: "update",
    serviceId: id,
    serviceName: domain.domain,
    metadata: {
      event: "domain_force_verified_by_admin",
      target_user_id: domain.user_id,
      app_id: domain.app_id,
      previous_status: domain.status,
    },
  });

  return NextResponse.json({
    data: { id, domain: domain.domain, status: "verified" },
    message: `Domain ${domain.domain} force-verified by admin. User can now activate it.`,
  });
}
