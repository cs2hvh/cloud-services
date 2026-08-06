// @vitest-environment node
//
// pdfjs-dist's Node ("legacy") build silently extracts no text under jsdom
// (the suite's default environment) — it needs real Node, same as the
// production route handler runs in. Scoped here instead of changing the
// global config since every other suite is fine under jsdom.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chunkPlainText, isSupportedFilename, extractDocumentText } from "@/lib/inference/doc-ingest";

// Doc: covers the file-upload RAG feature added to
// /api/inference/vector/collections/[id]/ingest-file. PDF/DOCX extraction
// is exercised with tiny real fixtures (no mocking pdfjs-dist/mammoth
// internals) so a broken import path or API-shape change actually fails
// this suite instead of passing silently.

describe("isSupportedFilename", () => {
  it.each(["doc.pdf", "doc.PDF", "doc.docx", "notes.txt", "notes.md"])("accepts %s", (name) => {
    expect(isSupportedFilename(name)).toBe(true);
  });

  it.each(["doc.exe", "doc.zip", "doc", "doc.pptx"])("rejects %s", (name) => {
    expect(isSupportedFilename(name)).toBe(false);
  });
});

describe("chunkPlainText", () => {
  it("splits on blank lines and drops short boilerplate", () => {
    const text = [
      "Title",
      "",
      "We ship domestically within 1-2 business days of order confirmation.",
      "",
      "International orders take 7-14 business days and may incur customs fees.",
    ].join("\n");
    const paragraphs = chunkPlainText(text);
    expect(paragraphs).toContain("We ship domestically within 1-2 business days of order confirmation.");
    expect(paragraphs).toContain("International orders take 7-14 business days and may incur customs fees.");
    expect(paragraphs).not.toContain("Title");
  });

  it("de-dupes repeated paragraphs", () => {
    const text = `${"a".repeat(50)}\n\n${"a".repeat(50)}\n\n${"b".repeat(50)}`;
    expect(chunkPlainText(text)).toEqual(["a".repeat(50), "b".repeat(50)]);
  });

  it("caps output at 100 paragraphs", () => {
    const text = Array.from({ length: 150 }, (_, i) => `${"x".repeat(45)}-${i}`).join("\n\n");
    expect(chunkPlainText(text).length).toBe(100);
  });
});

describe("extractDocumentText — plain text/markdown", () => {
  it("extracts and chunks a .txt buffer", async () => {
    const buffer = Buffer.from(
      "Our refund policy allows returns within 30 days of purchase.\n\nShipping is free for all orders over fifty dollars."
    );
    const { paragraphs } = await extractDocumentText("policy.txt", buffer);
    expect(paragraphs).toContain("Our refund policy allows returns within 30 days of purchase.");
    expect(paragraphs).toContain("Shipping is free for all orders over fifty dollars.");
  });

  it("throws a clear error for an empty file", async () => {
    await expect(extractDocumentText("empty.md", Buffer.from(""))).rejects.toThrow(/no readable text/i);
  });

  it("throws a clear error for an unsupported extension", async () => {
    await expect(extractDocumentText("archive.zip", Buffer.from("junk"))).rejects.toThrow(/unsupported file type/i);
  });
});

describe("extractDocumentText — PDF", () => {
  // Minimal hand-built single-page PDF (no external PDF-writer dependency)
  // containing the text "Hello E2E PDF test paragraph content here now".
  const MINIMAL_PDF = Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 600 300]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj",
      "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
      "5 0 obj<</Length 76>>stream",
      "BT /F1 18 Tf 10 100 Td (Hello E2E PDF test paragraph content here now) Tj ET",
      "endstream",
      "endobj",
      "xref",
      "0 6",
      "0000000000 65535 f ",
      "trailer<</Size 6/Root 1 0 R>>",
      "startxref",
      "0",
      "%%EOF",
    ].join("\n")
  );

  it("extracts text from a real PDF via pdfjs-dist", async () => {
    const { paragraphs } = await extractDocumentText("notes.pdf", MINIMAL_PDF);
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs[0]).toContain("Hello E2E PDF test");
  });
});

describe("extractDocumentText — DOCX", () => {
  it("extracts text from a real DOCX via mammoth", async () => {
    // mammoth.embedStyleMap / round-trip helpers aren't exposed for
    // generating a .docx in-test, so build the minimal valid docx zip by
    // hand: a document.xml with one paragraph inside the required OOXML
    // package structure.
    const JSZipMod = await import("jszip");
    const JSZip = JSZipMod.default;
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    );
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Refunds are accepted within thirty days of the original purchase date.</w:t></w:r></w:p>
  </w:body>
</w:document>`
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const { paragraphs } = await extractDocumentText("policy.docx", buffer);
    expect(paragraphs.some((p: string) => p.includes("Refunds are accepted within thirty days"))).toBe(true);
  });
});

describe("the two ingestion paths must accept the same file types", () => {
  // A dashboard upload and a connector sync are the same product to a customer.
  // They disagreed: a .html file synced from an S3 bucket indexed fine, while
  // uploading the identical file was rejected as an unsupported type. Nothing
  // linked the two lists, so nothing caught it.
  //
  // This reads the runner's list from source rather than restating it, so the
  // check cannot rot into a copy that agrees with itself.
  const runnerSource = readFileSync(
    join(process.cwd(), "workers/data-runner/src/ingest/extract.ts"),
    "utf8"
  );
  const runnerTextExtensions = (runnerSource.match(/TEXT_EXTENSIONS = \[([^\]]*)\]/) ?? ["", ""])[1]
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  it("the runner's list was actually parsed (guards against a silent regex miss)", () => {
    expect(runnerTextExtensions.length).toBeGreaterThan(3);
    expect(runnerTextExtensions).toContain(".pdf");
  });

  it("every text type the runner can ingest is also accepted on upload", () => {
    for (const ext of runnerTextExtensions) {
      expect(isSupportedFilename(`file${ext}`), `${ext} accepted by the runner but not on upload`).toBe(true);
    }
  });

  it("html is tag-stripped rather than indexed as raw markup", async () => {
    const html = `<html><body><nav>Home About Contact</nav><p>${"The Pro plan includes a 99.9% uptime guarantee measured monthly. ".repeat(2)}</p></body></html>`;
    const { paragraphs } = await extractDocumentText("terms.html", Buffer.from(html, "utf-8"));
    expect(paragraphs.join(" ")).not.toContain("<p>");
    expect(paragraphs.join(" ")).toContain("uptime guarantee");
  });

  it("json is accepted and kept verbatim", async () => {
    const body = JSON.stringify({ note: "x".repeat(60), other: "y".repeat(60) }, null, 2);
    const { paragraphs } = await extractDocumentText("data.json", Buffer.from(body, "utf-8"));
    expect(paragraphs.length).toBeGreaterThan(0);
  });

  it("a text-less document tells the customer where OCR IS available", async () => {
    // The remaining difference between the paths is deliberate — the control
    // plane has no platform key to call /v1/ocr with — so the error has to
    // point at the path that does, instead of dead-ending.
    await expect(extractDocumentText("scan.txt", Buffer.from("", "utf-8"))).rejects.toThrow(/connector/i);
  });
});
