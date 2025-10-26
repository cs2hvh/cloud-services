// app/api/resolve/route.js  (Next.js App Router)
import { NextResponse } from "next/server";
import dns from "dns/promises";
import { createClient } from "@/lib/supabase/server";

export async function GET(req) {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { message: "Unauthorized - please login" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const host = url.searchParams.get("host") || url.searchParams.get("url");
  if (!host) return NextResponse.json({ error: "Provide ?host=" }, { status: 400 });

  const res = { host, answers: [], error: null };

  try {
    // try A records
    const a = await dns.resolve4(host).catch(() => []);
    if (a.length) res.answers.push({ type: "A", records: a });

    // try AAAA
    const aaaa = await dns.resolve6(host).catch(() => []);
    if (aaaa.length) res.answers.push({ type: "AAAA", records: aaaa });

    // MX, CNAME, TXT — optional extra info
    const cname = await dns.resolveCname(host).catch(() => []);
    if (cname.length) res.answers.push({ type: "CNAME", records: cname });

    const mx = await dns.resolveMx(host).catch(() => []);
    if (mx.length) res.answers.push({ type: "MX", records: mx });

    // fallback to lookup to get at least one address if available
    if (!res.answers.length) {
      const lookup = await dns.lookup(host).catch(() => null);
      if (lookup) res.answers.push({ type: "lookup", records: [lookup] });
    }

    if (!res.answers.length) res.error = "No records found (not publicly resolvable from this server)";
  } catch (err) {
    res.error = err.message || String(err);
  }

  return NextResponse.json(res);
}
