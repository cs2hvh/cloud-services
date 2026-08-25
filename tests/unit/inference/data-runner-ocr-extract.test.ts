import { describe, expect, it } from "vitest";
import { extractText, isSupportedKey } from "@/workers/data-runner/src/ingest/extract";

function pdfWithContentStream(stream: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("data-runner OCR extraction fallback", () => {
  it("OCRs a text-less PDF when OCR is configured", async () => {
    const calls: Array<{ mime: string; bytes: number }> = [];
    const text = await extractText("scan.pdf", pdfWithContentStream(""), {
      minChars: 20,
      fn: async (bytes, mime) => {
        calls.push({ mime, bytes: bytes.length });
        return "OCR TEXT: scanned invoice total is four hundred dollars.";
      },
    });

    expect(text).toContain("scanned invoice");
    expect(calls).toEqual([{ mime: "application/pdf", bytes: expect.any(Number) }]);
  });

  it("does not OCR a normal text PDF above the threshold", async () => {
    const calls: string[] = [];
    const text = await extractText(
      "doc.pdf",
      pdfWithContentStream("BT /F1 12 Tf 72 720 Td (Real text layer with enough characters.) Tj ET"),
      {
        minChars: 20,
        fn: async (_bytes, mime) => {
          calls.push(mime);
          return "unexpected OCR text";
        },
      }
    );

    expect(text).toContain("Real text layer");
    expect(calls).toEqual([]);
  });

  it("OCRs image objects only when OCR is enabled", async () => {
    const bytes = Buffer.from([1, 2, 3]);
    await expect(extractText("receipt.png", bytes)).resolves.toBe("");
    await expect(
      extractText("receipt.png", bytes, {
        minChars: 20,
        fn: async (_bytes, mime) => `ocr from ${mime}`,
      })
    ).resolves.toBe("ocr from image/png");

    expect(isSupportedKey("receipt.png", false)).toBe(false);
    expect(isSupportedKey("receipt.png", true)).toBe(true);
    expect(isSupportedKey("handbook.pdf", false)).toBe(true);
  });
});
