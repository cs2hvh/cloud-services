/**
 * /api/v2/projects/[ref]/domains — custom domains.
 *
 * GET adds/lists, POST claims, DELETE releases. Cloudflare for SaaS is what
 * actually terminates TLS for a custom hostname, and it is NOT activated on
 * the zone (the API returns code 1404). So POST records the claim and tells
 * the caller plainly that it will not serve traffic yet, rather than throwing
 * a Cloudflare stack trace at them or reporting success it cannot deliver.
 */

import { checkCustomDomain } from "../../../_lib/domains";
import { reconcileProjectByRef } from "@/lib/paas/reconciler.ts";
import { listCustomHostnames, deleteCustomHostname } from "@/lib/paas/edge/cloudflare";
import { DOMAIN_COLUMNS, FALLBACK_ORIGIN, liveStateFor, toDomainDto, type DomainRow } from "@/lib/paas/domain-view";
import { paasConfig } from "@/lib/paas/config";
import { createCustomHostname } from "@/lib/paas/edge/cloudflare";

import { getCaller } from "../../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  conflict,
  fromPostgrestError,
  apiError,
} from "../../../_lib/http";

/**
 * Where a customer CNAMEs their domain — the zone-level Cloudflare for SaaS
 * fallback origin. ONE record serves every customer domain and adding a
 * customer does not change it. It does NOT decide which app answers: the
 * Ingress does that off the Host header, exactly as for an *.ahurasense.com
 * hostname. The fallback only gets the request into the cluster.
 */
// FALLBACK_ORIGIN now lives in lib/paas/domain-view.ts, so the list and the UI
// can name it too — the CNAME is the record that actually carries traffic.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

// The row shape, the column list and the presentation all live in
// lib/paas/domain-view.ts. They were duplicated in the project page, whose
// copy selected columns that do not exist — so the Domains tab rendered a
// read failure against a perfectly readable table.

/**
 * Give this hostname an Ingress by giving it an alias.
 *
 * Idempotent: a domain re-added after removal has a released alias already,
 * and un-releasing it is correct — the row records that the hostname once
 * served, and reusing it keeps that history rather than accumulating a new
 * row per attempt.
 *
 * Points at whatever production points at. A custom domain that serves a
 * different build from the project's own hostname is a split nobody asked
 * for and nothing would explain.
 */
async function ensureAliasFor(
  caller: NonNullable<Awaited<ReturnType<typeof getCaller>>>,
  projectId: string,
  hostname: string,
) {
  const host = hostname.toLowerCase();

  const { data: production } = await caller.db
    .from("aliases")
    .select("deployment_id")
    .eq("project_id", projectId)
    .eq("kind", "production")
    .is("released_at", null)
    .maybeSingle();

  const deploymentId = (production as { deployment_id: string | null } | null)?.deployment_id ?? null;

  const { data: existing } = await caller.db
    .from("aliases")
    .select("id")
    .eq("project_id", projectId)
    .eq("hostname", host)
    .maybeSingle();

  if (existing) {
    await caller.db
      .from("aliases")
      .update({ released_at: null, deployment_id: deploymentId })
      .eq("id", (existing as { id: string }).id);
  } else {
    await caller.db
      .from("aliases")
      .insert({ project_id: projectId, hostname: host, kind: "custom", deployment_id: deploymentId });
  }
}

async function resolveProject(
  caller: NonNullable<Awaited<ReturnType<typeof getCaller>>>,
  ref: string
) {
  const { data } = await caller.db
    .from("projects")
    .select("id, ref, name, team_id")
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();
  return (data ?? null) as
    | { id: string; ref: string; name: string; team_id: string }
    | null;
}

export async function GET(_request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  const project = await resolveProject(caller, ref);
  if (!project) return notFound("Project");

  const { data, error } = await caller.db
    .from("domains")
    .select(DOMAIN_COLUMNS)
    .eq("project_id", project.id)
    .neq("state", "removed")
    .order("created_at", { ascending: true });

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/domains] list failed:", error);
    return apiError("internal", "Could not load domains.", 500);
  }

  // Cloudflare's own view, merged in. The database records what we CLAIMED;
  // only Cloudflare knows whether the certificate issued and which DCV record
  // it is still waiting on — without that the tab reported a verified domain
  // that served nothing.
  const liveRows = await liveStateFor((data as DomainRow[]).map((r) => r.domain));

  return json({
    project: { ref: project.ref, name: project.name },
    domains: (data as DomainRow[]).map((r) => toDomainDto(r, liveRows.get(r.domain.toLowerCase()) ?? null)),
    // READ, not hardcoded. This was a literal `false`, so enabling the
    // capability changed nothing here while the POST — which does read it —
    // happily called Cloudflare and issued a certificate. One route, two
    // answers to the same question: the claim told the customer their domain
    // was pending verification and this list told them the feature was off.
    //
    // A flag that cannot turn on is not a flag, and the tell was that turning
    // it on changed the behaviour of one handler and not the other.
    customHostnamesEnabled: paasConfig.acmEnabled(),
    note: paasConfig.acmEnabled()
      ? "Add the DNS records returned when the domain was claimed. The certificate issues once they resolve."
      : "Custom domains can be claimed but will not serve traffic: Cloudflare for SaaS is not enabled on this zone.",
  });
}

export async function POST(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  let body: { domain?: unknown };
  try {
    body = (await request.json()) as { domain?: unknown };
  } catch {
    return invalid("Request body must be JSON.");
  }

  // checkCustomDomain lives in _lib/domains.ts so it can actually be executed
  // — see app/api/v2/_lib/pure.test.ts. Nothing else in this directory runs.
  const checked = checkCustomDomain(body.domain);
  if (!checked.ok) {
    return checked.reason === "reserved"
      ? invalid("That domain belongs to the platform and cannot be claimed.", {
          domain: "reserved",
        })
      : invalid("That is not a valid domain name.", { domain: "malformed" });
  }
  const domain = checked.domain;

  const project = await resolveProject(caller, ref);
  if (!project) return notFound("Project");

  const { data, error } = await caller.db
    .from("domains")
    .insert({
      project_id: project.id,
      team_id: project.team_id,
      domain,
      state: "pending",
    })
    .select(DOMAIN_COLUMNS)
    .single();

  if (error) {
    // paas.domains has a partial unique index — one live claim per domain.
    // That constraint is the defence against one tenant taking another's
    // hostname, so surfacing it as a plain conflict is correct.
    if (error.code === "23505") {
      return conflict(
        "That domain is already claimed. If you own it, remove it from the " +
          "other project first."
      );
    }
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/domains] claim failed:", error);
    return apiError("internal", "Could not add the domain.", 500);
  }

  const row = data as DomainRow;

  if (!paasConfig.acmEnabled()) {
    return json(
      {
        domain: toDomainDto(row),
        status: "claimed_not_serving",
        note:
          "The claim is recorded, but this domain will not serve traffic until " +
          "Cloudflare for SaaS is enabled on the zone.",
        action: "Enable Cloudflare for SaaS, then re-verify.",
      },
      201
    );
  }

  // Ask Cloudflare to issue. The claim above is already durable, so a failure
  // here leaves a retryable row rather than losing the customer's domain.
  try {
    const ch = await createCustomHostname(row.domain);
    const dcv = (ch.ssl?.validation_records ?? [])
      .filter((r) => r.txt_name && r.txt_value)
      .map((r) => ({ type: "TXT" as const, name: r.txt_name!, value: r.txt_value! }));

    const ownership =
      ch.ownership_verification?.name && ch.ownership_verification?.value
        ? [
            {
              type: "TXT" as const,
              name: ch.ownership_verification.name,
              value: ch.ownership_verification.value,
            },
          ]
        : [];

    // AN ALIAS, WHICH IS WHAT ACTUALLY ROUTES THE REQUEST.
    //
    // Claiming a domain created a domains row and a Cloudflare custom
    // hostname and nothing else. The reconciler builds Ingress objects from
    // paas.aliases, so no rule ever existed for the hostname — Cloudflare
    // delivered the request to the cluster and Traefik answered
    // `404 page not found`. Every custom domain added through this route was
    // dead on arrival, however correct its DNS.
    //
    // Pointed at whatever production currently serves, so the domain answers
    // the same build as the project's own hostname rather than a stale one.
    await ensureAliasFor(caller, project.id, row.domain);

    // Converge now so the Ingress exists in seconds rather than at the next
    // sweep. A failure here is NOT a failed claim — the alias is durable and
    // the level-triggered loop repairs it — so it is logged, not raised.
    try {
      await reconcileProjectByRef(project.ref);
    } catch (e) {
      console.error("[v2/domains] converge after claim failed:", (e as Error).message.slice(0, 200));
    }

    await caller.db
      .from("domains")
      .update({
        cf_hostname_id: ch.id,
        // Stored so a later poll can ask whether the customer added what we
        // asked for, rather than re-deriving it and hoping the two match.
        verification_txt: dcv[0]?.value ?? ch.ownership_verification?.value ?? null,
        last_error: null,
      })
      .eq("id", row.id);

    return json(
      {
        domain: toDomainDto({ ...row, cf_hostname_id: ch.id } as DomainRow),
        status: "pending_verification",
        // The CNAME is what actually routes traffic, and Cloudflare accepts it
        // as ownership proof too — which is why the ownership TXT often stops
        // being required once it resolves. Both are returned rather than
        // guessing which one the customer will manage to add.
        records: [
          ...ownership,
          ...dcv,
          { type: "CNAME" as const, name: row.domain, value: FALLBACK_ORIGIN },
        ],
        note: "Add these records at your DNS provider. The certificate issues automatically once they resolve.",
      },
      201
    );
  } catch (e) {
    const message = (e as Error).message.slice(0, 300);
    await caller.db.from("domains").update({ last_error: message }).eq("id", row.id);
    console.error("[v2/domains] issuance failed:", message);
    return json(
      {
        domain: toDomainDto(row),
        status: "claimed_issuance_failed",
        // The claim is KEPT deliberately. Releasing it would free the domain
        // for another tenant to claim while this customer is mid-setup.
        note: "The domain is claimed, but the certificate request failed. It can be retried.",
        error: message,
      },
      201
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  const domainRef = new URL(request.url).searchParams.get("domain");
  if (!domainRef) {
    return invalid("A `domain` ref is required.", { domain: "required" });
  }

  const project = await resolveProject(caller, ref);
  if (!project) return notFound("Project");

  // Soft-remove. The reconciler needs the row to know to tear the Cloudflare
  // custom hostname down; deleting it outright would strand that resource, in
  // the same way v1 stranded billing meters.
  const { data, error } = await caller.db
    .from("domains")
    .update({ state: "removed" })
    .eq("ref", domainRef)
    .eq("project_id", project.id)
    .neq("state", "removed")
    .select("ref, domain")
    .maybeSingle();

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/domains] remove failed:", error);
    return apiError("internal", "Could not remove the domain.", 500);
  }
  if (!data) return notFound("Domain");

  // REMOVE IT FROM CLOUDFLARE NOW, not only in the reconciler.
  //
  // This used to mark the row and stop, on the reasoning that the sweep would
  // tear the custom hostname down. That sweep runs in report mode, so nothing
  // ever did — and the next attempt to add the same domain came back
  // `409 1406 Duplicate custom hostname found`, which reads as our bug and is.
  //
  // Same shape as the alias route: converge inline so the customer sees the
  // effect immediately, and leave the level-triggered sweep as the backstop
  // for anything this misses.
  const removedDomain = (data as { domain: string }).domain;
  let edgeNote = "Removed from the edge.";

  // Release the routing alias too, or the Ingress survives the domain and the
  // hostname keeps resolving to an app its owner believes they detached.
  try {
    await caller.db
      .from("aliases")
      .update({ released_at: new Date().toISOString() })
      .eq("project_id", project.id)
      .eq("hostname", removedDomain.toLowerCase())
      .is("released_at", null);
  } catch (e) {
    console.error("[v2/domains] alias release failed:", (e as Error).message.slice(0, 160));
  }

  try {
    await reconcileProjectByRef(project.ref);
  } catch (e) {
    console.error("[v2/domains] converge after removal failed:", (e as Error).message.slice(0, 200));
  }
  try {
    const matches = await listCustomHostnames(removedDomain);
    const mine = matches.filter((h) => String(h.hostname).toLowerCase() === removedDomain.toLowerCase());
    for (const h of mine) await deleteCustomHostname(h.id);
    if (mine.length === 0) {
      // Already gone. Not a failure — the row is what we were asked to remove.
      edgeNote = "No custom hostname existed at the edge; nothing to remove there.";
    }
  } catch (e) {
    // The ROW STAYS REMOVED. A failure here means the edge still holds the
    // hostname, which the sweep will clear — but the customer must be told,
    // because until it clears, re-adding the same domain will be refused as a
    // duplicate and that error would look like nonsense.
    const detail = (e as Error).message.slice(0, 200);
    console.error("[v2/domains] edge removal failed:", detail);
    edgeNote =
      "The domain was removed here, but the edge configuration could not be deleted yet. " +
      "Adding this domain again may be refused as a duplicate until it clears.";
  }

  return json({
    ref: (data as { ref: string }).ref,
    domain: removedDomain,
    status: "removed",
    note: edgeNote,
  });
}
