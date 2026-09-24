/**
 * The response cache key must change when the request changes.
 *
 * 2026-09-24: it did not. The key was built with JSON.stringify(obj, keys),
 * and an array as the second argument is a whitelist applied at every depth,
 * so the message objects serialised as `{}`. Every temperature-0 request from
 * an org with the same model, message count and max_tokens shared one key,
 * and a request for a haiku was answered "pong".
 */
import { describe, expect, it } from "vitest";
import { shouldCache, shouldCacheEmbeddings, shouldCacheMessages } from "./cache.ts";

const req = () => new Request("https://api.example/v1/chat/completions", { method: "POST" });
const org = "org-1";

describe("chat/completions cache key", () => {
  it("differs when only the message content differs", async () => {
    const a = await shouldCache(req(), { model: "m", temperature: 0, max_tokens: 20, messages: [{ role: "user", content: "Name one primary colour." }] }, org);
    const b = await shouldCache(req(), { model: "m", temperature: 0, max_tokens: 20, messages: [{ role: "user", content: "What is 6 times 7?" }] }, org);
    expect(a.cacheable && b.cacheable).toBe(true);
    expect(a.key).not.toBe(b.key);
  });

  it("differs when only a message role differs", async () => {
    const a = await shouldCache(req(), { model: "m", temperature: 0, messages: [{ role: "user", content: "x" }] }, org);
    const b = await shouldCache(req(), { model: "m", temperature: 0, messages: [{ role: "system", content: "x" }] }, org);
    expect(a.key).not.toBe(b.key);
  });

  it("is the same for the same request with top-level fields in another order", async () => {
    const a = await shouldCache(req(), { model: "m", temperature: 0, max_tokens: 5, messages: [{ role: "user", content: "x" }] }, org);
    const b = await shouldCache(req(), { messages: [{ role: "user", content: "x" }], max_tokens: 5, temperature: 0, model: "m" }, org);
    expect(a.key).toBe(b.key);
  });

  it("differs between orgs", async () => {
    const body = { model: "m", temperature: 0, messages: [{ role: "user", content: "x" }] };
    const a = await shouldCache(req(), body, "org-1");
    const b = await shouldCache(req(), body, "org-2");
    expect(a.key).not.toBe(b.key);
  });
});

describe("messages and embeddings cache keys", () => {
  it("messages: differ when the content differs, same when the order of top-level fields differs", async () => {
    const a = await shouldCacheMessages(req(), { model: "m", temperature: 0, max_tokens: 5, messages: [{ role: "user", content: "a" }] }, org);
    const b = await shouldCacheMessages(req(), { model: "m", temperature: 0, max_tokens: 5, messages: [{ role: "user", content: "b" }] }, org);
    const c = await shouldCacheMessages(req(), { messages: [{ role: "user", content: "a" }], max_tokens: 5, temperature: 0, model: "m" }, org);
    expect(a.key).not.toBe(b.key);
    expect(a.key).toBe(c.key);
  });

  it("embeddings: differ when the input differs", async () => {
    const a = await shouldCacheEmbeddings(req(), { model: "e", input: "alpha" }, org);
    const b = await shouldCacheEmbeddings(req(), { model: "e", input: "beta" }, org);
    const c = await shouldCacheEmbeddings(req(), { model: "e", input: ["alpha", "beta"] }, org);
    expect(a.key).not.toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });
});
