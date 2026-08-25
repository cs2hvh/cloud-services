/**
 * SSRF-pinned HTTP fetch + HTML extraction for the web-crawl source.
 *
 * Ported VERBATIM from lib/inference/url-ingest.ts (the security-load-bearing
 * DNS-resolve-and-pin guard against DNS-rebinding), with two additions for
 * crawling: extractLinks (same-origin BFS frontier) and the ETag header.
 * The runner can't import from the Next lib/ (separate deployable) — this is
 * the vendored copy, same discipline agent-runner used for its own ssrf.ts.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§4.2, §9, Slice C2).
 */
import dns from "node:dns/promises";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

const MAX_RESPONSE_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const BLOCK_LEVEL_TAGS =
  "p|div|li|h1|h2|h3|h4|h5|h6|br|tr|blockquote|article|section|header|footer|main|table";

// `allowPrivate` is a DEV-ONLY escape hatch (env CRAWL_ALLOW_PRIVATE, default
// false everywhere) that skips the private-IP block so a local test server can
// be crawled. NEVER set in production — same posture + naming as agent-runner's
// ssrf.ts `allowPrivate` for the function-webhook tool.
async function resolveAndValidate(rawUrl: string, allowPrivate = false): Promise<{ url: URL; ip: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http/https URLs are allowed: ${rawUrl}`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses: string[] = [];
  if (net.isIP(hostname)) {
    addresses.push(hostname);
  } else {
    try {
      const results = await dns.lookup(hostname, { all: true });
      addresses.push(...results.map((r) => r.address));
    } catch {
      throw new Error(`Could not resolve host: ${hostname}`);
    }
  }
  if (addresses.length === 0 || (!allowPrivate && addresses.some(isPrivateOrReservedIp))) {
    throw new Error(`URL resolves to a private/internal address, not allowed: ${rawUrl}`);
  }
  return { url, ip: addresses[0] };
}

/** SSRF guard: only http(s), resolved IP must be public. Throws otherwise. */
export async function assertPublicHttpUrl(rawUrl: string, allowPrivate = false): Promise<URL> {
  return (await resolveAndValidate(rawUrl, allowPrivate)).url;
}

/**
 * Same guard, but hands back the address it validated so a caller that does its
 * own connecting (the S3 client, which resolves the host itself) can PIN to it.
 * Validating alone isn't enough: between our lookup and the SDK's, a hostile
 * DNS record can flip to 127.0.0.1 (rebinding). Pin, don't re-resolve.
 */
export async function resolveValidatedHost(
  rawUrl: string,
  allowPrivate = false
): Promise<{ url: URL; ip: string }> {
  return resolveAndValidate(rawUrl, allowPrivate);
}

/**
 * A `net.connect` lookup that always answers with the pre-validated IP,
 * ignoring the hostname. Handles both callback shapes Node uses (`all: true`
 * wants an array). Feed it to an http(s).Agent to pin every socket.
 */
export function pinnedLookup(ip: string) {
  const family = net.isIPv6(ip) ? 6 : 4;
  return (
    _hostname: string,
    options: { all?: boolean } | undefined,
    callback: (err: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void
  ): void => {
    if (options?.all) callback(null, [{ address: ip, family }]);
    else callback(null, ip, family);
  };
}

/**
 * Tear down a per-request Agent once its response body has been consumed.
 *
 * The pin lives on the Agent, so every request needs its own — but an Agent
 * left open holds a keep-alive socket pool, and a 1000-page crawl leaks one
 * per page (found by review). close() is the graceful form: it waits for the
 * in-flight body the caller is still streaming, THEN drops the sockets. A
 * caller that never reads the body (fetchPage throws on a non-2xx before
 * touching it) would leave that wait pending forever, so a timer escalates to
 * destroy(). unref'd, so it never holds the process open by itself.
 */
function releaseWhenIdle(dispatcher: Agent): void {
  const timer = setTimeout(() => void dispatcher.destroy().catch(() => {}), FETCH_TIMEOUT_MS);
  timer.unref?.();
  void dispatcher.close().then(
    () => clearTimeout(timer),
    () => clearTimeout(timer)
  );
}

/** Fetch pinning the TCP connection to the pre-validated IP (blocks DNS
 *  rebinding), following redirects manually with re-validation each hop. */
export async function pinnedFetch(rawUrl: string, allowPrivate = false, init: RequestInit = {}): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    if (hop > MAX_REDIRECTS) throw new Error(`Too many redirects fetching ${rawUrl}`);
    const { url, ip } = await resolveAndValidate(current, allowPrivate);
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, _options, callback) => {
          callback(null, [{ address: ip, family: net.isIPv6(ip) ? 6 : 4 }]);
        },
      },
    });

    let res: Response;
    try {
      res = (await undiciFetch(url, {
        ...init,
        dispatcher,
        redirect: "manual",
        signal,
        headers: {
          "User-Agent": "AhuraCloudKnowledgeBaseBot/1.0",
          ...(init.headers ?? {}),
        },
      })) as unknown as Response;
    } catch (err) {
      void dispatcher.destroy().catch(() => {}); // network error/abort — nothing to drain
      throw err;
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      void dispatcher.destroy().catch(() => {}); // a redirect's body is never read
      current = new URL(location, url).toString();
      continue;
    }
    releaseWhenIdle(dispatcher);
    return res;
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.replace("::ffff:", ""));
    return false;
  }
  return true;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function extractParagraphs(html: string): { title: string | null; paragraphs: string[] } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : null;

  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|form)[\s\S]*?<\/\1>/gi, " ");

  body = body.replace(new RegExp(`<\\/?(?:${BLOCK_LEVEL_TAGS})[^>]*>`, "gi"), "\n");
  body = body.replace(/<[^>]+>/g, " ");
  body = decodeEntities(body);

  const paragraphs = body
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 40)
    .filter((line, i, arr) => arr.indexOf(line) === i)
    .slice(0, 200);

  return { title, paragraphs };
}

/** Same-origin absolute links, for the crawl BFS frontier. Fragments and
 *  non-http(s) schemes (mailto:, javascript:, …) are dropped; the #hash is
 *  stripped so /a and /a#x aren't crawled twice. */
export function extractLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (u.host !== base.host) continue; // same-origin only
      u.hash = "";
      out.add(u.toString());
    } catch {
      /* skip malformed */
    }
  }
  return [...out];
}

export interface FetchedPage {
  title: string | null;
  paragraphs: string[];
  links: string[];
  etag: string | null;
}

/** Carries the HTTP status so the crawler can tell "this page is GONE" (404/410
 *  → tombstone its rows) from "this page is temporarily broken" (5xx/network →
 *  keep its rows, record a per-doc failure). Without that distinction a transient
 *  outage silently deletes good content from the KB (found live, C4 testing). */
export class PageFetchError extends Error {
  constructor(
    public readonly status: number | null,
    message: string
  ) {
    super(message);
    this.name = "PageFetchError";
  }
  /** 404/410 — the page is genuinely gone, not just failing. */
  get isGone(): boolean {
    return this.status === 404 || this.status === 410;
  }
}

/** Fetch one page (SSRF-pinned), returning its readable paragraphs, same-origin
 *  links (for BFS), and ETag. Throws on a non-OK / non-HTML response. */
export async function fetchPage(rawUrl: string, allowPrivate = false): Promise<FetchedPage> {
  const res = await pinnedFetch(rawUrl, allowPrivate);
  if (!res.ok) throw new PageFetchError(res.status, `Fetch failed (${res.status}) for ${rawUrl}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    // Not a page we can index — treat like "gone" so it doesn't linger as a
    // perpetually-failing doc (it will never become indexable).
    throw new PageFetchError(404, `Unsupported content-type "${contentType}" — only HTML/text pages`);
  }
  const etag = res.headers.get("etag");

  const reader = res.body?.getReader();
  if (!reader) throw new Error(`No response body for ${rawUrl}`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`Response too large (>${MAX_RESPONSE_BYTES} bytes) for ${rawUrl}`);
    }
    chunks.push(value);
  }
  const html = Buffer.concat(chunks).toString("utf-8");

  const isHtml = contentType.includes("text/html");
  const { title, paragraphs } = isHtml
    ? extractParagraphs(html)
    : { title: null, paragraphs: plainTextParagraphs(html) };
  const links = isHtml ? extractLinks(html, rawUrl) : [];
  return { title, paragraphs, links, etag };
}

function plainTextParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length >= 40)
    .filter((l, i, arr) => arr.indexOf(l) === i)
    .slice(0, 200);
}
