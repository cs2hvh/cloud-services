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

const tldSuggestions = [
  { tld: ".com", price: "$2.95/month", highlighted: true },
  { tld: ".in", price: "$5.25/month", highlighted: false },
  { tld: ".org", price: "$3.25/month", highlighted: false },
];

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

export default function DomainTransferSection() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      toast.error("Enter a domain name or keyword to search");
      return;
    }

    setSearching(true);
    setResults([]);
    setHasSearched(true);
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
  }, [query]);

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
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) {
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

  const orderedResults = [...results].sort((a, b) => {
    if (a.available === b.available) return 0;
    return a.available ? -1 : 1;
  });

  return (
    <section className="relative overflow-hidden bg-[#0D0D0F] pt-16 sm:pt-20 lg:pt-24">
      <Container className="relative z-10 ">
        <div style={{boxShadow:'5px 5px 7.3px -2px #000000'}}  className="relative mx-auto w-full max-w-[980px] overflow-hidden rounded-2xl bg-[#C6D5E3] px-6 py-7 sm:px-12 sm:py-9 lg:px-20 lg:py-11">
          <Image
            src="/images/main-page/service-home-domain-sec-1-bg.png"
            alt=""
            fill
            className="object-cover"
          />
          <div className="relative bg-[#C6D5E3]">
            <h2 className="font-salsa mt-2 text-center text-3xl font-semibold leading-tight text-[#111] sm:text-4xl lg:text-[52px]">
              Search and Secure Your
              <span className="block text-[#0A9FFF]">Perfect Domain</span>
            </h2>

            <p className="font-salsa mx-auto mt-4 max-w-[700px] text-center text-sm font-semibold leading-relaxed text-black sm:text-base">
              Discover, register, and manage your domain with speed, security,
              and full control all from one modern platform.
            </p>
            <p className="mx-auto mt-2 text-center text-xs text-black/70 sm:text-sm">
              Instant search &nbsp; Smart suggestions &nbsp; Seamless transfers
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

              {/* TLD pricing pills — always shown when no search started (original layout) */}
              {!hasSearched && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {tldSuggestions.map((item) => (
                    <div
                      key={item.tld}
                      className={`rounded-md px-3 py-2 text-center text-xs font-medium sm:text-sm ${
                        item.highlighted
                          ? "bg-[#2A2D33] text-[#8DFF84]"
                          : "bg-[#2A2D33] text-[#87C9FF]"
                      }`}
                    >
                      {item.tld}{" "}
                      <span className="text-white/80">{item.price}</span>
                    </div>
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
                    <div className="max-h-[260px] space-y-1.5 overflow-y-auto rounded-lg">
                      {orderedResults.map((result) => (
                        <div
                          key={result.domainName}
                          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                            result.available
                              ? "bg-[#2A2D33] text-white"
                              : "bg-[#2A2D33]/60 text-white/40"
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
                            {result.purchasePrice !== null && (
                              <span className="text-xs text-white/60">
                                {result.currency === 'USD' ? '$' : result.currency + ' '}{result.purchasePrice}
                              </span>
                            )}
                            {result.available && (
                              <button
                                type="button"
                                onClick={() => void handleBuyNow(result)}
                                className="inline-flex items-center rounded-md bg-[#019EFF] px-2.5 py-1 text-xs font-medium text-black transition-colors hover:bg-[#0086E5]"
                              >
                                Buy Now
                                <ArrowRight className="ml-1 h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button className="mt-4 w-full text-center text-xs text-black/70 sm:text-sm">
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
                <h3 className="font-salsa text-3xl font-semibold leading-tight text-[#111] sm:text-4xl">
                  Transfer Your Domain
                  <span className="block text-[#0095FF]">Without Downtime</span>
                </h3>
                <p className="mt-2 max-w-[460px] text-sm leading-relaxed text-black/70 sm:text-base">
                  Transfer your domain to AhuraCloud in minutes with zero
                  disruption and full control.
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
                className="h-11 w-full rounded-md border border-black/10 bg-white/85 px-3 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-[#0095FF]/40"
              />
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-md bg-[#019EFF] px-5 text-sm font-medium font-salsa text-black transition-colors hover:bg-[#0086E5] cursor-pointer"
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
