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

  if (!["verified", "pending", "failed"].includes(domain.status)) {
    return NextResponse.json(
      { error: `Domain cannot be activated from status: ${domain.status}` },
      { status: 400 }
    );
  }

  try {
    const { data: app, error: appErr } = await supabase
      .from("platform_apps")
      .select("id, status")
      .eq("id", domain.app_id)
      .maybeSingle();

    if (appErr || !app) {
      return NextResponse.json({ error: "App not found for domain" }, { status: 404 });
    }

    if (app.status !== "running") {
      return NextResponse.json(
        { error: "The app must be running before custom domains can be activated." },
        { status: 400 }
      );
    }

    if (domain.status !== "verified") {
      const { error: verifyErr } = await supabase
        .from("platform_app_domains")
        .update({
          status: "verified",
          verified_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (verifyErr) {
        return NextResponse.json({ error: verifyErr.message }, { status: 500 });
      }
    }

    const service = getDomainService();
    const actor = createAdminDomainActor(req, domain.user_id, await resolveUserEmail(domain.user_id));
    const operation = await service.activateDomain({
      actor,
      domainId: id,
      idempotencyKey: `admin-activate-${id}-${Date.now()}`,
    });

    await service.runActivationOperation(operation.id, actor);
    const finalOperation = await service.getOperation({ actor, operationId: operation.id });

    if (finalOperation.status === "failed") {
      return NextResponse.json({
        error: finalOperation.error_message || "Activation failed",
        operation: finalOperation,
      }, { status: 500 });
    }

    return NextResponse.json({
      message: `${domain.domain} activation ${finalOperation.status}`,
      operation: finalOperation,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Activation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
