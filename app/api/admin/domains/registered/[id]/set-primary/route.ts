import { NextResponse } from "next/server";
import { z } from "zod";
import { getDomainService } from "@/lib/domain-service";
import { createServiceClient } from "@/lib/supabase/server";
import { createAdminDomainActor, requireDomainAdmin, resolveUserEmail } from "../../../_lib/admin-domain-utils";

const BodySchema = z.object({
  redirect_to_primary: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireDomainAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createServiceClient();
  const { data: domain, error: fetchErr } = await supabase
    .from("platform_app_domains")
    .select("id, domain, user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  try {
    const updated = await getDomainService().setPrimaryDomain({
      actor: createAdminDomainActor(req, domain.user_id, await resolveUserEmail(domain.user_id)),
      domainId: id,
      redirectToPrimary: parsed.data.redirect_to_primary,
      idempotencyKey: `admin-set-primary-${id}-${Date.now()}`,
    });

    return NextResponse.json({
      data: updated,
      message: `${domain.domain} is now primary`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Set primary failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
