import { describe, it, expect, vi, afterEach } from "vitest";

const dnsLookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({
  default: { lookup: (...args: unknown[]) => dnsLookupMock(...args) },
  lookup: (...args: unknown[]) => dnsLookupMock(...args),
}));

// fetchAndExtractParagraphs calls undici's fetch directly (not global fetch)
// so it can pin the connection to a pre-validated IP — see pinnedFetch in
// url-ingest.ts. Agent is stubbed since these tests never make a real
// connection; only its constructor needs to not throw.
const undiciFetchMock = vi.fn();
vi.mock("undici", () => ({
  Agent: class {},
  fetch: (...args: unknown[]) => undiciFetchMock(...args),
}));

const { extractParagraphs, assertPublicHttpUrl, fetchAndExtractParagraphs } = await import("@/lib/inference/url-ingest");

// Doc: covers the URL-ingest RAG feature added to
// /api/inference/vector/collections/[id]/ingest-url. No real network calls —
// same convention as the gateway's fake-context tests: pure logic + mocked
// fetch/dns, no live Supabase or upstream requests.

function fakeHtmlResponse(html: string, contentType = "text/html"): Response {
  let done = false;
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType }),
    body: {
      getReader: () => ({
        read: async () => {
          if (done) return { done: true, value: undefined };
          done = true;
          return { done: false, value: new TextEncoder().encode(html) };
        },
        cancel: async () => {},
      }),
    },
  } as unknown as Response;
}

function fakeRedirect(location: string): Response {
  return { ok: false, status: 302, headers: new Headers({ location }) } as unknown as Response;
}

describe("extractParagraphs", () => {
  it("pulls real content paragraphs and drops nav/script/footer noise", () => {
    const html = `
      <html><head><title>Shipping FAQ</title></head>
      <body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <h1>Shipping Policy</h1>
        <p>We ship domestically within 1-2 business days of order confirmation to all US addresses.</p>
        <p>International orders take 7-14 business days and may be subject to customs fees.</p>
        <script>console.log("tracking pixel junk")</script>
        <footer>Copyright 2026</footer>
      </body></html>
    `;
    const { title, paragraphs } = extractParagraphs(html);
    expect(title).toBe("Shipping FAQ");
    expect(paragraphs).toContain(
      "We ship domestically within 1-2 business days of order confirmation to all US addresses."
    );
    expect(paragraphs).toContain(
      "International orders take 7-14 business days and may be subject to customs fees."
    );
    expect(paragraphs.some((p: string) => p.includes("tracking pixel junk"))).toBe(false);
    expect(paragraphs.some((p: string) => p.includes("Copyright"))).toBe(false);
  });

  it("drops short boilerplate lines (nav crumbs, single links) below the length floor", () => {
    const html = `<body><p>Home</p><p>About</p><p>${"x".repeat(45)}</p></body>`;
    const { paragraphs } = extractParagraphs(html);
    expect(paragraphs).toEqual(["x".repeat(45)]);
  });

  it("de-dupes repeated boilerplate lines", () => {
    const html = `<body><p>${"a".repeat(50)}</p><p>${"a".repeat(50)}</p><p>${"b".repeat(50)}</p></body>`;
    const { paragraphs } = extractParagraphs(html);
    expect(paragraphs).toEqual(["a".repeat(50), "b".repeat(50)]);
  });

  it("decodes HTML entities", () => {
    const html = `<body><p>${"Ben &amp; Jerry&#39;s ships in 3-5 days ".repeat(2)}</p></body>`;
    const { paragraphs } = extractParagraphs(html);
    expect(paragraphs[0]).toContain("Ben & Jerry's");
    expect(paragraphs[0]).not.toContain("&amp;");
  });

  it("caps output at 100 paragraphs", () => {
    const html = `<body>${Array.from({ length: 150 }, (_, i) => `<p>${"x".repeat(45)}-${i}</p>`).join("")}</body>`;
    const { paragraphs } = extractParagraphs(html);
    expect(paragraphs.length).toBe(100);
  });
});

describe("assertPublicHttpUrl (SSRF guard)", () => {
  const privateTargets = [
    "http://127.0.0.1/secret",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata endpoint
    "http://10.0.0.5/internal",
    "http://172.16.0.1/internal",
    "http://192.168.1.1/",
    "http://[::1]/",
  ];

  it.each(privateTargets)("blocks private/internal target %s", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toThrow(/private|internal/i);
  });

  it("blocks non-http(s) schemes", async () => {
    await expect(assertPublicHttpUrl("ftp://example.com/file")).rejects.toThrow(/http\/https/i);
  });

  it("blocks malformed URLs", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toThrow(/valid URL/i);
  });

  it("allows a literal public IP", async () => {
    await expect(assertPublicHttpUrl("http://93.184.216.34/")).resolves.toBeInstanceOf(URL);
  });

  it("resolves a hostname via DNS and blocks it if it resolves privately", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertPublicHttpUrl("http://internal.example.test/")).rejects.toThrow(/private|internal/i);
  });

  it("surfaces a clear error when the hostname can't be resolved", async () => {
    dnsLookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(assertPublicHttpUrl("http://does-not-exist.example.test/")).rejects.toThrow(/could not resolve/i);
  });
});

describe("fetchAndExtractParagraphs", () => {
  afterEach(() => {
    undiciFetchMock.mockReset();
    dnsLookupMock.mockReset();
  });

  it("fetches, extracts, and returns paragraphs for a public URL", async () => {
    const html = `<body><p>${"Real content about our return policy. ".repeat(2)}</p></body>`;
    undiciFetchMock.mockResolvedValue(fakeHtmlResponse(html));

    const result = await fetchAndExtractParagraphs("http://93.184.216.34/policy");
    expect(result.paragraphs.length).toBeGreaterThan(0);
    expect(result.paragraphs[0]).toContain("Real content about our return policy.");
  });

  it("rejects a private target before ever calling fetch", async () => {
    await expect(fetchAndExtractParagraphs("http://127.0.0.1/")).rejects.toThrow(/private|internal/i);
    expect(undiciFetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-HTML/text content types without reading the body", async () => {
    undiciFetchMock.mockResolvedValue(fakeHtmlResponse("<p>unused</p>", "application/pdf"));
    await expect(fetchAndExtractParagraphs("http://93.184.216.34/file.pdf")).rejects.toThrow(
      /unsupported content-type/i
    );
  });

  it("surfaces a clear error on a non-2xx response", async () => {
    undiciFetchMock.mockResolvedValue({ ok: false, status: 404, headers: new Headers() } as Response);
    await expect(fetchAndExtractParagraphs("http://93.184.216.34/missing")).rejects.toThrow(/404/);
  });

  it("errors when no readable text was extracted", async () => {
    undiciFetchMock.mockResolvedValue(fakeHtmlResponse("<body><nav>Home</nav></body>"));
    await expect(fetchAndExtractParagraphs("http://93.184.216.34/empty")).rejects.toThrow(/no readable text/i);
  });

  // Redirect-handling: the actual SSRF-hardening this file exists for.
  // redirect:"follow" would chase a 302 straight to a private/internal
  // target without ever re-checking it — these prove that can't happen.

  it("rejects a redirect to a private/internal target instead of following it", async () => {
    undiciFetchMock.mockResolvedValueOnce(fakeRedirect("http://169.254.169.254/latest/meta-data/"));
    await expect(fetchAndExtractParagraphs("http://93.184.216.34/redirect-me")).rejects.toThrow(
      /private|internal/i
    );
    expect(undiciFetchMock).toHaveBeenCalledTimes(1); // never issued the second, unchecked request
  });

  it("follows a redirect to a re-validated public target and extracts its content", async () => {
    const html = `<body><p>${"Final destination content after redirect. ".repeat(2)}</p></body>`;
    undiciFetchMock
      .mockResolvedValueOnce(fakeRedirect("http://93.184.216.35/final"))
      .mockResolvedValueOnce(fakeHtmlResponse(html));

    const result = await fetchAndExtractParagraphs("http://93.184.216.34/redirect-me");
    expect(result.paragraphs[0]).toContain("Final destination content after redirect.");
    expect(undiciFetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after too many redirects instead of looping forever", async () => {
    undiciFetchMock.mockResolvedValue(fakeRedirect("http://93.184.216.34/loop"));
    await expect(fetchAndExtractParagraphs("http://93.184.216.34/loop")).rejects.toThrow(/too many redirects/i);
  });
});
