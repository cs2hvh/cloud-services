/**
 * Row -> wire shape.
 *
 * The single rule: `ref` goes out, `id` never does. Infrastructure is
 * addressed by its immutable ref everywhere — URLs, payloads, responses — and
 * a database id leaking into a client is how a mutable-name or guessable-id
 * addressing bug gets reintroduced. paas enforces ref immutability with a
 * trigger; this keeps the API surface consistent with it.
 */

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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  teams?: { ref: string; slug: string; name: string } | null;
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
  team: { ref: string; slug: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
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
  "production_branch, root_directory, framework, created_at, updated_at, deleted_at";

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
