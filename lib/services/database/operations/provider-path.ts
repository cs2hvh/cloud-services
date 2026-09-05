/**
 * Names that become a path segment of a DigitalOcean database API URL.
 *
 * The v1 database routes and the dashboard routes take a database name or a
 * username from the request and the operations below interpolate it into
 * `/v2/databases/<cluster>/dbs/<name>` and `/v2/databases/<cluster>/users/<username>`.
 * Nothing validated the value first: the v1 helper URL-decoded it and passed
 * it on, so `..%2F..%2F<other-cluster>%2Fusers%2Fx` climbed out of the
 * caller's own cluster, which the ownership check had already approved, and
 * addressed another endpoint under the platform token.
 *
 * One rule, applied at the interpolation site rather than at each caller, so
 * a new door cannot skip it: a segment is 1 to 63 characters of letters,
 * digits, underscore, dot and hyphen, starting with a letter or digit. That is
 * a superset of what DigitalOcean accepts for database and user names and a
 * strict subset of what can change the shape of a URL. The value is also
 * percent-encoded on the way out, so the character class is the guarantee and
 * the encoding is belt and braces.
 */

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;

export class ProviderPathError extends Error {
  readonly statusCode = 400;
  constructor(what: string) {
    super(`${what} may contain only letters, digits, underscore, dot and hyphen (1 to 63 characters)`);
    this.name = "ProviderPathError";
  }
}

/** True when `value` is safe to place in a provider URL path as one segment. */
export function isProviderSegment(value: unknown): value is string {
  return typeof value === "string" && SEGMENT.test(value) && value !== "." && value !== "..";
}

/** The encoded segment, or a ProviderPathError naming the field. */
export function providerSegment(value: unknown, what: string): string {
  if (!isProviderSegment(value)) throw new ProviderPathError(what);
  return encodeURIComponent(value);
}
