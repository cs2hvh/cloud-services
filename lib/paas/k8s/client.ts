/**
 * Kubernetes API client.
 *
 * Speaks to the API server directly over HTTPS with JSON. It never shells out
 * to kubectl — v1 built `kubectl` command lines by string interpolation inside
 * generated Jenkins pipelines, which is how a tenant-controlled app name became
 * a mass-delete via a `grep` sink. There is no shell here to inject into.
 *
 * Server-Side Apply is used for every write, so the reconciler converges
 * declared state instead of issuing imperative create/replace calls that race.
 */

import { request as httpsRequest } from "node:https";
import { readFileSync } from "node:fs";

export interface KubeContext {
  server: string;
  token: string;
  ca: Buffer;
}

export class KubeError extends Error {
  status: number;
  reason: string;
  body: unknown;

  constructor(message: string, status: number, reason: string, body: unknown) {
    super(message);
    this.name = "KubeError";
    this.status = status;
    this.reason = reason;
    this.body = body;
  }
}

/**
 * Parse an LKE kubeconfig.
 *
 * Deliberately narrow: this reads a document produced by Linode's own API, not
 * arbitrary user input, so it extracts the three fields it needs rather than
 * pulling in a YAML parser. It throws if the shape is not what LKE emits.
 */
const SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";

/**
 * In-cluster credentials, as projected by Kubernetes into every pod with a
 * mounted ServiceAccount token.
 *
 * The scheduled sweeps run as pods, where the host kubeconfig this repo uses
 * from a laptop simply does not exist. Returns null rather than throwing so the
 * caller can fall back — but note the distinction the rest of this codebase
 * keeps: null here means "not running in a cluster", NOT "cluster unreachable".
 */
export function inClusterContext(): KubeContext | null {
  try {
    const token = readFileSync(`${SA_DIR}/token`, "utf8").trim();
    const ca = readFileSync(`${SA_DIR}/ca.crt`);
    const host = process.env.KUBERNETES_SERVICE_HOST;
    const port = process.env.KUBERNETES_SERVICE_PORT ?? "443";
    if (!token || !host) return null;
    return { server: `https://${host}:${port}`, token, ca };
  } catch {
    return null;
  }
}

export function loadKubeconfig(path: string): KubeContext {
  const inCluster = inClusterContext();
  if (inCluster) return inCluster;

  const raw = readFileSync(path, "utf8");
  const server = raw.match(/server:\s*(\S+)/)?.[1];
  const token = raw.match(/token:\s*(\S+)/)?.[1];
  const caB64 = raw.match(/certificate-authority-data:\s*(\S+)/)?.[1];

  if (!server || !token || !caB64) {
    throw new Error(
      `[k8s] ${path} is not a recognised LKE kubeconfig ` +
        `(server=${!!server} token=${!!token} ca=${!!caB64})`,
    );
  }
  return { server, token, ca: Buffer.from(caB64, "base64") };
}

interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  contentType?: string;
  /** Tolerate 404 and return null instead of throwing. */
  allowMissing?: boolean;
}

export function kube(ctx: KubeContext) {
  /**
   * Retry transient failures.
   *
   * Every operation this client performs is idempotent — GETs, Server-Side
   * Apply, and scale patches all converge rather than accumulate — so a retry
   * cannot double-apply anything. Worth doing because the reconciler moves
   * production traffic: a 30-second API blip aborted a rollback mid-flight
   * once, leaving the alias updated in the database while the cluster still
   * served the old deployment. Divergence between desired and actual state is
   * exactly what this loop exists to prevent.
   *
   * 5xx and timeouts retry. 4xx does not: a rejected request is rejected.
   */
  async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        const status = e instanceof KubeError ? e.status : undefined;
        const retryable = status === undefined || status >= 500 || status === 429;
        if (!retryable || i === attempts - 1) throw e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** i + Math.floor(Math.random() * 400)));
      }
    }
    throw lastError;
  }

  function rawOnce<T>(opts: RequestOptions): Promise<T | null> {
    const url = new URL(opts.path, ctx.server);
    const payload =
      opts.body === undefined
        ? undefined
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body);

    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: opts.method,
          ca: ctx.ca,
          headers: {
            Authorization: `Bearer ${ctx.token}`,
            Accept: "application/json",
            ...(payload
              ? {
                  "Content-Type": opts.contentType ?? "application/json",
                  "Content-Length": Buffer.byteLength(payload),
                }
              : {}),
          },
          timeout: 45_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const status = res.statusCode ?? 0;
            let parsed: unknown = null;
            try {
              parsed = text ? JSON.parse(text) : null;
            } catch {
              parsed = text;
            }
            if (status === 404 && opts.allowMissing) return resolve(null);
            if (status >= 200 && status < 300) return resolve(parsed as T);
            const p = parsed as { message?: string; reason?: string } | null;
            reject(
              new KubeError(
                `[k8s] ${opts.method} ${opts.path} -> ${status}: ${p?.message ?? String(text).slice(0, 200)}`,
                status,
                p?.reason ?? "Unknown",
                parsed,
              ),
            );
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("kube request timed out")));
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  const raw = <T>(opts: RequestOptions): Promise<T | null> => withRetry(() => rawOnce<T>(opts));

  return {
    raw,

    get: <T>(path: string, allowMissing = false) => raw<T>({ method: "GET", path, allowMissing }),

    /**
     * Server-Side Apply. The field manager makes ownership explicit, so the
     * reconciler can converge a resource repeatedly without fighting other
     * controllers over fields it does not own.
     */
    apply: <T>(path: string, manifest: unknown, fieldManager = "ahura-paas") =>
      raw<T>({
        method: "PATCH",
        path: `${path}?fieldManager=${fieldManager}&force=true`,
        body: manifest,
        contentType: "application/apply-patch+yaml",
      }),

    delete: (path: string, allowMissing = true) => raw({ method: "DELETE", path, allowMissing }),

    /** Liveness of the API server itself. */
    async healthz(): Promise<boolean> {
      try {
        await raw({ method: "GET", path: "/healthz" });
        return true;
      } catch {
        return false;
      }
    },

    async version(): Promise<{ gitVersion: string; platform: string }> {
      return (await raw<{ gitVersion: string; platform: string }>({
        method: "GET",
        path: "/version",
      }))!;
    },

    async listNodes(): Promise<KubeNode[]> {
      const res = await raw<{ items: KubeNode[] }>({ method: "GET", path: "/api/v1/nodes" });
      return res?.items ?? [];
    },

    async listNamespaces(): Promise<Array<{ metadata: { name: string } }>> {
      const res = await raw<{ items: Array<{ metadata: { name: string } }> }>({
        method: "GET",
        path: "/api/v1/namespaces",
      });
      return res?.items ?? [];
    },

    async listPods(namespace: string): Promise<KubePod[]> {
      const res = await raw<{ items: KubePod[] }>({
        method: "GET",
        path: `/api/v1/namespaces/${namespace}/pods`,
      });
      return res?.items ?? [];
    },

    /** Which RuntimeClasses exist — this is how we confirm gVisor is installed. */
    async listRuntimeClasses(): Promise<Array<{ metadata: { name: string }; handler: string }>> {
      const res = await raw<{ items: Array<{ metadata: { name: string }; handler: string }> }>({
        method: "GET",
        path: "/apis/node.k8s.io/v1/runtimeclasses",
        allowMissing: true,
      });
      return res?.items ?? [];
    },
  };
}

export interface KubeNode {
  metadata: { name: string; labels?: Record<string, string> };
  spec?: { taints?: Array<{ key: string; value?: string; effect: string }> };
  status?: {
    conditions?: Array<{ type: string; status: string }>;
    nodeInfo?: { kubeletVersion: string; osImage: string; containerRuntimeVersion: string };
    capacity?: Record<string, string>;
    allocatable?: Record<string, string>;
  };
}

export interface KubePod {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  status?: {
    phase?: string;
    conditions?: Array<{ type: string; status: string }>;
    containerStatuses?: Array<{ ready: boolean; restartCount: number; image: string; imageID?: string }>;
  };
}

export function nodeIsReady(n: KubeNode): boolean {
  return (n.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");
}
