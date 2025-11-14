import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updateSpectrumAppSchema } from "@/lib/validation/spectrum";
import { Spectrum_Apps, Projects } from "@/lib/supabase/queries";
import { resolveHost } from "@/config/hosttoip";
import { Encryption } from "@/config/functions";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const validation = validateRequest(updateSpectrumAppSchema, body);
    if (!validation.success) return validation.response;
    const data = validation.data;

    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!zoneId || !token) {
      return NextResponse.json(
        { error: "Cloudflare configuration missing" },
        { status: 500 },
      );
    }

    const patch: Record<string, any> = {};
    if (data.dns) patch.dns = data.dns;
    if (data.protocol) patch.protocol = data.protocol;
    if (data.ip_firewall !== undefined) patch.ip_firewall = data.ip_firewall;
    if (data.tls) patch.tls = data.tls;
    if (data.traffic_type) patch.traffic_type = data.traffic_type;
    if (data.edge_ips) patch.edge_ips = data.edge_ips;
    if (data.origin_direct) {
      patch.origin_direct = data.origin_direct;
      patch.origin_dns = undefined;
      patch.origin_port = undefined;
    } else if (data.origin_dns && data.origin_port) {
      patch.origin_dns = data.origin_dns;
      patch.origin_port = data.origin_port;
      patch.origin_direct = undefined;
    }

    const cfResp = await axios.put(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps/${data.app_id}`,
      patch,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
    );

    if (!cfResp.data?.success) {
      return NextResponse.json(
        { error: cfResp.data?.errors?.[0]?.message || "Failed to update Spectrum app" },
        { status: 400 },
      );
    }

    const result = cfResp.data.result;

    // Resolve & encrypt updated hostname/IP if hostname changed
    let encryptedHost: any | undefined = undefined;
    if (result.dns?.name) {
      let resolvedIp = result.dns.name;
      try {
        const dnsRes = await resolveHost(result.dns.name);
        const aRecord = dnsRes.records.find(r => r.type === "A");
        if (aRecord && aRecord.records.length) {
          resolvedIp = String(aRecord.records[0]);
        } else if (dnsRes.records.length && dnsRes.records[0].records.length) {
          resolvedIp = String(dnsRes.records[0].records[0] as any);
        }
      } catch {}
      const encKey = process.env.ENCRYPTION_KEY!;
      encryptedHost = Encryption.encrypt(resolvedIp, encKey);
    }

    await Spectrum_Apps.update(data.app_id, {
      name: result.dns?.name,
      dns_type: result.dns?.type,
      protocol: result.protocol,
      status: "updated",
      cf_app: result,
      ...(encryptedHost ? { hostname_enc: encryptedHost } : {}),
    });

    if (auth.user?.id) {
      // Attempt to log under project if present in local record
      // (Simplified: we would fetch existing record to know project_id)
    }

    if (result?.project_id) {
      await Projects.add_log?.({
        project_id: result.project_id,
        event: "SpectrumUpdate",
        text: `Spectrum app '${result.dns?.name}' updated`,
      });
    }

    return NextResponse.json({ cf: result });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
