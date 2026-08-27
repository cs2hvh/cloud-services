/**
 * Does each tenant's egress policy still deny what it was written to deny?
 *
 * WHY THIS EXISTS. The deploy lane found that a tenant pod could open a socket
 * to the Kubernetes API server despite an egress rule denying 10.0.0.0/8. The
 * API's ClusterIP is 10.128.0.1, inside that range — but KUBE-PROXY DNATs the
 * ClusterIP to the real endpoint BEFORE egress policy is evaluated, and on LKE
 * that endpoint is a public address. The policy saw a public destination and
 * allowed it under 0.0.0.0/0.
 *
 * The general form, which outlives the fix: AN `except` LIST CANNOT PROTECT AN
 * ADDRESS THE POLICY NEVER SEES. The private-range denial is real — a
 * cross-tenant connection to 10.2.0.33 was refused in the same run — and does
 * nothing whatever for anything DNAT'd.
 *
 * The fix denies the endpoint's real address, read from the `kubernetes`
 * Endpoints at reconcile time rather than hardcoded. WHICH IS WHY THIS EXISTS:
 * a policy written from a value read once is correct until that value moves.
 * The control plane's address changes on an upgrade, a rebuild, or a failover,
 * and when it does every deployed policy silently stops covering it. Nothing
 * fails. The hole simply reopens.
 *
 * INDEXED BY NAMESPACE, NOT BY POLICY, for the same reason previews are indexed
 * by environment: a namespace with NO policy is the dangerous case, and it is
 * invisible to anything that walks the policies that exist. Walking policies
 * asks "are the policies correct"; walking namespaces asks "is each tenant
 * protected", and only the second can notice an absence.
 *
 * Pure. Takes what someone else read.
 */

/** The ranges every tenant policy must deny, whatever else it denies. */
export const REQUIRED_DENIED_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  // Link-local, which carries the cloud metadata endpoint at 169.254.169.254 —
  // instance credentials to anything that can reach it.
  "169.254.0.0/16",
] as const;

function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

/**
 * Does `cidr` contain `ip`?
 *
 * Returns null when either cannot be parsed, and null is NOT false: a `except`
 * entry this cannot read might be the one covering the address, so treating it
 * as "does not cover" would report a real protection as drift, and treating it
 * as "covers" would report a hole as protected. Only the caller knows which
 * error is worse, so it is handed the ambiguity rather than resolved here.
 */
export function cidrContains(cidr: string, ip: string): boolean | null {
  const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(cidr.trim());
  if (!m) return null;
  const bits = Number(m[2]);
  if (bits > 32) return null;

  const net = ipToInt(m[1]);
  const addr = ipToInt(ip);
  if (net === null || addr === null) return null;

  // A /0 masks to zero, and JS shifts by 32 are a no-op rather than a wipe —
  // `-1 << 32` is -1, not 0, which would make /0 match nothing instead of
  // everything.
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
  return ((net & mask) >>> 0) === ((addr & mask) >>> 0);
}

export interface PolicyLike {
  name: string;
  /** Every `except` entry across the policy's egress ipBlocks, flattened. */
  deniedCidrs: string[];
}

export interface NamespaceLike {
  namespace: string;
  /** Null when the policies could not be listed — not an empty list. */
  policies: PolicyLike[] | null;
  /** Whether anything is actually running here, for severity. */
  pods: number;
}

export type NamespaceVerdict =
  /** Denies the required ranges and every current control-plane endpoint. */
  | "protected"
  /** No policy at all. Nothing constrains this tenant's egress. */
  | "unprotected"
  /** Has a policy that does not deny a current control-plane endpoint. */
  | "control-plane-reachable"
  /** Has a policy missing one of the required private ranges. */
  | "incomplete"
  /** The policies could not be read, so nothing can be concluded. */
  | "unreadable";

export interface NamespaceFinding {
  namespace: string;
  verdict: NamespaceVerdict;
  pods: number;
  /** Required ranges this namespace does not deny. */
  missingCidrs: string[];
  /** Control-plane endpoints this namespace does not deny. */
  reachableEndpoints: string[];
  detail: string;
  /** Reachable control plane or no policy at all, with something running. */
  urgent: boolean;
}

export interface NetpolicyReport {
  findings: NamespaceFinding[];
  examined: number;
  /** True only when every namespace is protected AND the run could evaluate. */
  clean: boolean;
  /**
   * Set when the control-plane endpoints could not be read. The run proves
   * NOTHING about the DNAT hole and must not be reported as clean.
   */
  void: boolean;
  voidReason: string | null;
}

export interface NetpolicyInput {
  namespaces: NamespaceLike[];
  /**
   * Current addresses behind the `kubernetes` Service, from its Endpoints.
   * NULL means unread — the check that matters cannot run, and the whole report
   * is void rather than clean.
   *
   * This is the deploy lane's control from the other direction: a probe pod
   * with no working network fails every negative test and reports perfect
   * isolation. Here, an unreadable endpoint list makes every policy look
   * sufficient because there is nothing left to fail against.
   */
  controlPlaneEndpoints: string[] | null;
}

export function checkNetpolicies(input: NetpolicyInput): NetpolicyReport {
  const { namespaces, controlPlaneEndpoints } = input;

  const isVoid = controlPlaneEndpoints === null || controlPlaneEndpoints.length === 0;
  const voidReason =
    controlPlaneEndpoints === null
      ? "the kubernetes Endpoints could not be read — nothing here proves the control plane is denied"
      : controlPlaneEndpoints.length === 0
        ? "the kubernetes Endpoints listed no addresses — an empty list makes every policy look sufficient"
        : null;

  const findings: NamespaceFinding[] = [];

  for (const ns of namespaces) {
    if (ns.policies === null) {
      findings.push({
        namespace: ns.namespace,
        verdict: "unreadable",
        pods: ns.pods,
        missingCidrs: [],
        reachableEndpoints: [],
        detail: "policies could not be listed — this namespace is unevaluated, not protected",
        urgent: false,
      });
      continue;
    }

    if (ns.policies.length === 0) {
      findings.push({
        namespace: ns.namespace,
        verdict: "unprotected",
        pods: ns.pods,
        missingCidrs: [...REQUIRED_DENIED_CIDRS],
        reachableEndpoints: controlPlaneEndpoints ?? [],
        detail: "no NetworkPolicy — nothing constrains this tenant's egress at all",
        // A namespace with no policy and no pods is a hole nobody is standing
        // in yet. With pods it is a live one.
        urgent: ns.pods > 0,
      });
      continue;
    }

    const denied = ns.policies.flatMap((p) => p.deniedCidrs);
    const coversRange = (required: string) =>
      denied.some((d) => d.trim() === required || cidrContains(d, required.split("/")[0]) === true);

    const missingCidrs = REQUIRED_DENIED_CIDRS.filter((c) => !coversRange(c));
    const reachableEndpoints = (controlPlaneEndpoints ?? []).filter(
      (ep) => !denied.some((d) => cidrContains(d, ep) === true),
    );

    if (reachableEndpoints.length > 0) {
      findings.push({
        namespace: ns.namespace,
        verdict: "control-plane-reachable",
        pods: ns.pods,
        missingCidrs,
        reachableEndpoints,
        detail:
          `the policy does not deny ${reachableEndpoints.join(", ")} — kube-proxy DNATs the API ClusterIP ` +
          `to that address before egress policy is evaluated, so the private-range denial never sees it`,
        urgent: true,
      });
      continue;
    }

    if (missingCidrs.length > 0) {
      findings.push({
        namespace: ns.namespace,
        verdict: "incomplete",
        pods: ns.pods,
        missingCidrs,
        reachableEndpoints: [],
        detail: `does not deny ${missingCidrs.join(", ")}`,
        // 169.254.0.0/16 carries instance credentials; the others are
        // cross-tenant reach. Both are urgent with something running.
        urgent: ns.pods > 0,
      });
      continue;
    }

    findings.push({
      namespace: ns.namespace,
      verdict: "protected",
      pods: ns.pods,
      missingCidrs: [],
      reachableEndpoints: [],
      detail: "denies the private ranges, link-local, and every current control-plane endpoint",
      urgent: false,
    });
  }

  const order: Record<NamespaceVerdict, number> = {
    "control-plane-reachable": 0,
    unprotected: 1,
    incomplete: 2,
    unreadable: 3,
    protected: 4,
  };
  findings.sort((a, b) => order[a.verdict] - order[b.verdict]);

  return {
    findings,
    examined: namespaces.length,
    // Void beats clean. A run that could not evaluate the DNAT case has not
    // shown the hole is closed, whatever the policies happen to contain.
    clean: !isVoid && namespaces.length > 0 && findings.every((f) => f.verdict === "protected"),
    void: isVoid,
    voidReason,
  };
}
