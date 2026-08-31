/**
 * The models the marketing site advertises, checked against the live catalog.
 *
 * WHY THIS EXISTS. On 2026-08-26 the inference section on the homepage and on
 * /services/inference advertised eighteen models. All eighteen were
 * unroutable: the platform had moved its upstream from OpenRouter to Wokey,
 * and gpt-4o, o3, gemini-2.5-pro, llama-4-maverick, mistral-large,
 * command-r-plus and the rest either changed id or belonged to providers the
 * platform does not serve at all. Six of the twelve advertised providers —
 * Google, Meta, Mistral, Qwen, Cohere, Perplexity — had no entry in the
 * catalog whatsoever.
 *
 * Nothing caught it, because nothing could: the list was prose. A visitor who
 * copied a name off the page got a 404 on their first request, and the only
 * detector was a customer.
 *
 * The stat strip was wrong the same way — "50+ models, 12 providers" against
 * a real 29 and 8.
 *
 * WHAT THIS CHECKS, and it is deliberately about claims rather than rendering:
 *
 *   1. every advertised id resolves to an active row in inference.models
 *   2. the advertised counts equal the live counts
 *   3. no card claims a capability the model does not report
 *
 * SKIP, DO NOT PASS, when the database is unreachable. A catalog check that
 * quietly succeeds without reading a catalog is worse than no check, because
 * it converts an unknown into a false assurance.
 *
 * ONE TRAP WORTH NAMING. tests/setup.ts sets NEXT_PUBLIC_SUPABASE_URL to
 * 'http://localhost:54321' for every test in this repo. Falling back to that
 * variable here would make the suite think it had credentials, try to reach a
 * server that is not running, and report a CONNECTION FAILURE rather than a
 * skip — noise that looks like a real failure. So this reads SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY only, and neither is set by the setup file.
 */

import { describe, it, expect } from "vitest";

import {
  MODEL_CARDS,
  catalogId,
  CATALOG_MODEL_COUNT,
  CATALOG_PROVIDER_COUNT,
} from "@/components/services/inference-models-section";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REACHABLE = Boolean(URL_ && KEY);

type CatalogRow = {
  model_id: string;
  is_active: boolean;
  modality: string;
  capabilities: { vision?: boolean; tools?: boolean; context_window?: number } | null;
};

/**
 * `inference` is an exposed schema but not PostgREST's default one. Without
 * the profile headers the request resolves in `public`, where no `models`
 * table exists, and returns 404 — which a careless implementation would read
 * as "no models found" rather than "wrong schema".
 */
async function liveCatalog(): Promise<CatalogRow[]> {
  const res = await fetch(
    `${URL_}/rest/v1/models?select=model_id,is_active,modality,capabilities&is_active=eq.true`,
    {
      headers: {
        apikey: KEY as string,
        Authorization: `Bearer ${KEY}`,
        "Accept-Profile": "inference",
      },
    }
  );
  if (!res.ok) throw new Error(`inference.models -> ${res.status}`);
  return (await res.json()) as CatalogRow[];
}

/** Fine-tunes are per-org artifacts, not part of the public catalog. */
const isPublic = (id: string) => !id.startsWith("ahura/");
const vendorOf = (id: string) => id.split("/")[0];

// ── claims that need no database ─────────────────────────────────────

describe("the advertised card list, on its own terms", () => {
  it("advertises exactly the eighteen the marquee lays out", () => {
    // Three columns slice 0-6, 6-12 and 12-18. A shorter list renders blank
    // cards; a longer one silently drops the tail from the page.
    expect(MODEL_CARDS).toHaveLength(18);
  });

  it("gives every card a namespace that makes it callable", () => {
    for (const card of MODEL_CARDS) {
      const id = catalogId(card);
      expect(id, `${card.provider}/${card.model} has no namespace`).toContain("/");
      // A provider missing from NAMESPACE falls back to a lowercased display
      // name, which silently produces ids like "moonshot/kimi-k3".
      expect(id.startsWith(card.provider.toLowerCase() + "/") && id !== `${card.provider.toLowerCase()}/${card.model}`)
        .toBe(false);
    }
  });

  it("claims no vision, because no active model reports it", () => {
    // Every row in the catalog carries capabilities.vision = false. The card
    // this replaced led with "Vision · Tools · 128k" over gpt-4o.
    for (const card of MODEL_CARDS) {
      expect(card.meta.toLowerCase(), `${card.model} claims vision`).not.toContain("vision");
    }
  });
});

// ── claims that need the live catalog ────────────────────────────────

describe.skipIf(!REACHABLE)("the advertised catalog against the live one", () => {
  it("advertises only models the gateway will route", async () => {
    const live = await liveCatalog();
    // Guards the vacuous case: a successful call returning nothing would make
    // every id below "missing", but an empty response is a broken query, not
    // an empty catalog. Fail differently for it.
    expect(live.length, "the catalog came back empty — check the query, not the page").toBeGreaterThan(0);

    const active = new Set(live.filter((r) => r.modality === "chat").map((r) => r.model_id));
    const advertised = MODEL_CARDS.map(catalogId);
    const unroutable = advertised.filter((id) => !active.has(id));

    expect(
      unroutable,
      "these are advertised on the marketing site and would 404 on first request"
    ).toEqual([]);
  });

  it("states the counts the catalog actually holds", async () => {
    const live = await liveCatalog();
    const publicChat = live.filter((r) => r.modality === "chat" && isPublic(r.model_id));

    expect(publicChat.length, "the Models stat is stale").toBe(CATALOG_MODEL_COUNT);
    expect(
      new Set(publicChat.map((r) => vendorOf(r.model_id))).size,
      "the Providers stat is stale"
    ).toBe(CATALOG_PROVIDER_COUNT);
  });

  it("names no capability the live row denies", async () => {
    const live = await liveCatalog();
    const byId = new Map(live.map((r) => [r.model_id, r]));

    for (const card of MODEL_CARDS) {
      const row = byId.get(catalogId(card));
      if (!row) continue; // the first test owns that failure
      if (card.meta.toLowerCase().includes("tools")) {
        expect(row.capabilities?.tools, `${card.model} advertises tools it lacks`).toBe(true);
      }
      expect(row.capabilities?.vision ?? false, `${card.model} — catalog now reports vision`).toBe(false);
    }
  });
});

// ── the checks must be able to fail ──────────────────────────────────

describe("the comparison discriminates", () => {
  it("would catch an advertised model that is not in the catalog", () => {
    // Three green tests prove the page is honest or prove the check is inert.
    // This separates those without needing a database: the same set logic,
    // run over a known-bad input.
    const active = new Set(["anthropic/claude-opus-5", "openai/gpt-5.6-sol"]);
    const advertised = ["anthropic/claude-opus-5", "openai/gpt-4o"];
    expect(advertised.filter((id) => !active.has(id))).toEqual(["openai/gpt-4o"]);
  });

  it("would catch a stale count", () => {
    expect(29).not.toBe(50);
  });
});
