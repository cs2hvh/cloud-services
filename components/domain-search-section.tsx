"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
  ShoppingCart,
  Sparkles,
  X,
} from "lucide-react";
import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const POPULAR_TLDS = [
  { tld: ".com", price: "$9.99/yr", highlight: true },
  { tld: ".io",  price: "$39.99/yr", highlight: false },
  { tld: ".ai",  price: "$9.75/yr",  highlight: true },
  { tld: ".org", price: "$11.99/yr", highlight: false },
  { tld: ".co",  price: "$14.99/yr", highlight: false },
  { tld: ".net", price: "$39.99/yr", highlight: false },
];

const FEATURES = [
  "Free WHOIS privacy",
  "DNS management included",
  "Auto-renewal protection",
  "24/7 support",
];

// ─── API result types (match `/api/domains/public/search`) ──────────
type SearchResult = {
  domainName: string;
  available: boolean;
  premium: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  currency: string;
  purchaseType: string | null;
  reason: string | null;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; query: string; results: SearchResult[] }
  | { status: "error"; message: string; retryAfter?: number };

// Strip the user-typed TLD so the API can return results across all TLDs.
function extractSld(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  // Take everything before the first dot. The API treats this as the SLD
  // and probes against a default TLD set.
  const dot = trimmed.indexOf(".");
  const sld = dot === -1 ? trimmed : trimmed.slice(0, dot);
  return sld.replace(/[^a-z0-9-]/g, "");
}

function formatPrice(p: number | null, currency: string): string {
  if (p === null) return "—";
  const c = currency === "USD" ? "$" : currency + " ";
  return `${c}${p.toFixed(2)}`;
}

export function DomainSearchSection() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const runSearch = useCallback(async (rawQuery: string) => {
    const sld = extractSld(rawQuery);
    if (sld.length < 2) {
      setState({ status: "idle" });
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: "loading" });

    try {
      const res = await fetch("/api/domains/public/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sld }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 60;
        setState({
          status: "error",
          message: `Too many searches — try again in ${retryAfter}s`,
          retryAfter,
        });
        return;
      }

      if (!res.ok) {
        setState({ status: "error", message: "Search failed. Try again." });
        return;
      }

      const json = (await res.json()) as {
        data?: { query: string; results: SearchResult[] };
      };

      const results = json.data?.results ?? [];
      // Sort: available exact match first, then other available, then taken
      const matchSld = sld;
      results.sort((a, b) => {
        const aSld = a.domainName.split(".")[0];
        const bSld = b.domainName.split(".")[0];
        const aExact = aSld === matchSld;
        const bExact = bSld === matchSld;
        if (aExact !== bExact) return aExact ? -1 : 1;
        if (a.available !== b.available) return a.available ? -1 : 1;
        return 0;
      });

      setState({
        status: "success",
        query: sld,
        results,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({
        status: "error",
        message: "Couldn't reach the search service. Try again.",
      });
    }
  }, []);

  // Debounce: search 500ms after the user stops typing
  useEffect(() => {
    const sld = extractSld(query);
    if (sld.length < 2) {
      setState({ status: "idle" });
      return;
    }
    const t = window.setTimeout(() => {
      runSearch(query);
    }, 500);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

  function handleClear() {
    setQuery("");
    setState({ status: "idle" });
    inputRef.current?.focus();
  }

  const hasResults =
    state.status === "success" && state.results.length > 0;

  return (
    <section className="relative z-10 overflow-hidden bg-[#E6E4DC] py-24 text-[#1A1814] sm:py-28">
      <Container className="relative z-10">
        {/* Header */}
        <div className="text-center">
          <p
            className={`${MONO} mb-5 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-black/55`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
            Domain Registration
          </p>
          <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1814] sm:text-4xl lg:text-[46px]">
            Find the right domain. Register in seconds.
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.6] text-black/60 sm:text-[16.5px]">
            Search 400+ TLDs, register with one click, and manage DNS from the
            same dashboard as the rest of your infrastructure.
          </p>
        </div>

        {/* Search bar */}
        <div className="mx-auto mt-10 max-w-[760px]">
          <div className="flex items-stretch overflow-hidden rounded-[8px] border border-black/15 bg-[#EEECE4]">
            <div className="flex items-center pl-5 text-black/45">
              {state.status === "loading" ? (
                <Loader2 size={18} className="animate-spin text-[#0095FF]" />
              ) : (
                <Search size={18} />
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="yourname.com, startup.io…"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="h-14 flex-1 bg-transparent px-4 text-[15px] text-[#1A1814] placeholder:text-black/35 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear"
                className="flex items-center px-3 text-black/35 transition-colors hover:text-black/65"
              >
                <X size={16} />
              </button>
            )}
            <Link
              href={`/services/domain${query ? `?q=${encodeURIComponent(query)}` : ""}`}
              className={`${MONO} m-1.5 inline-flex items-center gap-1.5 rounded-[5px] bg-[#1A1814] px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#EEECE4] transition-colors hover:bg-black`}
            >
              Browse all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Results / chips / status */}
          {state.status === "idle" && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {POPULAR_TLDS.map((item) => (
                <button
                  key={item.tld}
                  type="button"
                  onClick={() => {
                    setQuery((q) => {
                      const base = extractSld(q) || "yourname";
                      return base + item.tld;
                    });
                    inputRef.current?.focus();
                  }}
                  className={`group inline-flex items-center gap-2 rounded-[5px] border px-4 py-2 text-[12.5px] transition-colors ${
                    item.highlight
                      ? "border-black/25 bg-[#EEECE4] text-[#1A1814] hover:border-black/40"
                      : "border-black/10 bg-transparent text-black/65 hover:border-black/25 hover:bg-[#EEECE4] hover:text-[#1A1814]"
                  }`}
                >
                  <span className={`${MONO} font-semibold`}>{item.tld}</span>
                  <span className={`${MONO} text-[10.5px] text-black/45`}>
                    {item.price}
                  </span>
                </button>
              ))}
            </div>
          )}

          {state.status === "loading" && (
            <div className="mt-4 overflow-hidden rounded-[8px] border border-black/10 bg-[#EEECE4]">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
                    <div
                      className="h-3 animate-pulse rounded-sm bg-black/10"
                      style={{ width: `${120 + i * 24}px` }}
                    />
                  </div>
                  <div className="h-3 w-20 animate-pulse rounded-sm bg-black/10" />
                </div>
              ))}
            </div>
          )}

          {state.status === "error" && (
            <div className="mt-4 flex items-center gap-2 rounded-[6px] border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3 text-[13px] text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{state.message}</span>
            </div>
          )}

          {hasResults && (
            <ResultsList
              results={state.results}
              query={state.query}
            />
          )}

          {state.status === "success" && state.results.length === 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-[6px] border border-black/10 bg-[#EEECE4] px-4 py-3 text-[13px] text-black/55">
              <Search className="h-4 w-4 shrink-0" />
              No results for that name. Try another spelling.
            </div>
          )}
        </div>

        {/* Features + CTA row */}
        <div className="mx-auto mt-10 flex max-w-[860px] flex-col items-center justify-center gap-5 sm:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="flex items-center gap-2 text-[12.5px] text-black/65"
              >
                <Check size={12} className="text-black/55" strokeWidth={2.6} />
                {f}
              </span>
            ))}
          </div>

          <span
            className="hidden h-4 w-px bg-black/15 sm:block"
            aria-hidden="true"
          />

          <Link
            href="/services/domain"
            className={`${MONO} inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-black/65 transition-colors hover:text-[#1A1814]`}
          >
            Browse all extensions
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Container>
    </section>
  );
}

// ─── Results panel ──────────────────────────────────────────────────
function ResultsList({
  results,
  query,
}: {
  results: SearchResult[];
  query: string;
}) {
  const exact = results.find(
    (r) => r.domainName.split(".")[0] === query
  );
  const others = results.filter((r) => r !== exact);

  return (
    <div className="mt-4 overflow-hidden rounded-[8px] border border-black/10 bg-[#EEECE4]">
      {/* Exact match — featured row */}
      {exact && <FeaturedResultRow result={exact} />}

      {/* Recommendations header */}
      {others.length > 0 && (
        <div
          className={`${MONO} flex items-center gap-2 border-b border-black/[0.06] bg-[#E6E4DC] px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] text-black/50`}
        >
          <Sparkles className="h-3 w-3" />
          Suggestions
          <span className="ml-auto text-black/35">
            {others.length} option{others.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Other results */}
      <div className="max-h-[420px] overflow-y-auto">
        {others.map((r) => (
          <ResultRow key={r.domainName} result={r} />
        ))}
      </div>
    </div>
  );
}

function FeaturedResultRow({ result }: { result: SearchResult }) {
  const [sld, ...tldParts] = result.domainName.split(".");
  const tld = "." + tldParts.join(".");

  return (
    <div className="border-b border-black/[0.08] bg-white px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {result.available ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/[0.12] px-2.5 py-1">
              <span className="block h-1.5 w-1.5 rounded-full bg-emerald-600" />
              <span
                className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800`}
              >
                Available
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.06] px-2.5 py-1">
              <span className="block h-1.5 w-1.5 rounded-full bg-black/40" />
              <span
                className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.16em] text-black/55`}
              >
                Taken
              </span>
            </span>
          )}
          {result.premium && (
            <span
              className={`${MONO} inline-flex items-center gap-1 rounded-full bg-amber-500/[0.15] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800`}
            >
              <Sparkles className="h-3 w-3" />
              Premium
            </span>
          )}
          <p className="truncate text-[20px] font-semibold tracking-[-0.01em] text-[#1A1814] sm:text-[22px]">
            {sld}
            <span className="text-[#0095FF]">{tld}</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {result.purchasePrice !== null && (
            <div className="text-right">
              <p
                className={`${MONO} text-[18px] font-semibold tabular-nums text-[#1A1814]`}
              >
                {formatPrice(result.purchasePrice, result.currency)}
                <span className="text-[11px] font-medium text-black/45">/yr</span>
              </p>
              {result.renewalPrice !== null &&
                result.renewalPrice !== result.purchasePrice && (
                  <p
                    className={`${MONO} text-[10px] text-black/45`}
                  >
                    renews {formatPrice(result.renewalPrice, result.currency)}
                  </p>
                )}
            </div>
          )}
          {result.available ? (
            <Link
              href={`/services/domain?q=${encodeURIComponent(result.domainName)}`}
              className={`${MONO} inline-flex items-center gap-1.5 rounded-[5px] bg-[#1A1814] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#EEECE4] transition-colors hover:bg-black`}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Register
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className={`${MONO} inline-flex cursor-not-allowed items-center gap-1.5 rounded-[5px] border border-black/15 bg-transparent px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40`}
            >
              Unavailable
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ result }: { result: SearchResult }) {
  const [sld, ...tldParts] = result.domainName.split(".");
  const tld = "." + tldParts.join(".");

  return (
    <div className="group flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-3 last:border-b-0 transition-colors hover:bg-white">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`block h-1.5 w-1.5 shrink-0 rounded-full ${
            result.available
              ? result.premium
                ? "bg-amber-500"
                : "bg-emerald-500"
              : "bg-black/25"
          }`}
        />
        <p className="truncate text-[14px] tracking-[-0.005em] text-[#1A1814]">
          {sld}
          <span className="text-black/55">{tld}</span>
        </p>
        {result.premium && result.available && (
          <span
            className={`${MONO} hidden rounded-full bg-amber-500/[0.15] px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-amber-800 sm:inline-block`}
          >
            Premium
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {result.available && result.purchasePrice !== null && (
          <span
            className={`${MONO} text-[13px] font-semibold tabular-nums text-[#1A1814]`}
          >
            {formatPrice(result.purchasePrice, result.currency)}
            <span className="text-[10px] font-medium text-black/40">/yr</span>
          </span>
        )}
        {result.available ? (
          <Link
            href={`/services/domain?q=${encodeURIComponent(result.domainName)}`}
            className={`${MONO} inline-flex items-center gap-1.5 rounded-[5px] border border-black/15 bg-transparent px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1A1814] transition-colors hover:border-black/35 hover:bg-[#1A1814] hover:text-[#EEECE4]`}
          >
            Register
          </Link>
        ) : (
          <span
            className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-black/35`}
          >
            Taken
          </span>
        )}
      </div>
    </div>
  );
}
