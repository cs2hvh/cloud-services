// RunPod REST + GraphQL client.
// Centralizes auth, timeouts, retries, and error categorization so callers
// stay focused on business logic.

import axios, { AxiosError, AxiosRequestConfig } from "axios";

import type { RunPodError, RunPodErrorCode } from "./types";

const DEFAULT_REST_URL = "https://rest.runpod.io/v1";
const DEFAULT_GRAPHQL_URL = "https://api.runpod.io/graphql";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

function getApiKey(): string {
    const key = process.env.RUNPOD_API_KEY;
    if (!key) throw new Error("RUNPOD_API_KEY is required");
    return key;
}

function getRestUrl(): string {
    return (process.env.RUNPOD_REST_URL || DEFAULT_REST_URL).replace(/\/+$/, "");
}

function getGraphqlUrl(): string {
    return process.env.RUNPOD_GRAPHQL_URL || DEFAULT_GRAPHQL_URL;
}

function authHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
    };
}

function categorize(status: number | undefined): {
    code: RunPodErrorCode;
    retryable: boolean;
} {
    if (status === undefined) return { code: "TIMEOUT", retryable: true };
    if (status === 401 || status === 403) return { code: "AUTH", retryable: false };
    if (status === 404) return { code: "NOT_FOUND", retryable: false };
    if (status === 409) return { code: "CAPACITY", retryable: false };
    if (status === 429) return { code: "RATE_LIMIT", retryable: true };
    if (status >= 500) return { code: "SERVER", retryable: true };
    if (status >= 400) return { code: "INVALID", retryable: false };
    return { code: "UNKNOWN", retryable: false };
}

function isRunPodError(value: unknown): value is RunPodError {
    return (
        typeof value === "object" &&
        value !== null &&
        "code" in value &&
        "retryable" in value &&
        "message" in value
    );
}

function buildError(err: unknown): RunPodError {
    if (isRunPodError(err)) return err;
    if (axios.isAxiosError(err)) {
        const ax = err as AxiosError<unknown>;
        const status = ax.response?.status;
        const { code, retryable } = categorize(status);
        // RunPod returns errors in several shapes depending on which endpoint /
        // validator path triggered:
        //   { error: "...", message: "..." }
        //   [{ error: "...", problems: [...] }]          ← OpenAPI validator
        //   { errors: [{ message: "..." }] }             ← GraphQL
        // Probe in priority order and fold the validator `problems` array
        // into the message so callers see actionable detail.
        const data = ax.response?.data as unknown;
        let message: string | undefined;
        if (data && typeof data === "object") {
            const obj = data as { error?: string; message?: string; errors?: Array<{ message?: string }> };
            if (Array.isArray(data) && data.length > 0) {
                const first = data[0] as { error?: string; problems?: unknown };
                message = first.error;
                if (first.problems) {
                    message = `${message ?? "validation failed"} — problems: ${JSON.stringify(first.problems).slice(0, 400)}`;
                }
            } else {
                message = obj.error || obj.message;
                if (!message && Array.isArray(obj.errors) && obj.errors[0]?.message) {
                    message = obj.errors[0].message;
                }
            }
        }
        return {
            code,
            status,
            message: message || ax.message || "RunPod request failed",
            retryable,
            raw: data,
        };
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
    let lastErr: RunPodError | undefined;
    while (attempt < MAX_RETRIES) {
        try {
            return await fn();
        } catch (e) {
            const re = buildError(e);
            lastErr = re;
            if (!re.retryable) throw re;
            // 250ms, 750ms, 2250ms with ±25 % jitter.
            const base = 250 * Math.pow(3, attempt);
            const jitter = base * (Math.random() * 0.5 - 0.25);
            await sleep(base + jitter);
            attempt += 1;
        }
    }
    throw lastErr || ({ code: "UNKNOWN", message: "retry exhausted", retryable: false } as RunPodError);
}

export const RunPodClient = {
    /** Authenticated REST call. Returns typed body or throws RunPodError. */
    async rest<T>(
        method: "GET" | "POST" | "PATCH" | "DELETE",
        path: string,
        body?: unknown,
        init?: AxiosRequestConfig
    ): Promise<T> {
        const url = `${getRestUrl()}${path}`;
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

    /** Authenticated GraphQL call. RunPod's GraphQL endpoint accepts the same Bearer token. */
    async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
        return withRetry(async () => {
            try {
                const res = await axios.post<{
                    data?: T;
                    errors?: Array<{ message: string }>;
                }>(
                    getGraphqlUrl(),
                    { query, variables },
                    { headers: authHeaders(), timeout: DEFAULT_TIMEOUT_MS }
                );
                if (res.data.errors && res.data.errors.length > 0) {
                    const message = res.data.errors.map((e) => e.message).join("; ");
                    const err: RunPodError = {
                        code: "INVALID",
                        message,
                        retryable: false,
                        raw: res.data.errors,
                    };
                    throw err;
                }
                if (!res.data.data) {
                    const err: RunPodError = {
                        code: "UNKNOWN",
                        message: "GraphQL response missing data",
                        retryable: false,
                    };
                    throw err;
                }
                return res.data.data;
            } catch (e) {
                throw buildError(e);
            }
        });
    },
};

export { buildError as buildRunPodError };
