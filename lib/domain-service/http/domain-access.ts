import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import { createServiceClient } from "@/lib/supabase/server";

type ServiceSupabaseClient = Awaited<ReturnType<typeof createServiceClient>>;

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function isValidDomain(value: string): boolean {
  return /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(value);
}

export async function resolveManagedZone(
  adapter: NameComRegistrarAdapter,
  fqdn: string
): Promise<{ zone: string; host: string } | null> {
  const parts = normalizeDomain(fqdn).split(".").filter(Boolean);
  if (parts.length < 2) return null;

  for (let i = 0; i <= parts.length - 2; i += 1) {
    const candidateZone = parts.slice(i).join(".");
    try {
      const summary = await adapter.getDomainSummary(candidateZone);
      if (summary?.domainName && summary.domainName.toLowerCase() === candidateZone.toLowerCase()) {
        const host = i === 0 ? "@" : parts.slice(0, i).join(".");
        return { zone: candidateZone, host };
      }
    } catch {
      // Keep iterating candidates.
    }
  }

  return null;
}

export async function userOwnsDomain(input: {
  supabase: ServiceSupabaseClient;
  userId: string;
  domain: string;
}): Promise<{ owned: boolean; viaConnection: boolean; viaPurchase: boolean }> {
  const domain = normalizeDomain(input.domain);

  const [{ data: ownedConnections, error: connectionError }, { data: purchaseRows, error: purchaseError }] =
    await Promise.all([
      input.supabase
        .from("platform_app_domains")
        .select("domain")
        .eq("user_id", input.userId)
        .neq("status", "removed"),
      input.supabase
        .from("domain_purchase_requests")
        .select("domain")
        .eq("user_id", input.userId),
    ]);

  if (connectionError) {
    throw new Error(`Failed to load domain ownership: ${connectionError.message}`);
  }
  if (purchaseError) {
    throw new Error(`Failed to load domain ownership: ${purchaseError.message}`);
  }

  const viaConnection = (ownedConnections || []).some((row: { domain?: string | null }) => {
    const item = normalizeDomain(row.domain || "");
    return item === domain || item.endsWith(`.${domain}`);
  });
  const viaPurchase = (purchaseRows || []).some(
    (row: { domain?: string | null }) => normalizeDomain(row.domain || "") === domain
  );

  return {
    owned: viaConnection || viaPurchase,
    viaConnection,
    viaPurchase,
  };
}
