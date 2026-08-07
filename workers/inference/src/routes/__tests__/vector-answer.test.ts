import { describe, it, expect } from "vitest";
import { answerSchema, buildContext, citationSource, usedCitations } from "../vector-answer.ts";

// Doc: nextstespsAI/04-rag-data-platform.md service #5 — grounded generation
// with citations. Same test-convention as this route family (schema +
// extracted pure-logic tests; see vector-collections.test.ts).

describe("answerSchema", () => {
  it("requires query and model", () => {
    expect(answerSchema.safeParse({}).success).toBe(false);
    expect(answerSchema.safeParse({ query: "x" }).success).toBe(false);
    expect(answerSchema.safeParse({ query: "x", model: "openai/gpt-4o-mini" }).success).toBe(true);
  });

  it("defaults top_k=6, mode=hybrid, rerank=true", () => {
    const r = answerSchema.safeParse({ query: "x", model: "m" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.top_k).toBe(6);
      expect(r.data.mode).toBe("hybrid");
      expect(r.data.rerank).toBe(true);
    }
  });

  it("caps top_k at 20", () => {
    expect(answerSchema.safeParse({ query: "x", model: "m", top_k: 21 }).success).toBe(false);
    expect(answerSchema.safeParse({ query: "x", model: "m", top_k: 20 }).success).toBe(true);
  });

  it("rejects an empty query", () => {
    expect(answerSchema.safeParse({ query: "", model: "m" }).success).toBe(false);
  });
});

const rows = [
  { id: "1", external_id: "faq-1", content: "Refunds are issued within 5 days.", metadata: { source: "faq.md" }, similarity: 0.9 },
  { id: "2", external_id: "faq-2", content: "Shipping normally takes 3 business days.", metadata: {}, similarity: 0.7 },
];

describe("buildContext", () => {
  it("numbers each row and carries a matching citation entry", () => {
    const { block, citations } = buildContext(rows);
    expect(block).toContain("[1] Refunds are issued within 5 days.");
    expect(block).toContain("[2] Shipping normally takes 3 business days.");
    expect(citations).toEqual([
      { marker: 1, document_id: "faq-1", source: "faq.md", snippet: "Refunds are issued within 5 days.", score: 0.9 },
      { marker: 2, document_id: "faq-2", source: "faq-2", snippet: "Shipping normally takes 3 business days.", score: 0.7 },
    ]);
  });
});

// Every ingest path spells the origin differently; the citation must resolve
// all of them instead of falling back to the opaque external_id (found live,
// 2026-07-27: a connector-synced KB cited "conn-<uuid>-<hash>-0").
describe("citationSource — every ingest path's spelling resolves", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["customer upsert", { source: "faq.md" }, "faq.md"],
    ["connector sync", { source_uri: "s3://acme-docs/handbook.pdf" }, "s3://acme-docs/handbook.pdf"],
    ["ingest-url", { source_url: "https://docs.example.com/pricing" }, "https://docs.example.com/pricing"],
    ["ingest-file", { source_file: "handbook.docx" }, "handbook.docx"],
  ];
  for (const [label, metadata, expected] of cases) {
    it(`resolves ${label}`, () => {
      expect(citationSource(metadata, "conn-abc-0")).toBe(expected);
    });
  }

  it("prefers an explicit `source` when several are present", () => {
    expect(citationSource({ source: "a.md", source_uri: "s3://b" }, "ext")).toBe("a.md");
  });

  it("falls back to external_id when metadata carries no origin", () => {
    expect(citationSource({}, "ext-1")).toBe("ext-1");
    expect(citationSource(null, "ext-2")).toBe("ext-2");
    expect(citationSource({ source: "   " }, "ext-3")).toBe("ext-3");
  });
});

describe("usedCitations", () => {
  const all = buildContext(rows).citations;

  it("returns only the citations actually referenced via [n] in the answer", () => {
    const r = usedCitations("Refunds take 5 days [1].", all);
    expect(r).toHaveLength(1);
    expect(r[0]?.marker).toBe(1);
  });

  // Regression guard, found live 2026-07-20: a model correctly declining to
  // answer ("I don't have that information") also cites nothing — returning
  // ALL retrieved-but-irrelevant citations on a "not answered" reply is
  // actively misleading, not a helpful degrade. Empty is the honest result.
  it("returns an empty array when the model cites nothing — never falls back to all", () => {
    const r = usedCitations("The context doesn't contain that information.", all);
    expect(r).toEqual([]);
  });

  it("drops a hallucinated marker outside the retrieved range", () => {
    const r = usedCitations("See [1] and [9].", all);
    expect(r.map((c) => c.marker)).toEqual([1]);
  });

  it("handles multiple distinct references", () => {
    const r = usedCitations("Refunds [1] ship in [2] days.", all);
    expect(r.map((c) => c.marker)).toEqual([1, 2]);
  });
});
