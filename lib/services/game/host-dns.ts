// DNS for game node hostnames. Node FQDNs need a DNS-only (grey-cloud) A record
// so the daemon TLS cert issues and the browser console can reach the node.
// If the FQDN's apex is a zone in our Cloudflare account we create the record
// automatically; otherwise we return unresolvable so the caller surfaces the
// exact record for the admin to add manually.

interface CloudflareZone {
  id: string;
  name: string;
}

function cfToken(): string | null {
  return process.env.CLOUDFLARE_API_TOKEN || null;
}

async function cf<T>(path: string, init?: RequestInit): Promise<T | null> {
  const token = cfToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean; result?: T } | null;
    if (!data?.success) return null;
    return (data.result ?? null) as T | null;
  } catch {
    return null;
  }
}

/** Find the zone in our CF account that is a suffix of the fqdn (longest match). */
async function findZone(fqdn: string): Promise<CloudflareZone | null> {
  const zones = (await cf<CloudflareZone[]>(`/zones?per_page=50`)) ?? [];
  const matches = zones
    .filter((z) => fqdn === z.name || fqdn.endsWith(`.${z.name}`))
    .sort((a, b) => b.name.length - a.name.length);
  return matches[0] ?? null;
}

/**
 * Ensure `fqdn` → `ip` (DNS-only) exists. When the zone is under our CF token
 * we create/verify it and report resolvable; otherwise resolvable=false and the
 * caller must have the admin add the record by hand.
 */
export async function ensureNodeDnsRecord(
  fqdn: string,
  ip: string,
): Promise<{ resolvable: boolean; managed: boolean; instruction?: string }> {
  const zone = cfToken() ? await findZone(fqdn) : null;
  if (!zone) {
    return {
      resolvable: false,
      managed: false,
      instruction: `Add DNS A record: ${fqdn} → ${ip} (DNS-only / grey cloud)`,
    };
  }

  const existing = await cf<Array<{ id: string; content: string; proxied: boolean }>>(
    `/zones/${zone.id}/dns_records?type=A&name=${encodeURIComponent(fqdn)}`,
  );
  if (existing && existing.length > 0) {
    const rec = existing[0];
    if (rec.content !== ip || rec.proxied) {
      await cf(`/zones/${zone.id}/dns_records/${rec.id}`, {
        method: "PUT",
        body: JSON.stringify({ type: "A", name: fqdn, content: ip, ttl: 120, proxied: false }),
      });
    }
    return { resolvable: true, managed: true };
  }

  const created = await cf(`/zones/${zone.id}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: "A", name: fqdn, content: ip, ttl: 120, proxied: false }),
  });
  return created
    ? { resolvable: true, managed: true }
    : { resolvable: false, managed: false, instruction: `Add DNS A record: ${fqdn} → ${ip} (DNS-only)` };
}
