// OVH API HTTP client with signed requests.
//
// OVH uses a three-credential auth scheme:
//   - Application Key (AK)
//   - Application Secret (AS)
//   - Consumer Key (CK)  — one per account, generated via /auth/credential
//
// Every request is signed with SHA-1 over a canonical string. The OVH
// server checks the signature against its own clock with a small
// tolerance, so we sync against /auth/time (no auth needed) and cache
// the offset between local and OVH time for 5 minutes.

import crypto from "crypto";

export type OvhRegion = "ovh-eu" | "ovh-ca" | "ovh-us";

const ENDPOINTS: Record<OvhRegion, string> = {
    "ovh-eu": "https://eu.api.ovh.com/1.0",
    "ovh-ca": "https://ca.api.ovh.com/1.0",
    "ovh-us": "https://api.us.ovhcloud.com/1.0",
};

export type OvhCredentials = {
    appKey: string;
    appSecret: string;
    consumerKey: string;
    region: OvhRegion;
};

export class OvhConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OvhConfigError";
    }
}

export class OvhApiError extends Error {
    status: number;
    body: string;
    method: string;
    path: string;
    constructor(
        method: string,
        path: string,
        status: number,
        body: string
    ) {
        super(`OVH ${method} ${path} -> ${status}: ${body}`);
        this.name = "OvhApiError";
        this.method = method;
        this.path = path;
        this.status = status;
        this.body = body;
    }
}

/**
 * Reads credentials from environment. Accepts BOTH common naming
 * conventions used in the OVH ecosystem:
 *
 *   OVH_APP_KEY     or OVH_APPLICATION_KEY     (Node SDK / Python SDK)
 *   OVH_APP_SECRET  or OVH_APPLICATION_SECRET
 *   OVH_CONSUMER_KEY
 *   OVH_API_ENDPOINT=ovh-eu | ovh-ca | ovh-us    (defaults to ovh-eu)
 *
 * Surrounding quotes (single or double) are stripped so values can
 * be written either as `OVH_APP_KEY=abc` or `OVH_APP_KEY='abc'`.
 */
export function readOvhCredentialsFromEnv(): OvhCredentials {
    const clean = (v: string | undefined): string | undefined => {
        if (!v) return undefined;
        const trimmed = v.trim();
        if (
            (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    };

    const appKey =
        clean(process.env.OVH_APP_KEY) ?? clean(process.env.OVH_APPLICATION_KEY);
    const appSecret =
        clean(process.env.OVH_APP_SECRET) ??
        clean(process.env.OVH_APPLICATION_SECRET);
    const consumerKey = clean(process.env.OVH_CONSUMER_KEY);
    const region =
        (clean(process.env.OVH_API_ENDPOINT) as OvhRegion) || "ovh-eu";

    const missing: string[] = [];
    if (!appKey) missing.push("OVH_APP_KEY (or OVH_APPLICATION_KEY)");
    if (!appSecret) missing.push("OVH_APP_SECRET (or OVH_APPLICATION_SECRET)");
    if (!consumerKey) missing.push("OVH_CONSUMER_KEY");
    if (missing.length > 0) {
        throw new OvhConfigError(
            `OVH credentials missing in env: ${missing.join(", ")}. ` +
                `Create them at https://api.ovh.com/createToken/ with rights:\n` +
                `  GET    /dedicated/server/*/ips\n` +
                `  GET    /dedicated/server/*/virtualMac\n` +
                `  GET    /dedicated/server/*/virtualMac/*\n` +
                `  POST   /dedicated/server/*/virtualMac\n` +
                `  DELETE /dedicated/server/*/virtualMac/*\n` +
                `  GET    /dedicated/server/*/task/*`
        );
    }
    if (!ENDPOINTS[region]) {
        throw new OvhConfigError(
            `Unknown OVH_API_ENDPOINT "${region}" — expected one of: ${Object.keys(ENDPOINTS).join(", ")}`
        );
    }
    return { appKey: appKey!, appSecret: appSecret!, consumerKey: consumerKey!, region };
}

/** Returns the base URL for the given OVH region. */
export function ovhBaseUrl(region: OvhRegion): string {
    return ENDPOINTS[region];
}

// ─── Clock-skew sync ─────────────────────────────────────────────
// OVH validates timestamps with ~30s tolerance. If the local machine
// drifts, signatures fail. We fetch OVH's clock once and cache the
// offset for 5 minutes.
let cachedClockOffsetMs = 0;
let lastOffsetSyncAt = 0;
const OFFSET_TTL_MS = 5 * 60 * 1000;

async function ovhTimestampSeconds(baseUrl: string): Promise<number> {
    const now = Date.now();
    if (lastOffsetSyncAt === 0 || now - lastOffsetSyncAt > OFFSET_TTL_MS) {
        const res = await fetch(`${baseUrl}/auth/time`);
        if (!res.ok) {
            throw new OvhApiError(
                "GET",
                "/auth/time",
                res.status,
                await res.text().catch(() => "")
            );
        }
        const ovhSec = parseInt(await res.text(), 10);
        const localSec = Math.floor(Date.now() / 1000);
        cachedClockOffsetMs = (ovhSec - localSec) * 1000;
        lastOffsetSyncAt = Date.now();
    }
    return Math.floor((Date.now() + cachedClockOffsetMs) / 1000);
}

// ─── Signed request ──────────────────────────────────────────────
type Method = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Make a signed request to the OVH API.
 *
 * Path should be the URI segment after /1.0 (e.g. "/dedicated/server").
 * For typed callers, prefer the helpers in dedicated-server.ts.
 */
export async function ovhRequest<T = unknown>(
    creds: OvhCredentials,
    method: Method,
    path: string,
    body?: unknown
): Promise<T> {
    const baseUrl = ENDPOINTS[creds.region];
    const url = `${baseUrl}${path}`;
    const ts = await ovhTimestampSeconds(baseUrl);
    const bodyStr = body !== undefined ? JSON.stringify(body) : "";

    // Canonical signing string:
    //   AS + "+" + CK + "+" + METHOD + "+" + URL + "+" + BODY + "+" + TS
    const toSign = `${creds.appSecret}+${creds.consumerKey}+${method}+${url}+${bodyStr}+${ts}`;
    const signature =
        "$1$" + crypto.createHash("sha1").update(toSign).digest("hex");

    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Ovh-Application": creds.appKey,
            "X-Ovh-Consumer": creds.consumerKey,
            "X-Ovh-Timestamp": String(ts),
            "X-Ovh-Signature": signature,
        },
        body: bodyStr ? bodyStr : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new OvhApiError(method, path, res.status, text);
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return (await res.json()) as T;
    }
    const text = await res.text();
    return text as unknown as T;
}

// ─── Service name extraction ─────────────────────────────────────
/**
 * Given a Proxmox host_url like
 *   https://ns5028607.ip-148-113-49.net:8006
 * extract the OVH service name:
 *   ns5028607.ip-148-113-49.net
 *
 * Returns null if the URL isn't an OVH-style hostname.
 */
export function extractOvhServiceName(hostUrl: string): string | null {
    try {
        const u = new URL(hostUrl);
        const host = u.hostname;
        // OVH dedicated server FQDNs look like nsNNNNNNN.ip-X-Y-Z.net
        if (/^ns\d+\.ip-/i.test(host)) return host;
        return null;
    } catch {
        return null;
    }
}
