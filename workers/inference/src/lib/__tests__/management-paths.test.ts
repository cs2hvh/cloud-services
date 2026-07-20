import { describe, it, expect } from "vitest";
import { isManagementRequest } from "../management-paths.ts";

// Doc: found live (2026-07-18) testing against the real stack — Hono's
// .route() doesn't scope "*" middleware per sub-app, so spendCheckMiddleware
// needed an explicit allowlist to exempt agent-management paths. A false
// positive here would let an over-cap org bypass the hard cap entirely, so
// every recognized path AND every excluded (spend-generating) path is
// covered.

const AGENT = "11111111-1111-1111-1111-111111111111";
const KEY = "22222222-2222-2222-2222-222222222222";

describe("isManagementRequest — recognized (spend-check exempt)", () => {
  it.each([
    ["GET", "/v1/agents"],
    ["POST", "/v1/agents"],
    [ "GET", `/v1/agents/${AGENT}` ],
    ["PATCH", `/v1/agents/${AGENT}`],
    ["DELETE", `/v1/agents/${AGENT}`],
    ["DELETE", `/v1/agents/${AGENT}/memories`],
    ["GET", `/v1/agents/${AGENT}/keys`],
    ["POST", `/v1/agents/${AGENT}/keys`],
    ["DELETE", `/v1/agents/${AGENT}/keys/${KEY}`],
    ["POST", `/v1/agents/${AGENT}/keys/${KEY}/rotate`],
    ["GET", "/v1/mcp-servers"],
    ["POST", "/v1/mcp-servers"],
    ["PATCH", `/v1/mcp-servers/${AGENT}`],
    ["DELETE", `/v1/mcp-servers/${AGENT}`],
    ["GET", "/v1/vector/collections"],
    ["GET", `/v1/vector/collections/${AGENT}`],
    ["POST", `/v1/vector/collections/${AGENT}/upsert`],
    ["GET", `/v1/vector/collections/${AGENT}/rows`],
    ["DELETE", `/v1/vector/collections/${AGENT}/rows`],
    ["GET", `/v1/vector/collections/${AGENT}/rows/${KEY}`],
    ["DELETE", `/v1/vector/collections/${AGENT}/rows/${KEY}`],
  ])("%s %s", (method, path) => {
    expect(isManagementRequest(method, path)).toBe(true);
  });
});

describe("isManagementRequest — spend-generating paths must NEVER be exempt", () => {
  it.each([
    ["POST", "/v1/responses"],
    ["POST", `/v1/agents/${AGENT}/runs`],
    ["GET", `/v1/agents/runs/${AGENT}`],
    ["GET", `/v1/agents/runs/${AGENT}/stream`],
    ["POST", `/v1/agents/runs/${AGENT}/cancel`],
    ["POST", "/v1/chat/completions"],
    ["POST", "/v1/embeddings"],
    ["POST", "/v1/images/generations"],
    // nextstespsAI/04-rag-data-platform.md, 2026-07-20 — regression guard for
    // the exact bug this file's header warns about: /query used to be pure,
    // free vector math (correctly exempt), but now supports `rerank:true`
    // and always auto-embeds — both real, metered upstream calls. It was
    // removed from the allowlist above; this assertion is what would have
    // caught the bypass before it shipped. /answer (new, same doc) must
    // never be added to the allowlist either — it's the priciest route in
    // this file (embed + retrieve + rerank + a full chat completion).
    ["POST", `/v1/vector/collections/${AGENT}/query`],
    ["POST", `/v1/vector/collections/${AGENT}/answer`],
  ])("%s %s", (method, path) => {
    expect(isManagementRequest(method, path)).toBe(false);
  });
});

describe("isManagementRequest — method mismatch on an otherwise-recognized path", () => {
  it("rejects a method that isn't registered for that path", () => {
    expect(isManagementRequest("DELETE", "/v1/agents")).toBe(false);
    expect(isManagementRequest("PUT", `/v1/agents/${AGENT}`)).toBe(false);
  });
});
