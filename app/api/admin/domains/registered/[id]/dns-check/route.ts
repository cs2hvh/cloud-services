import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { DnsRoutingAdapter } from "@/lib/domain-service/integrations/dns-routing.adapter";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: domain, error: fetchErr } = await supabase
    .from("platform_app_domains")
    .select("id, domain")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const adapter = new DnsRoutingAdapter();
  const result = await adapter.getRoutingStatus(domain.domain);

  return NextResponse.json({ domain: domain.domain, dns: result });
}
