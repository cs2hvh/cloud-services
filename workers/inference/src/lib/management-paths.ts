/**
 * Recognizes the agent-MANAGEMENT paths (agent-management.ts, mcp-servers.ts,
 * vector-collections.ts) — control-plane operations that don't spend money
 * themselves, as opposed to run-execution paths (POST /v1/agents/:id/runs,
 * /v1/responses, ...) which do.
 *
 * Found live (2026-07-18), testing against the real stack: mounting the
 * management routes as a second Hono() instance via a second
 * `app.route("/v1", v1Management)` call does NOT give them an isolated
 * middleware scope — Hono's `.route()` flattens a sub-app's routes
 * (including its `.use("*", ...)` registrations) into the PARENT's one flat
 * routing table (see node_modules/hono/dist/hono-base.js's `route()`), so
 * the original `v1` group's `.use("*", spendCheckMiddleware)` still matches
 * every path under `/v1/*`, management routes included — the "separate
 * group so an over-cap org can still delete a runaway agent" design intent
 * silently didn't hold. There is no way to scope a wildcard middleware to
 * one sub-app when two apps share a path prefix; the only fix is to make
 * the wildcard middleware itself path-aware, which is what this file is for.
 *
 * Deliberately an ALLOWLIST of exact (method, path-shape) pairs, not a
 * broad prefix match — a false positive here (exempting a path that DOES
 * spend money) would let an over-cap org bypass the hard cap entirely.
 */

interface Route {
  method: string;
  // Regex anchored on both ends by the caller.
  pattern: RegExp;
}

const UUID = "[^/]+"; // path params aren't validated here — isUuid() rejects malformed ones downstream

const MANAGEMENT_ROUTES: Route[] = [
  { method: "GET", pattern: new RegExp(`^/v1/agents$`) },
  { method: "POST", pattern: new RegExp(`^/v1/agents$`) },
  { method: "GET", pattern: new RegExp(`^/v1/agents/${UUID}$`) },
  { method: "PATCH", pattern: new RegExp(`^/v1/agents/${UUID}$`) },
  { method: "DELETE", pattern: new RegExp(`^/v1/agents/${UUID}$`) },
  { method: "DELETE", pattern: new RegExp(`^/v1/agents/${UUID}/memories$`) },
  { method: "GET", pattern: new RegExp(`^/v1/agents/${UUID}/keys$`) },
  { method: "POST", pattern: new RegExp(`^/v1/agents/${UUID}/keys$`) },
  { method: "DELETE", pattern: new RegExp(`^/v1/agents/${UUID}/keys/${UUID}$`) },
  { method: "POST", pattern: new RegExp(`^/v1/agents/${UUID}/keys/${UUID}/rotate$`) },
  { method: "GET", pattern: new RegExp(`^/v1/mcp-servers$`) },
  { method: "POST", pattern: new RegExp(`^/v1/mcp-servers$`) },
  { method: "PATCH", pattern: new RegExp(`^/v1/mcp-servers/${UUID}$`) },
  { method: "DELETE", pattern: new RegExp(`^/v1/mcp-servers/${UUID}$`) },
  { method: "GET", pattern: new RegExp(`^/v1/vector/collections$`) },
  { method: "GET", pattern: new RegExp(`^/v1/vector/collections/${UUID}$`) },
  // POST .../query is deliberately NOT here (nextstespsAI/04-rag-data-
  // platform.md, 2026-07-20): it used to be pure vector math (genuinely
  // free), which is why it was originally allowlisted — but it now supports
  // `rerank:true` (real money: calls the rerank model) and auto-embed on
  // every call (real money: an upstream embeddings call), so it must go
  // through the normal spend-cap gate like any other paid route. Exempting
  // it would be exactly the "false positive" this file's own header warns
  // against — an over-cap org could otherwise spam reranked search forever.
  // POST .../answer (the new grounded-generation endpoint, same doc) was
  // never added here either, for the same reason.
  { method: "POST", pattern: new RegExp(`^/v1/vector/collections/${UUID}/upsert$`) },
  { method: "GET", pattern: new RegExp(`^/v1/vector/collections/${UUID}/rows$`) },
  { method: "DELETE", pattern: new RegExp(`^/v1/vector/collections/${UUID}/rows$`) },
  { method: "GET", pattern: new RegExp(`^/v1/vector/collections/${UUID}/rows/${UUID}$`) },
  { method: "DELETE", pattern: new RegExp(`^/v1/vector/collections/${UUID}/rows/${UUID}$`) },
];

/** Deliberately excludes /v1/agents/:id/runs (POST) and /v1/agents/runs/*
 *  — those enqueue or read a run, which is exactly the spend-generating
 *  path spendCheckMiddleware exists to gate. */
export function isManagementRequest(method: string, path: string): boolean {
  return MANAGEMENT_ROUTES.some((r) => r.method === method && r.pattern.test(path));
}
