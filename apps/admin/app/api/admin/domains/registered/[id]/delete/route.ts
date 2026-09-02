import { NextResponse } from "next/server";
import { getDomainService } from "@/lib/domain-service";
import { createServiceClient } from "@/lib/supabase/server";
import { createAdminDomainActor, requireDomainAdmin, resolveUserEmail } from "../../../_lib/admin-domain-utils";

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
    .select("id, domain, status, user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  if (domain.status === "removed") {
    return NextResponse.json({ error: "Domain is already removed" }, { status: 400 });
  }

  try {
    await getDomainService().removeDomain({
      actor: createAdminDomainActor(req, domain.user_id, await resolveUserEmail(domain.user_id)),
      domainId: id,
      idempotencyKey: `admin-remove-${id}-${Date.now()}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Remove failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    message: `${domain.domain} removed by ${admin.email}`,
  });
}
