/**
 * How a model is reached, and who serves it. Two separate facts.
 *
 *   serving_type       HOW   'proxy' = a partner's shared API
 *                            'runpod_ft' / 'runpod_byo' = our own endpoint list
 *   upstream_provider  WHO   'custom' = our own pods
 *                            anything else = a named partner
 *
 * Conflating them is how a partner-served model ends up labelled "our pods".
 * A model can be reached through the endpoint mechanism and still be served
 * entirely by somebody else: glm-5.3-derisked has three endpoint rows, all
 * pointing at one partner's API, one per key.
 */

/** Partners reached through their shared API, selectable per model. */
export const PROXY_PARTNERS = ["starimg", "wokey"] as const;

/**
 * Partners reached through per-key endpoint rows rather than a shared API.
 * They are not selectable from a dropdown: moving a model here means adding
 * endpoints with credentials, which is the endpoints screen's job.
 */
export const ENDPOINT_PARTNERS = ["abliteration", "audn"] as const;

export const ALL_PARTNERS = [...PROXY_PARTNERS, ...ENDPOINT_PARTNERS] as const;
export type PartnerName = (typeof ALL_PARTNERS)[number];

/** True only when we serve it ourselves. */
export function servedByOwnPods(
  servingType: string | null | undefined,
  upstreamProvider: string | null | undefined,
): boolean {
  if (!servingType || servingType === "proxy") return false;
  return !upstreamProvider || upstreamProvider === "custom";
}

/** True when endpoint rows are the mechanism, whoever is on the other end. */
export function servedByEndpoints(servingType: string | null | undefined): boolean {
  return Boolean(servingType) && servingType !== "proxy";
}

/**
 * What one endpoint row IS, for labelling. Our own are pods; a partner's are
 * API keys against one base URL, and calling those "pods" invents hardware.
 */
export function endpointNoun(
  servingType: string | null | undefined,
  upstreamProvider: string | null | undefined,
): { one: string; many: string } {
  if (servedByOwnPods(servingType, upstreamProvider)) {
    return { one: "pod", many: "pods" };
  }
  return { one: "key", many: "keys" };
}

/** How a row should describe who serves it, for an operator. */
export function servedByLabel(
  servingType: string | null | undefined,
  upstreamProvider: string | null | undefined,
): string {
  if (servedByOwnPods(servingType, upstreamProvider)) return "our pods";
  return upstreamProvider ?? servingType ?? "unknown";
}

/**
 * Cost tabs for the price editor: the default blob plus each partner that
 * could actually bill this model.
 *
 * An endpoint partner is offered only where it genuinely answers - named by
 * the model, or by one of its endpoint rows. Since a model's own provider
 * can be 'custom' while a partner answers on one of its rows, the row
 * providers have to be consulted or that partner's tab never appears and
 * its rate can never be set.
 */
export function costTabsFor(
  upstreamProvider: string | null | undefined,
  endpointProviders: readonly string[] = [],
) {
  const tabs: { id: string; label: string }[] = [
    { id: "default", label: "Wokey" },
  ];
  const present = new Set(endpointProviders.filter(Boolean));
  for (const p of ALL_PARTNERS) {
    if (p === "wokey") continue; // wokey IS the default blob
    if ((ENDPOINT_PARTNERS as readonly string[]).includes(p)) {
      if (upstreamProvider !== p && !present.has(p)) continue;
    }
    tabs.push({ id: p, label: p.charAt(0).toUpperCase() + p.slice(1) });
  }
  return tabs;
}

/**
 * Whether a partner's cost may fall back to the default blob.
 *
 * It may NOT. upstream_pricing is a single number that was set for whoever
 * came before, and inheriting it hands a new partner someone else's rate as
 * though it were measured: glm-5.3-derisked's default blob is abliteration's
 * 300/30/500, so an audn row would silently report that as its cost and a
 * margin computed from it as fact. A partner with no rate of its own has NO
 * COST BASIS, which is a thing worth saying out loud.
 */
export function partnerCost(
  provider: string,
  providerPricing: Record<string, Record<string, unknown>> | null | undefined,
): Record<string, unknown> | null {
  const blob = providerPricing?.[provider];
  return blob && Object.keys(blob).length > 0 ? blob : null;
}
