/**
 * Row -> wire shape.
 *
 * The single rule: `ref` goes out, `id` never does. Infrastructure is
 * addressed by its immutable ref everywhere — URLs, payloads, responses — and
 * a database id leaking into a client is how a mutable-name or guessable-id
 * addressing bug gets reintroduced. paas enforces ref immutability with a
 * trigger; this keeps the API surface consistent with it.
 *
 * The second rule, added with sizing: PRICE GOES OUT, COST NEVER DOES. See
 * SizingDto.
 */

// RELATIVE, not "@/lib/...". The routes and pages may use the alias because
// only Next resolves them, but this module is imported directly by
// nullable.test.ts, columns.schema.test.ts and cost-leak.test.ts, and plain
// `node --test` has no tsconfig path mapping. An alias here fails all three
// with ERR_MODULE_NOT_FOUND rather than a test result.
import { requireTier, clampInstances, priceFor } from "../../../../lib/paas/tiers.ts";

export interface ProjectRow {
  ref: string;
  name: string;
  slug: string;
  provider: string;
  repo_id: string;
  repo_full_name: string;
  installation_id: number | null;
  production_branch: string;
  root_directory: string | null;
  framework: string | null;
  scale_to_zero: boolean;
  idle_seconds: number | null;
  /** One of TIERS. NOT NULL in paas with a 'starter' default and a CHECK. */
  tier: string;
  /** NOT NULL, defaults to 1, CHECKed to 1..10. */
  instance_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  teams?: { ref: string; slug: string; name: string } | null;
}

/**
 * What a customer may be told about their sizing.
 *
 * NOTE WHAT IS ABSENT: costUsd and margin. lib/paas/tiers.ts carries our
 * wholesale cost per tier because the deploy path and the drift checks need
 * it, and `Tier` is a single object holding both the price and the cost. Hand
 * that object to a client component and Next serialises ALL of it into the
 * page — our margin included, readable in view-source.
 *
 * That is not hypothetical. The GPU deploy wizard shipped exactly this: two
 * render sites showed the raw RunPod wholesale rate under a "/GPU·hr" label.
 * Same trap, one product over.
 *
 * So the boundary is here, in a named type with no cost field, and
 * serialize.cost.test.ts fails if one is ever added.
 */
export interface SizingDto {
  tier: string;
  label: string;
  /** "shared" | "dedicated". Guaranteed vCPU, NEVER described as faster. */
  cls: string;
  memoryMib: number;
  vcpu: number;
  /** Per APP per month, NOT per instance. Must not be multiplied by count. */
  transferGb: number;
  instanceCount: number;
  /** tier price x instances. Linear — the Nth instance costs what the first did. */
  priceUsd: number;
  priceInr: number;
}

export interface ProjectDto {
  ref: string;
  name: string;
  slug: string;
  repo: {
    provider: string;
    fullName: string;
    productionBranch: string;
    rootDirectory: string | null;
    /** null until the GitHub App is installed for this repo's owner. */
    installed: boolean;
  };
  framework: string | null;
  /**
   * Sleeping is OPT-IN and off by default. It is a trade, not a free win: the
   * app costs nothing while asleep and the first visitor after an idle period
   * waits several seconds. Anything behind a health check, or that a human is
   * watching, should leave it off.
   */
  sleep: {
    enabled: boolean;
    /** null means the platform default. */
    idleSeconds: number | null;
  };
  sizing: SizingDto;
  team: { ref: string; slug: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Row sizing -> customer-safe sizing.
 *
 * requireTier THROWS on an unknown id rather than falling back to the cheapest
 * tier, and that is the right behaviour to inherit here. A project whose tier
 * column somehow holds a value TIERS does not know is a data problem; showing
 * it as "Starter, $5" would tell the customer they are on a plan they are not
 * paying for and hide the corruption. A CHECK constraint makes it unreachable
 * from the API, which is precisely why a throw costs nothing.
 */
export function toSizingDto(tierId: string, instanceCount: number): SizingDto {
  const tier = requireTier(tierId);
  const n = clampInstances(instanceCount);
  const price = priceFor(tier, n);
  return {
    tier: tier.id,
    label: tier.label,
    cls: tier.cls,
    memoryMib: tier.memoryMib,
    vcpu: tier.vcpu,
    // Deliberately NOT multiplied by n. Bundled transfer is per app.
    transferGb: tier.transferGb,
    instanceCount: n,
    priceUsd: price.usd,
    priceInr: price.inr,
  };
}

export function toProjectDto(row: ProjectRow): ProjectDto {
  return {
    ref: row.ref,
    name: row.name,
    slug: row.slug,
    repo: {
      provider: row.provider,
      fullName: row.repo_full_name,
      productionBranch: row.production_branch,
      rootDirectory: row.root_directory,
      installed: row.installation_id !== null,
    },
    framework: row.framework,
    sleep: { enabled: row.scale_to_zero, idleSeconds: row.idle_seconds },
    sizing: toSizingDto(row.tier, row.instance_count),
    team: row.teams
      ? { ref: row.teams.ref, slug: row.teams.slug, name: row.teams.name }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Columns every project read selects. `id` is deliberately absent. */
export const PROJECT_COLUMNS =
  "ref, name, slug, provider, repo_id, repo_full_name, installation_id, " +
  "production_branch, root_directory, framework, scale_to_zero, idle_seconds, " +
  "tier, instance_count, created_at, updated_at, deleted_at";

export const PROJECT_COLUMNS_WITH_TEAM =
  `${PROJECT_COLUMNS}, teams:team_id (ref, slug, name)`;

/**
 * Slugify a display name for use in a hostname label.
 *
 * Kept strict on purpose: the result becomes part of {app}.apps.ahurasense.com,
 * a single DNS label, so it must be lowercase alphanumeric with internal
 * hyphens and at most 63 characters. Returns null when nothing usable is left,
 * which the caller reports as a validation error rather than silently
 * substituting a generated string the user did not choose.
 */
export function slugify(input: string): string | null {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : null;
}
