 import { lookup, resolve4, resolve6, resolveCname, resolveMx } from "dns/promises";
 import type { MxRecord } from "dns";




export type DNSRecord =
  | { type: "A" | "AAAA" | "CNAME" | "MX" | "lookup"; records: Array<string | LookupInfo | MxRecord> }
  ;

export type LookupInfo = { address: string; family: number };

export type ResolveResult = {
  host: string;
  records: DNSRecord[];
  error: string | null;
};




export function getHostFromUrl(urlOrHost: string): string | null {
  if (!urlOrHost) return null;
  const maybe = urlOrHost.trim();
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(maybe) ? maybe : `http://${maybe}`;
  try {
    const u = new URL(withScheme);
    return u.hostname;
  } catch {
    return null;
  }
}



export async function resolveHost(hostOrUrl: string): Promise<ResolveResult> {
    console.log(hostOrUrl,".............resolving host.............");
  const parsedHost = getHostFromUrl(hostOrUrl);
  console.log(parsedHost,".............parsed host.............");
  const result: ResolveResult = { host: parsedHost ?? hostOrUrl, records: [], error: null };
  console.log(result,".............initial resolve result.............");

  if (!parsedHost) {
    result.error = "Could not parse hostname from input";
    return result;
  }

  try {
    // A (IPv4)
    const a = await resolve4(parsedHost).catch(() => []);
    if (a && a.length) result.records.push({ type: "A", records: a });

    // AAAA (IPv6)
    const aaaa = await resolve6(parsedHost).catch(() => []);
    if (aaaa && aaaa.length) result.records.push({ type: "AAAA", records: aaaa });

    // CNAME
    const cname = await resolveCname(parsedHost).catch(() => []);
    if (cname && cname.length) result.records.push({ type: "CNAME", records: cname });

    // MX
    const mx = await resolveMx(parsedHost).catch(() => []);
    if (mx && mx.length) {
      // mx are objects {exchange, priority} — keep them as-is (typed as MxRecord)
      result.records.push({ type: "MX", records: mx as unknown as Array<MxRecord> });
    }

    // Fallback: dns.lookup to get at least one address if available
    if (!result.records.length) {
      const lookups = await lookup(parsedHost).catch(() => null);
      if (lookups) {
        const info: LookupInfo = { address: lookups.address, family: lookups.family };
        result.records.push({ type: "lookup", records: [info] });
      }
    }

    if (!result.records.length) {
      result.error = "No DNS records found (host may be private or not publicly resolvable from this server)";
    }

     return result;
  } catch (err: any) {
    result.error = err?.message ?? String(err);
  }
  finally{
     return result;
  }

//   console.log(result.records, ".............final resolve result.............");
//    console.log(result.host, ".............final resolve result.............");
//    console.log(result.error, ".............final resolve result.............");

 
}