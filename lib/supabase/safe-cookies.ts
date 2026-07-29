/**
 * Drop auth cookies that @supabase/ssr cannot decode.
 *
 * Found by E2E on 2026-07-29: a request carrying a malformed Supabase auth
 * cookie returned **500 on every authenticated route** — admin pages, the
 * legacy admin API, even /api/billing/balance. The decoder throws from inside
 * its own promise chain, so it surfaces as an unhandledRejection and escapes
 * the try/catch in requireAdmin(), which otherwise returns { ok: false }.
 *
 * A corrupt or truncated cookie is not a server fault — it is an unauthenticated
 * request. It should redirect to login, not 500. Cookies get truncated in the
 * wild: chunk loss, a partial clear, a cookie from a previous auth version.
 *
 * The malformed value is therefore filtered out BEFORE the library sees it, so
 * Supabase observes no session and the normal unauthenticated path runs.
 *
 * Validation is the FULL contract, not just the alphabet: the payload must
 * base64url-decode AND parse as a JSON object. A first attempt checked only the
 * character set and still 500'd on `base64-garbage`, because "garbage" is
 * entirely legal base64url — it decodes to bytes and only fails later at JSON.
 *
 * Chunked cookies (`…auth-token.0`, `.1`) each hold a FRAGMENT of one base64
 * string and cannot be judged alone, so chunks are reassembled in order and the
 * assembled payload is validated once.
 *
 * Deliberately narrow: only `sb-*-auth-token*` cookies are inspected, and a
 * valid session is never altered.
 */

export interface RawCookie {
  name: string;
  value: string;
}

const AUTH_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;
const BASE64_PREFIX = "base64-";

function baseName(name: string): string {
  return name.replace(/\.\d+$/, "");
}

function chunkIndex(name: string): number {
  const m = name.match(/\.(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function decodeBase64Url(payload: string): string | null {
  if (!/^[A-Za-z0-9_-]+=*$/.test(payload)) return null;
  try {
    const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, "=");
    return typeof Buffer !== "undefined"
      ? Buffer.from(padded, "base64").toString("utf-8")
      : decodeURIComponent(escape(atob(padded)));
  } catch {
    return null;
  }
}

/**
 * Whether an assembled auth-cookie value is something Supabase can use.
 *
 * Non-base64 values (legacy plain JSON, or anything else) are left alone — this
 * guard exists for one specific crash, not to police cookie formats.
 */
export function isUsableAuthValue(value: string): boolean {
  if (!value.startsWith(BASE64_PREFIX)) return true;
  const payload = value.slice(BASE64_PREFIX.length);
  if (payload.length === 0) return false;

  const decoded = decodeBase64Url(payload);
  if (decoded === null) return false;

  try {
    const parsed = JSON.parse(decoded);
    return !!parsed && typeof parsed === "object";
  } catch {
    return false;
  }
}

/**
 * Filter a cookie list so no unusable auth cookie reaches @supabase/ssr.
 *
 * Chunks are reassembled before validation, and if the assembled session is
 * unusable every chunk of it is dropped — a half-present session decodes to
 * garbage, which is the same crash by another route.
 */
export function safeAuthCookies<T extends RawCookie>(cookies: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const cookie of cookies) {
    if (!AUTH_COOKIE.test(cookie.name)) continue;
    const key = baseName(cookie.name);
    const list = groups.get(key);
    if (list) list.push(cookie);
    else groups.set(key, [cookie]);
  }
  if (groups.size === 0) return cookies;

  const bad = new Set<string>();
  for (const [key, parts] of groups) {
    const assembled = parts
      .slice()
      .sort((a, b) => chunkIndex(a.name) - chunkIndex(b.name))
      .map((p) => p.value)
      .join("");
    if (!isUsableAuthValue(assembled)) bad.add(key);
  }
  if (bad.size === 0) return cookies;

  return cookies.filter((c) => !AUTH_COOKIE.test(c.name) || !bad.has(baseName(c.name)));
}
