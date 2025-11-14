import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createSpectrumAppSchema } from "@/lib/validation/spectrum";
import { Spectrum_Apps, Projects } from "@/lib/supabase/queries";
import { resolveHost } from "@/config/hosttoip";
import { Encryption } from "@/config/functions";

export async function POST(req: NextRequest) {
//   const auth = await authenticateUser();
//   if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const validation = validateRequest(createSpectrumAppSchema, body);
    if (!validation.success) return validation.response;
    const data = validation.data;

    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    console.log("zoneId:", zoneId);
    console.log("token:", token ? "exists" : "missing");
    if (!zoneId || !token) {
      return NextResponse.json(
        { error: "Cloudflare configuration missing (CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN)" },
        { status: 500 },
      );
    }

    // Build Cloudflare payload
    const cfPayload: Record<string, any> = {
      dns: { name: `${data.dns.name}.hostguardian.net`, type: data.dns.type },
      protocol: data.protocol,
      ip_firewall: data.ip_firewall ?? false,
      tls: data.tls ?? "off",
      traffic_type: data.traffic_type ?? "direct",
    };
    if (data.origin_direct) {
      cfPayload.origin_direct = data.origin_direct;
    } else if (data.origin_dns && data.origin_port) {
      cfPayload.origin_dns = data.origin_dns;
      cfPayload.origin_port = data.origin_port;
    }
    if (data.edge_ips) {
      cfPayload.edge_ips = data.edge_ips;
    }

    const cfResp = await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps`,
      cfPayload,
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      },
    );

    if (!cfResp.data?.success) {
      return NextResponse.json(
        { error: cfResp.data?.errors?.[0]?.message || "Failed to create Spectrum app" },
        { status: 400 },
      );
    }

    const result = cfResp.data.result;

    console.log("Cloudflare Spectrum creation result:", result);

    // Resolve host to IP then encrypt
    const hostToResolve = result.dns?.name || data.dns.name;
    let resolvedIp = hostToResolve;
    try {
      const dnsRes = await resolveHost(hostToResolve);
      console.log("DNS resolution result:", dnsRes);
      const aRecord = dnsRes.records.find(r => r.type === "A");
      if (aRecord && aRecord.records.length) {
        resolvedIp = String(aRecord.records[0]);
      } else if (dnsRes.records.length && dnsRes.records[0].records.length) {
        resolvedIp = String(dnsRes.records[0].records[0] as any);
      }
    } catch {}
    const encKey = process.env.ENCRYPTION_KEY!;
    const encryptedHost = Encryption.encrypt(resolvedIp, encKey);

    const persist = await Spectrum_Apps.create({
      spectrum_id: result.id,
      zone_id: zoneId,
      name: hostToResolve,
      dns_type: result.dns?.type || data.dns.type,
      protocol: result.protocol || data.protocol,
      owner_id: data.owner_id,
      project_id: data.project_id,
      status: "created",
      cf_app: result,
      hostname_enc: encryptedHost as any,
      created_at: new Date().toISOString(),
    });

    if (!persist.success) {
      return NextResponse.json(
        { error: "Created in Cloudflare but failed to persist", details: persist.error, cf: result },
        { status: 500 },
      );
    }

    if (data.project_id) {
      await Projects.add_log?.({
        project_id: data.project_id,
        event: "SpectrumCreate",
        text: `Spectrum app '${data.dns.name}' created`,
      });
    }

    return NextResponse.json({ app: persist.data, cf: result }, { status: 201 });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
