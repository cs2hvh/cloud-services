"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Container } from "@/components/ui/container";
import { savePendingDomain, saveSearchQuery } from "@/lib/domain-intent";
import { createClient } from "@/lib/supabase/client";

interface SearchResultItem {
  domainName: string;
  available: boolean;
  premium: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  currency: string;
  purchaseType: string | null;
  reason: string | null;
}

// TLD quick-search shortcuts shown before the user performs a search.
const STATIC_TLD_PILLS = [
  { tld: "com", label: ".com", highlighted: true },
  { tld: "io",  label: ".io",  highlighted: false },
  { tld: "ai",  label: ".ai",  highlighted: false },
] as const;

function formatPrice(price: number | null, currency: string): string {
  if (price === null) return "";
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}/yr`;
}

const transferSteps = [
  {
    title: "Enter your domain",
    description: "Provide the domain you want to transfer.",
  },
  {
    title: "Add authorization code",
    description: "Secure your transfer using your registrar's auth code.",
  },
  {
    title: "Confirm & complete",
    description: "Approve transfer and manage everything from one dashboard.",
  },
];

function DomainResultRow({
  result,
  onBuy,
}: {
  result: SearchResultItem;
  onBuy: (r: SearchResultItem) => Promise<void>;
}) {
  const buyLabel = formatPrice(result.purchasePrice, result.currency);
  const renewLabel = result.renewalPrice !== null
    ? formatPrice(result.renewalPrice, result.currency)
    : null;

  return (
    <div
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
        result.available ? "bg-[#2A2D33] text-white" : "bg-[#2A2D33]/60 text-white/40"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{result.domainName}</span>
        {result.available ? (
          <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-medium text-[#8DFF84]">
            Available
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-300">
            Taken
          </span>
        )}
        {result.premium && (
          <span className="shrink-0 rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
            Premium
          </span>
        )}
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-2">
        {result.available && buyLabel && (
          <div className="text-right text-[11px] leading-tight">
            <div className="text-white/80 font-medium">{buyLabel}</div>
            {renewLabel && (
              <div className="text-white/40">renews {renewLabel}</div>
            )}
          </div>
        )}
        {result.available && (
          <button
            type="button"
            onClick={() => void onBuy(result)}
            className="inline-flex items-center rounded-md bg-[#019EFF] px-2.5 py-1 text-xs font-medium text-black transition-colors hover:bg-[#0086E5]"
          >
            Buy Now
            <ArrowRight className="ml-1 h-3 w-3" />
          </button>
        )}
        {!result.available && result.reason && (
          <span className="text-[10px] text-white/30 italic truncate max-w-[100px]" title={result.reason}>
            {result.reason}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DomainTransferSection() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");
  const [transferDomain, setTransferDomain] = useState("");

  const handleGoToTransfer = useCallback(
    async (prefillDomain?: string) => {
      const transferUrl = prefillDomain
        ? `/dashboard/domains/transfer?domain=${encodeURIComponent(prefillDomain)}`
        : "/dashboard/domains/transfer";
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.push(`/signin?next=${encodeURIComponent(transferUrl)}`);
        } else {
          router.push(transferUrl);
        }
      } catch {
        toast.error("Could not verify your session. Please sign in.");
        router.push(`/signin?next=${encodeURIComponent(transferUrl)}`);
      }
    },
    [router, supabase]
  );

  // Core search function used by handleSearch and TLD pill clicks
  const triggerSearch = useCallback(
    async (searchQuery: string) => {
      const cleanQuery = searchQuery.trim();
      if (!cleanQuery) return;

      setSearching(true);
      setResults([]);
      setHasSearched(true);
      setLastSearchedQuery(cleanQuery);
      saveSearchQuery(cleanQuery);

      try {
        const res = await fetch("/api/domains/public/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: cleanQuery, tlds: ["com", "net", "org", "io", "ai", "app", "dev", "co"] }),
        });
        const data = await res.json();

        if (res.status === 429) {
          toast.error("Too many searches. Please wait a moment and try again.");
          return;
        }
        if (!res.ok) {
          toast.error(data?.message || data?.error || "Domain search failed");
          return;
        }

        const items = (data?.data?.results || []) as SearchResultItem[];
        setResults(items);
        if (items.length === 0) {
          toast.info("No domain suggestions returned for this query");
        }
      } catch {
        toast.error("Domain search failed. Please try again.");
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const handleSearch = useCallback(async () => {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      toast.error("Enter a domain name or keyword to search");
      return;
    }
    await triggerSearch(cleanQuery);
  }, [query, triggerSearch]);

  const handleBuyNow = useCallback(
    async (result: SearchResultItem) => {
      savePendingDomain({
        domain: result.domainName,
        price: result.purchasePrice,
        renewalPrice: result.renewalPrice,
        currency: result.currency,
      });

      const marketplaceUrl = `/dashboard/domains/marketplace?domain=${encodeURIComponent(result.domainName)}`;
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.push(`/signin?next=${encodeURIComponent(marketplaceUrl)}`);
        } else {
          router.push(marketplaceUrl);
        }
      } catch {
        // Fall back to sign-in so the user can still reach the marketplace after auth
        toast.error("Could not verify your session. Please sign in.");
        router.push(`/signin?next=${encodeURIComponent(marketplaceUrl)}`);
      }
    },
    [router, supabase]
  );

  // Keep primary result (exact match) at top; sort remaining alternatives available-first
  const orderedResults = useMemo(() => {
    if (!lastSearchedQuery.includes(".")) {
      // Keyword search: sort all by availability
      return [...results].sort((a, b) =>
        a.available === b.available ? 0 : a.available ? -1 : 1
      );
    }
    // Exact domain search: first result is the primary match, rest are alternatives
    const [primary, ...rest] = results;
    const sortedRest = [...rest].sort((a, b) =>
      a.available === b.available ? 0 : a.available ? -1 : 1
    );
    return primary ? [primary, ...sortedRest] : sortedRest;
  }, [results, lastSearchedQuery]);

  const isExactSearch = lastSearchedQuery.includes(".");
  const primaryResult = isExactSearch ? orderedResults[0] : null;
  const alternativeResults = isExactSearch ? orderedResults.slice(1) : orderedResults;

  const handleTldPillClick = useCallback(
    (tld: string) => {
      const keyword = query.trim().split(".")[0];
      if (!keyword) {
        toast.info(`Type a domain name then click .${tld} to search`);
        return;
      }
      const newQuery = `${keyword}.${tld}`;
      setQuery(newQuery);
      void triggerSearch(newQuery);
    },
    [query, triggerSearch]
  );

  return (
    <section id="search" className="relative overflow-hidden bg-[#0D0D0F] pt-16 sm:pt-20 lg:pt-24">
      <Container className="relative z-10 ">
        <div className="relative mx-auto w-full max-w-[980px] overflow-hidden rounded-2xl bg-[#C6D5E3] px-6 py-7 sm:px-12 sm:py-9 lg:px-20 lg:py-11">
          <Image
            src="/images/main-page/service-home-domain-sec-1-bg.png"
            alt=""
            fill
            className="object-cover"
          />
          <div className="relative bg-[#C6D5E3]">
            <h2 className="mt-2 text-center text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-[#0a0a0a] sm:text-4xl lg:text-[48px]">
              Register, manage, and operate
              <span className="block text-[#0A9FFF]">your domain portfolio</span>
            </h2>

            <p className="mx-auto mt-5 max-w-[640px] text-center text-[14px] leading-[1.6] text-black/65 sm:text-[15.5px]">
              Anycast DNS, free WHOIS privacy, lossless transfers, and a
              single dashboard for hundreds of domains — at registry-fair prices.
            </p>
            <p className="mx-auto mt-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.18em] text-black/55 font-[var(--font-geist-mono),ui-monospace,monospace]">
              Instant search · Smart suggestions · Seamless transfers
            </p>

            <div className="mx-auto mt-5 w-full max-w-[700px]">
              {/* Full-width input with embedded search button — matches original layout */}
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuery(v);
                    // When user clears the input, reset search state so TLD suggestions reappear
                    if (v.trim() === "") {
                      setHasSearched(false);
                      setResults([]);
                      saveSearchQuery("");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSearch();
                    }
                  }}
                  placeholder="Find your next domain..."
                  className="h-11 w-full rounded-md border border-white/40 bg-white/65 px-4 pr-12 text-sm text-black placeholder:text-black/50 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#0A9FFF]/35 sm:h-12 sm:text-base"
                />

                {/* Right-side controls: optional clear + compact search icon */}
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {query.trim() !== "" && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => {
                        setQuery("");
                        setHasSearched(false);
                        setResults([]);
                        saveSearchQuery("");
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white/80 hover:bg-white/20"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label="Search"
                    onClick={() => void handleSearch()}
                    disabled={searching}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-[#019EFF] px-2.5 text-xs font-medium text-black transition-colors hover:bg-[#0086E5] cursor-pointer disabled:opacity-60 sm:h-9 sm:text-sm"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* TLD pricing pills — interactive quick-search shortcuts with live prices */}
              {!hasSearched && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {STATIC_TLD_PILLS.map((item) => (
                    <button
                      key={item.tld}
                      type="button"
                      onClick={() => handleTldPillClick(item.tld)}
                      title={query.trim() ? `Search ${query.trim().split(".")[0]}.${item.tld}` : `Type a name then click to search with ${item.label}`}
                      className={`rounded-md px-3 py-2 text-center text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer sm:text-sm ${
                        item.highlighted
                          ? "bg-[#2A2D33] text-[#8DFF84]"
                          : "bg-[#2A2D33] text-[#87C9FF]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Search results — replace TLD pills area when searching */}
              {hasSearched && (
                <div className="mt-3">
                  {searching ? (
                    <div className="flex items-center justify-center gap-2 rounded-md bg-[#2A2D33]/70 py-3 text-sm text-white/70">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching domains…
                    </div>
                  ) : orderedResults.length === 0 ? (
                    <div className="rounded-md bg-[#2A2D33]/60 py-3 text-center text-sm text-white/50">
                      No results found. Try a different keyword.
                    </div>
                  ) : (
                    <div className="max-h-[300px] space-y-1 overflow-y-auto rounded-lg">
                      {/* Primary exact-match result */}
                      {primaryResult && (
                        <>
                          <DomainResultRow result={primaryResult} onBuy={handleBuyNow} />
                          {alternativeResults.length > 0 && (
                            <div className="px-1 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                              Similar domains
                            </div>
                          )}
                        </>
                      )}
                      {/* Keyword search results or alternatives */}
                      {alternativeResults.map((result) => (
                        <DomainResultRow key={result.domainName} result={result} onBuy={handleBuyNow} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleGoToTransfer()}
              className="mt-4 w-full text-center text-xs text-black/70 hover:text-black transition-colors cursor-pointer sm:text-sm"
            >
              Already own a domain? Transfer it here{" "}
              <ArrowRight className="inline h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </Container>

      <div className="relative -mt-7 bg-[#E5E5E5] pt-20 pb-16 sm:-mt-9 sm:pt-24 sm:pb-20 lg:-mt-10 lg:pt-28 lg:pb-24">
        <div className="absolute -top-[80px] left-0 w-full overflow-hidden leading-none">
          <svg
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
            className="w-full h-[100px]"
          >
            <path
              d="M0,0 C300,100 900,100 1200,0 L1200,120 L0,120 Z"
              fill="#E5E5E5"
            />
          </svg>
        </div>

        <Container className="relative z-10">
          <div className="mx-auto w-full max-w-[980px]">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-12">
              <div className="rounded-xl p-4 sm:p-6">
                <h3 className="text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-[#0a0a0a] sm:text-[34px]">
                  Move existing domains
                  <span className="block text-[#0095FF]">without downtime</span>
                </h3>
                <p className="mt-3 max-w-[460px] text-sm leading-[1.6] text-black/65 sm:text-[15px]">
                  Inbound transfers from any ICANN-accredited registrar with
                  pre-flight validation, DNS pre-staging, and a 30-day rollback
                  window.
                </p>
                <div className="relative mt-5 h-[170px] w-full max-w-[280px]">
                  <Image
                    src="/images/main-page/service-home-domain-sec-1.svg"
                    alt="Domain transfer illustration"
                    fill
                    className="object-contain object-left"
                  />
                </div>
              </div>

              <div className="rounded-xl p-4 sm:p-6">
                <div className="relative space-y-6">
                  <div className="absolute left-[14px] top-8 bottom-8 w-px bg-black/25" />
                  {transferSteps.map((step, index) => (
                    <div
                      key={step.title}
                      className="relative flex items-start gap-4"
                    >
                      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="text-2xl font-semibold leading-tight text-[#111] sm:text-[34px]">
                          {step.title}
                        </h4>
                        <p className="mt-1 text-sm leading-relaxed text-black/70 sm:text-base">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mx-auto mt-6 flex w-full max-w-[620px] flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="Enter Your Domain"
                value={transferDomain}
                onChange={(e) => setTransferDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleGoToTransfer(transferDomain.trim() || undefined);
                  }
                }}
                className="h-11 w-full rounded-md border border-black/10 bg-white/85 px-3 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-[#0095FF]/40"
              />
              <button
                type="button"
                onClick={() => void handleGoToTransfer(transferDomain.trim() || undefined)}
                className="inline-flex h-11 items-center justify-center rounded-md bg-[#019EFF] px-5 text-sm font-medium text-black transition-colors hover:bg-[#0086E5] cursor-pointer"
              >
                Transfer Domain
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}
