/**
 * Hostname reconciliation across the three places a hostname exists:
 * Cloudflare DNS, the cluster's Ingress objects, and `paas.aliases`.
 *
 * THE CASE THIS EXISTS FOR IS `claimable`, AND IT IS A SECURITY FINDING, NOT
 * A TIDINESS ONE.
 *
 * A proxied A record pointing at the gateway makes a hostname OURS as far as
 * the internet is concerned. Traefik then routes it to whichever Ingress
 * claims that host. If no Ingress claims it the request 404s, which looks
 * harmless — but the hostname is now unclaimed and still pointed at us, so the
 * NEXT Ingress to name it receives its traffic. On a platform with untrusted
 * public signups, that Ingress can belong to any tenant.
 *
 * That is subdomain takeover with the DNS step already done for the attacker.
 * v1 had the same defect in a worse form: `name` was the primary key of all
 * infrastructure addressing with no uniqueness constraint, and one tenant
 * could rename onto another's hostname. The `aliases` table fixes the database
 * half with a globally unique index. It does not fix the half where a record
 * outlives the Ingress it was minted for, because nothing was comparing them.
 *
 * The other direction matters less but still lies: `publish-app.ts` creates a
 * DNS record and an Ingress and writes NOTHING to `paas.aliases`. So the
 * control plane does not know about hostnames that are live right now, and
 * promote and rollback — which the schema supports as a single write — cannot
 * be built on a table that does not describe reality.
 *
 * Pure. No network. Report-only: deleting a DNS record on the strength of a
 * classification is how a working app goes dark.
 */

export const DNS_SEVERITY = [
  "claimable",
  "phantom",
  "unreachable",
  "unrecorded",
  "foreign",
  "healthy",
] as const;

export type DnsDriftStatus = (typeof DNS_SEVERITY)[number];

export interface DnsRecordLike {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

export interface IngressLike {
  namespace: string;
  name: string;
  hosts: string[];
}

export interface AliasLike {
  ref: string;
  hostname: string;
  kind: string;
  deployment_id: string | null;
}

export interface HostnameFinding {
  status: DnsDriftStatus;
  hostname: string;
  /** Cloudflare record id, when one exists. */
  recordId: string | null;
  /** `namespace/name` of the Ingress claiming it, when one does. */
  ingress: string | null;
  /** paas.aliases ref, when a row exists. */
  ref: string | null;
  detail: string;
  action: string;
  /** Worth a human's attention. */
  actionable: boolean;
  /** Reachable from the public internet right now. */
  live: boolean;
}

export interface DnsDriftReport {
  findings: HostnameFinding[];
  claimable: number;
  clean: boolean;
}

export interface DnsReconcileInput {
  records: DnsRecordLike[];
  ingresses: IngressLike[];
  aliases: AliasLike[];
  /** The gateway address our records are supposed to point at. */
  gatewayIp: string;
  /** Apex under which platform hostnames are minted, e.g. ahurasense.com. */
  appDomain: string;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\.$/, "");

/**
 * Records the platform is responsible for: under the app domain, and pointing
 * at our gateway.
 *
 * A record under the apex pointing somewhere else is somebody's production
 * website — the zone carries 30 live records — and must be reported as foreign
 * and never touched. This is the same reasoning that makes publish-app.ts
 * refuse to overwrite an existing record.
 */
export function isPlatformRecord(r: DnsRecordLike, gatewayIp: string, appDomain: string): boolean {
  const name = norm(r.name);
  const apex = norm(appDomain);
  if (name === apex) return false; // the apex itself is the marketing site
  if (!name.endsWith(`.${apex}`)) return false;
  return r.type === "A" && r.content.trim() === gatewayIp.trim();
}

export function reconcileHostnames(input: DnsReconcileInput): DnsDriftReport {
  const { gatewayIp, appDomain } = input;
  const findings: HostnameFinding[] = [];

  const ingressByHost = new Map<string, IngressLike>();
  for (const ing of input.ingresses) {
    for (const h of ing.hosts) ingressByHost.set(norm(h), ing);
  }

  const aliasByHost = new Map<string, AliasLike>();
  for (const a of input.aliases) aliasByHost.set(norm(a.hostname), a);

  const seenHosts = new Set<string>();

  for (const r of input.records) {
    const host = norm(r.name);

    if (!isPlatformRecord(r, gatewayIp, appDomain)) {
      findings.push({
        status: "foreign",
        hostname: host,
        recordId: r.id,
        ingress: null,
        ref: null,
        detail: `${r.type} -> ${r.content}${r.proxied ? " (proxied)" : ""}`,
        action: "Not a platform record. Listed for visibility; never touched.",
        actionable: false,
        live: false,
      });
      continue;
    }

    seenHosts.add(host);
    const ingress = ingressByHost.get(host) ?? null;
    const alias = aliasByHost.get(host) ?? null;

    if (!ingress) {
      findings.push({
        status: "claimable",
        hostname: host,
        recordId: r.id,
        ingress: null,
        ref: alias?.ref ?? null,
        detail: `A -> ${gatewayIp}${r.proxied ? " (proxied)" : ""}, no Ingress claims this host`,
        action:
          `This hostname resolves to our gateway and nothing routes it. Traefik 404s ` +
          `today, but the next Ingress to name it — in ANY tenant namespace — receives ` +
          `its traffic. Delete the DNS record, or recreate the Ingress that owned it.`,
        actionable: true,
        live: true,
      });
      continue;
    }

    if (!alias) {
      findings.push({
        status: "unrecorded",
        hostname: host,
        recordId: r.id,
        ingress: `${ingress.namespace}/${ingress.name}`,
        ref: null,
        detail: `serving from ${ingress.namespace}/${ingress.name}, no paas.aliases row`,
        action:
          `Live and working, but the control plane does not know it exists. Promote and ` +
          `rollback read this table, so neither can act on this hostname.`,
        actionable: true,
        live: true,
      });
      continue;
    }

    findings.push({
      status: "healthy",
      hostname: host,
      recordId: r.id,
      ingress: `${ingress.namespace}/${ingress.name}`,
      ref: alias.ref,
      detail: `${alias.kind}, serving from ${ingress.namespace}/${ingress.name}`,
      action: "",
      actionable: false,
      live: true,
    });
  }

  // ── Ingress objects with no DNS record ────────────────────────────────────

  for (const [host, ing] of ingressByHost) {
    if (seenHosts.has(host)) continue;
    if (!norm(host).endsWith(`.${norm(appDomain)}`)) continue; // custom domain, not ours to mint

    findings.push({
      status: "unreachable",
      hostname: host,
      recordId: null,
      ingress: `${ing.namespace}/${ing.name}`,
      ref: aliasByHost.get(host)?.ref ?? null,
      detail: `Ingress ${ing.namespace}/${ing.name} routes this host, no DNS record points at us`,
      action:
        `The app is running and routable inside the cluster but nothing resolves to it. ` +
        `Create the A record, or remove the Ingress if the app was retired.`,
      actionable: true,
      live: false,
    });
    seenHosts.add(host);
  }

  // ── alias rows describing nothing ─────────────────────────────────────────

  for (const a of input.aliases) {
    const host = norm(a.hostname);
    if (seenHosts.has(host)) continue;

    findings.push({
      status: "phantom",
      hostname: host,
      recordId: null,
      ingress: null,
      ref: a.ref,
      detail: `alias row '${a.kind}' with neither an Ingress nor a DNS record`,
      action:
        a.deployment_id === null
          ? `Reserved but never published. Harmless; it holds the hostname's uniqueness.`
          : `Claims a deployment but nothing serves it. The control plane is describing ` +
            `a hostname that does not resolve.`,
      actionable: a.deployment_id !== null,
      live: false,
    });
  }

  const rank = (s: DnsDriftStatus) => DNS_SEVERITY.indexOf(s);
  findings.sort((a, b) => rank(a.status) - rank(b.status) || a.hostname.localeCompare(b.hostname));

  return {
    findings,
    claimable: findings.filter((f) => f.status === "claimable").length,
    clean: findings.every((f) => !f.actionable),
  };
}

/**
 * Hosts an Ingress object routes.
 *
 * Kubernetes allows a rule with no host, meaning "any host". That is a
 * catch-all: it would claim every unmatched hostname pointed at the gateway,
 * across every tenant. Returned as the sentinel `*` so a caller can see it
 * rather than silently treating the Ingress as routing nothing.
 */
export function ingressHosts(ing: {
  metadata: { name: string; namespace: string };
  spec?: { rules?: Array<{ host?: string }> };
}): IngressLike {
  const hosts = (ing.spec?.rules ?? []).map((r) => (r.host ? norm(r.host) : "*"));
  return { namespace: ing.metadata.namespace, name: ing.metadata.name, hosts };
}
