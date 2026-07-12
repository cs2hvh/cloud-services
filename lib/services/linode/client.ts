// Linode API v4 client.
// Centralizes auth, timeouts, retries, pagination, and error categorization so
// callers stay focused on business logic. Mirrors lib/services/runpod/client.ts.

import axios, { AxiosError, AxiosRequestConfig } from "axios";

import type { LinodeError, LinodeErrorCode, LinodePage } from "./types";

const DEFAULT_API_URL = "https://api.linode.com/v4";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;
const MAX_PAGE_SIZE = 500;

function getToken(): string {
    const token = process.env.LINODE_TOKEN;
    if (!token) throw new Error("LINODE_TOKEN is required");
    return token;
}

function getApiUrl(): string {
    return (process.env.LINODE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
    };
}

function categorize(status: number | undefined): {
    code: LinodeErrorCode;
    retryable: boolean;
} {
    if (status === undefined) return { code: "TIMEOUT", retryable: true };
    if (status === 401 || status === 403) return { code: "AUTH", retryable: false };
    if (status === 404) return { code: "NOT_FOUND", retryable: false };
    if (status === 429) return { code: "RATE_LIMIT", retryable: true };
    if (status >= 500) return { code: "SERVER", retryable: true };
    if (status >= 400) return { code: "INVALID", retryable: false };
    return { code: "UNKNOWN", retryable: false };
}

function isLinodeError(value: unknown): value is LinodeError {
    return (
        typeof value === "object" &&
        value !== null &&
        "code" in value &&
        "retryable" in value &&
        "message" in value
    );
}

/** Capacity/availability failures arrive as 400s whose reason mentions capacity. */
function looksLikeCapacity(reasons: Array<{ reason: string }>): boolean {
    return reasons.some((r) =>
        /capacity|sold out|unavailable|not available in this region/i.test(r.reason)
    );
}

function buildError(err: unknown): LinodeError {
    if (isLinodeError(err)) return err;
    if (axios.isAxiosError(err)) {
        const ax = err as AxiosError<unknown>;
        const status = ax.response?.status;
        const { retryable } = categorize(status);
        let { code } = categorize(status);

        // Linode error body: { errors: [{ reason, field? }] }
        const data = ax.response?.data as { errors?: Array<{ reason: string; field?: string }> } | undefined;
        const reasons = Array.isArray(data?.errors) ? data.errors : undefined;
        if (code === "INVALID" && reasons && looksLikeCapacity(reasons)) {
            code = "CAPACITY";
        }

        const message = reasons?.length
            ? reasons.map((e) => (e.field ? `${e.field}: ${e.reason}` : e.reason)).join("; ")
            : ax.message || "Linode request failed";

        // Respect Retry-After on 429 so withRetry can wait the mandated period.
        const retryAfterHeader = ax.response?.headers?.["retry-after"];
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;

        const error: LinodeError & { retryAfterMs?: number } = {
            code,
            status,
            message,
            retryable,
            reasons,
            raw: data,
        };
        if (retryAfterMs && Number.isFinite(retryAfterMs)) error.retryAfterMs = retryAfterMs;
        return error;
    }
    return {
        code: "UNKNOWN",
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
        raw: err,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastErr: LinodeError | undefined;
    while (attempt < MAX_RETRIES) {
        try {
            return await fn();
        } catch (e) {
            const le = buildError(e) as LinodeError & { retryAfterMs?: number };
            lastErr = le;
            if (!le.retryable) throw le;
            // 250ms, 750ms, 2250ms with ±25 % jitter — but honor Retry-After when present.
            const base = le.retryAfterMs ?? 250 * Math.pow(3, attempt);
            const jitter = le.retryAfterMs ? 0 : base * (Math.random() * 0.5 - 0.25);
            await sleep(base + jitter);
            attempt += 1;
        }
    }
    throw lastErr || ({ code: "UNKNOWN", message: "retry exhausted", retryable: false } as LinodeError);
}

export const LinodeClient = {
    /** Authenticated call. Returns typed body or throws LinodeError. */
    async request<T>(
        method: "GET" | "POST" | "PUT" | "DELETE",
        path: string,
        body?: unknown,
        init?: AxiosRequestConfig
    ): Promise<T> {
        const url = `${getApiUrl()}${path}`;
        return withRetry(async () => {
            try {
                const res = await axios.request<T>({
                    method,
                    url,
                    data: body,
                    headers: authHeaders(),
                    timeout: DEFAULT_TIMEOUT_MS,
                    ...init,
                });
                return res.data;
            } catch (e) {
                throw buildError(e);
            }
        });
    },

    get<T>(path: string, init?: AxiosRequestConfig): Promise<T> {
        return this.request<T>("GET", path, undefined, init);
    },

    post<T>(path: string, body?: unknown, init?: AxiosRequestConfig): Promise<T> {
        return this.request<T>("POST", path, body, init);
    },

    put<T>(path: string, body?: unknown, init?: AxiosRequestConfig): Promise<T> {
        return this.request<T>("PUT", path, body, init);
    },

    delete<T>(path: string, init?: AxiosRequestConfig): Promise<T> {
        return this.request<T>("DELETE", path, undefined, init);
    },

    /**
     * Drain a collection endpoint. Most return the `{data, page, pages}`
     * envelope; a few (e.g. GET /regions/{id}/availability) return a RAW
     * ARRAY with no pagination — both shapes are handled.
     */
    async getAllPages<T>(path: string): Promise<T[]> {
        const sep = path.includes("?") ? "&" : "?";
        const out: T[] = [];
        let page = 1;
        let pages = 1;
        do {
            const res = await this.get<LinodePage<T> | T[]>(
                `${path}${sep}page=${page}&page_size=${MAX_PAGE_SIZE}`
            );
            if (Array.isArray(res)) {
                out.push(...res);
                break; // bare-array responses are never paginated
            }
            out.push(...(res.data ?? []));
            pages = res.pages ?? 1;
            page += 1;
        } while (page <= pages);
        return out;
    },
};

export { buildError as buildLinodeError };
