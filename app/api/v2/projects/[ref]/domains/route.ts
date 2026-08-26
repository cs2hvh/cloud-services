/**
 * /api/v2/projects/[ref]/domains — custom domains.
 *
 * GET adds/lists, POST claims, DELETE releases. Cloudflare for SaaS is what
 * actually terminates TLS for a custom hostname, and it is NOT activated on
 * the zone (the API returns code 1404). So POST records the claim and tells
 * the caller plainly that it will not serve traffic yet, rather than throwing
 * a Cloudflare stack trace at them or reporting success it cannot deliver.
 */

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

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

/**
 * A hostname, validated strictly because it becomes a routing key. Each label
 * 1-63 chars, alphanumeric with internal hyphens, at least two labels, 253
 * total. v1 accepted malformed hostnames and one of them collided across
 * tenants.
 */
const HOSTNAME =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** Hosts we serve ourselves; a tenant claiming one would hijack the platform. */
const RESERVED_SUFFIXES = [
  "ahurasense.com",
  "apps.ahurasense.com",
];

interface DomainRow {
  ref: string;
  domain: string;
  state: string;
  verification_txt: string | null;
  verified_at: string | null;
  last_error: string | null;
  created_at: string;
}

const DOMAIN_COLUMNS =
  "ref, domain, state, verification_txt, verified_at, last_error, created_at";

function toDomainDto(row: DomainRow) {
  return {
    ref: row.ref,
    domain: row.domain,
    state: row.state,
    url: `https://${row.domain}`,
    verification: row.verification_txt
      ? { type: "TXT", name: `_ahura-verify.${row.domain}`, value: row.verification_txt }
      : null,
    verifiedAt: row.verified_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    /** Honest: nothing serves a custom hostname until SaaS mode is on. */
    serving: row.state === "active",
  };
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

  return json({
    project: { ref: project.ref, name: project.name },
    domains: (data as DomainRow[]).map(toDomainDto),
    customHostnamesEnabled: false,
    note:
      "Custom domains can be claimed but will not serve traffic: Cloudflare " +
      "for SaaS is not enabled on this zone.",
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

  const domain =
    typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
  if (!HOSTNAME.test(domain)) {
    return invalid("That is not a valid domain name.", { domain: "malformed" });
  }
  if (
    RESERVED_SUFFIXES.some(
      (suffix) => domain === suffix || domain.endsWith(`.${suffix}`)
    )
  ) {
    return invalid(
      "That domain belongs to the platform and cannot be claimed.",
      { domain: "reserved" }
    );
  }

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

  return json(
    {
      domain: toDomainDto(data as DomainRow),
      status: "claimed_not_serving",
      note:
        "The claim is recorded, but this domain will not serve traffic until " +
        "Cloudflare for SaaS is enabled on the zone.",
      action: "Enable Cloudflare for SaaS, then re-verify.",
    },
    201
  );
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

  return json({
    ref: (data as { ref: string }).ref,
    domain: (data as { domain: string }).domain,
    status: "marked_for_removal",
    note: "The edge configuration is removed by the reconciler.",
  });
}
