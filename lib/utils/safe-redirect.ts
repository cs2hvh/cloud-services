/**
 * Safely extract a redirect path from Next.js page searchParams.
 * Returns "/" if the value is missing, multi-value, or an open-redirect attempt.
 */

type RawSearchParam = string | string[] | undefined;

type SafeRedirectSearchParams = {
  next?: RawSearchParam;
  redirectTo?: RawSearchParam;
};

function pickFirst(v: RawSearchParam): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export function getSafeRedirectPath(searchParams: SafeRedirectSearchParams): string {
  const raw = pickFirst(searchParams.next) || pickFirst(searchParams.redirectTo) || "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}
