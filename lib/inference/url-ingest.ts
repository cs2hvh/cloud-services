/**
 * Fetches a URL server-side and extracts readable text paragraphs, for
 * seeding a vector collection from a hosted document/web page instead of
 * pasted text. Used by /api/inference/vector/collections/[id]/ingest-url.
 *
 * No HTML-parsing dependency (jsdom is dev-only, used for tests) — this is
 * a lightweight, dependency-free tag-stripping extractor. It's good enough
 * for typical docs/FAQ/article pages; it is not a full readability
 * algorithm and can pick up nav/footer boilerplate on heavier sites.
 */
import dns from "node:dns/promises";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

const MAX_RESPONSE_BYTES = 5_000_000; // 5MB cap on fetched HTML
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const BLOCK_LEVEL_TAGS =
  "p|div|li|h1|h2|h3|h4|h5|h6|br|tr|blockquote|article|section|header|footer|main|table";

/**
 * Validates a URL is safe to fetch server-side, and returns the specific IP
 * it resolved to — the caller pins the actual connection to this address
 * (see `pinnedFetch`) rather than letting a second DNS lookup happen at
 * connect time, which is what a DNS-rebinding attack needs (a name that
 * resolves to a public IP for this check and a private one moments later,
 * for the real connection).
 */
async function resolveAndValidate(rawUrl: string): Promise<{ url: URL; ip: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http/https URLs are allowed: ${rawUrl}`);
  }

  // URL.hostname keeps the brackets for an IPv6 literal (e.g. "[::1]"),
  // but net.isIP() only recognizes the unbracketed form — strip them before
  // checking, otherwise an IPv6 literal falls through to dns.lookup() and
  // fails closed for the wrong reason (or worse, could resolve unexpectedly
  // in a different DNS environment instead of being caught as a literal).
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
  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
    throw new Error(`URL resolves to a private/internal address, not allowed: ${rawUrl}`);
  }
  return { url, ip: addresses[0] };
}

/**
 * SSRF guard: only http(s), and the resolved IP must not be
 * loopback/private/link-local/reserved. A malicious or careless URL
 * (http://localhost/..., http://169.254.169.254/... cloud metadata, an
 * internal 10.x service) must not be fetchable from this server-side route.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  return (await resolveAndValidate(rawUrl)).url;
}

/**
 * Fetches a URL that's already been through `resolveAndValidate`, pinning
 * the TCP connection to the exact IP that was checked (via undici's
 * `connect.lookup` override) instead of trusting a fresh DNS lookup at
 * connect time.
 *
 * Redirects are followed manually — `redirect: "follow"` would otherwise
 * happily chase a 302 straight to 169.254.169.254 (cloud metadata) or an
 * internal service on a compromised/malicious page, completely bypassing
 * the guard. Each hop re-runs `resolveAndValidate` on the redirect target
 * and re-pins, up to `MAX_REDIRECTS`.
 */
async function pinnedFetch(rawUrl: string): Promise<Response> {
  // One deadline for the whole redirect chain, not one per hop — otherwise
  // a multi-hop chain gets up to MAX_REDIRECTS x FETCH_TIMEOUT_MS instead of
  // the single bounded window a plain fetch(..., {redirect:"follow"}) call
  // would have had.
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    if (hop > MAX_REDIRECTS) throw new Error(`Too many redirects fetching ${rawUrl}`);
    const { url, ip } = await resolveAndValidate(current);
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, _options, callback) => {
          callback(null, [{ address: ip, family: net.isIPv6(ip) ? 6 : 4 }]);
        },
      },
    });
    const res = (await undiciFetch(url, {
      dispatcher,
      redirect: "manual",
      signal,
      headers: { "User-Agent": "AhuraCloudKnowledgeBaseBot/1.0" },
    })) as unknown as Response;

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    return res;
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
    if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.replace("::ffff:", ""));
    return false;
  }
  return true; // unrecognized form — fail closed
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

  // Mark block-level boundaries with newlines before stripping tags, so
  // paragraph structure survives tag removal.
  body = body.replace(new RegExp(`<\\/?(?:${BLOCK_LEVEL_TAGS})[^>]*>`, "gi"), "\n");
  body = body.replace(/<[^>]+>/g, " ");
  body = decodeEntities(body);

  const paragraphs = body
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 40) // drop nav crumbs / short boilerplate
    .filter((line, i, arr) => arr.indexOf(line) === i) // de-dupe repeated boilerplate lines
    .slice(0, 100);

  return { title, paragraphs };
}

export async function fetchAndExtractParagraphs(
  rawUrl: string
): Promise<{ url: string; title: string | null; paragraphs: string[] }> {
  const res = await pinnedFetch(rawUrl);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${rawUrl}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error(`Unsupported content-type "${contentType}" for ${rawUrl} — only HTML/text pages are supported`);
  }

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

  const { title, paragraphs } = extractParagraphs(html);
  if (paragraphs.length === 0) {
    throw new Error(`No readable text extracted from ${rawUrl}`);
  }
  return { url: rawUrl, title, paragraphs };
}
