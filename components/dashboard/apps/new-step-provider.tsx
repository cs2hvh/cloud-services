"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { GitProvider } from "./new-types";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const BORDER_ACCENT = "rgba(0,149,255,0.4)";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

// Per-provider brand swatch for the logo tile (matches the mockup).
const PROVIDER_TILE: Record<string, { background: string; ring?: string }> = {
  github:    { background: "linear-gradient(135deg, #1a1c23, #0d0e11)" },
  gitlab:    { background: "linear-gradient(135deg, #fc6d26, #e24329)" },
  bitbucket: { background: "linear-gradient(135deg, #2684ff, #0052cc)" },
};

interface Props {
  gitProviders: GitProvider[];
  loadingProviders: boolean;
  selectedProvider: string;
  onSelectProvider: (id: string) => void;
  isLoading: boolean;
  connectingProvider: string | null;
  connectionError: { provider: string; message: string } | null;
  onConnect: (id: string) => void;
  onRefresh: () => void;
  onNext: () => void;
}

export function StepProvider({
  gitProviders, loadingProviders, selectedProvider, onSelectProvider,
  isLoading, connectingProvider, connectionError, onConnect, onRefresh, onNext,
}: Props) {
  return (
    <section className="border border-white/[0.06] bg-[#111216]">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-5">
        <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
          01 · Source
        </p>
        <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-white">
          Select Git provider
        </h2>
        <p className="mt-1 text-[12.5px] text-white/50">
          Connect an approved Git provider to access repositories. We only request read access to the repos you select.
        </p>
      </header>

      {/* Body */}
      <div className="px-6 py-6">
        {loadingProviders ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            <p className={`${MONO} text-[11px] text-white/45`}>Checking connected providers…</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {gitProviders.map((provider) => {
              const selected = selectedProvider === provider.id;
              const isConnecting = connectingProvider === provider.id;
              const interactive = provider.connected;
              const tileStyle = PROVIDER_TILE[provider.id] ?? { background: "#1a1c23" };

              // Card is a clickable div (not button) so we can put the
              // Connect button inside without nesting <button>s.
              return (
                <div
                  key={provider.id}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : -1}
                  aria-pressed={interactive ? selected : undefined}
                  aria-disabled={!interactive}
                  onClick={() => interactive && onSelectProvider(provider.id)}
                  onKeyDown={(e) => {
                    if (!interactive) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectProvider(provider.id);
                    }
                  }}
                  className={`relative flex items-center gap-4 p-4 border transition-all ${
                    interactive ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                  }`}
                  style={
                    selected
                      ? {
                          // Solid bright brand-blue border + soft glow + diagonal gradient fill.
                          borderColor: ACCENT,
                          background:
                            "linear-gradient(135deg, #0d0e11 0%, rgba(0,149,255,0.06) 100%)",
                          boxShadow:
                            `0 0 0 1px ${ACCENT}, 0 8px 24px rgba(0,149,255,0.10)`,
                        }
                      : {
                          borderColor: "rgba(255,255,255,0.06)",
                          background: "#0d0e11",
                        }
                  }
                  onMouseEnter={(e) => {
                    if (selected || !interactive) return;
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                    e.currentTarget.style.background = "#16181d";
                  }}
                  onMouseLeave={(e) => {
                    if (selected || !interactive) return;
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.background = "#0d0e11";
                  }}
                >

                  {/* Brand-color logo tile */}
                  <div
                    className="h-11 w-11 shrink-0 flex items-center justify-center"
                    style={tileStyle}
                  >
                    <Image
                      src={provider.icon}
                      alt={provider.name}
                      width={22}
                      height={22}
                      className="h-[22px] w-[22px] object-contain"
                      unoptimized
                    />
                  </div>

                  {/* Name + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-semibold tracking-[-0.01em] text-white">
                      {provider.name}
                    </div>
                    <div className={`${MONO} mt-1 text-[11px] text-white/45`}>
                      {provider.connected
                        ? `Connected${provider.username ? ` · @${provider.username}` : ""}`
                        : "Not connected · connect to use private repos"}
                    </div>
                  </div>

                  {/* Right cluster: status pill + (connect btn if needed) + radio */}
                  {provider.connected ? (
                    <span
                      className={`${MONO} shrink-0 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] font-semibold border border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300`}
                    >
                      Connected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onConnect(provider.id); }}
                      disabled={isLoading || connectingProvider !== null}
                      className={`${MONO} shrink-0 inline-flex h-8 items-center gap-1.5 px-3 text-[11px] uppercase tracking-[0.14em] font-semibold transition-all disabled:opacity-50`}
                      style={{ background: ACCENT, color: "#001930" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT_BRIGHT; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
                    >
                      {isConnecting ? (
                        <><Loader2 className="h-3 w-3 animate-spin" />Connecting</>
                      ) : "Connect"}
                    </button>
                  )}

                  <span
                    aria-hidden
                    className="h-[18px] w-[18px] rounded-full shrink-0 relative"
                    style={{
                      border: `1.5px solid ${selected ? ACCENT : "rgba(255,255,255,0.18)"}`,
                    }}
                  >
                    {selected && (
                      <span
                        className="absolute inset-[3px] rounded-full block"
                        style={{ background: ACCENT, boxShadow: `0 0 8px rgba(0,149,255,0.7)` }}
                      />
                    )}
                  </span>
                </div>
              );
            })}

            {connectionError && (
              <div className="mt-3 border border-red-400/25 bg-red-400/[0.06] px-3.5 py-2.5">
                <p className="text-[12px] text-red-300">{connectionError.message}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        <div className="mt-5 flex items-center justify-between gap-4">
          <p className={`${MONO} text-[10.5px] text-white/35`}>
            Only connected providers allow repository access
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loadingProviders}
            className={`${MONO} h-8 px-3 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.03] transition-colors disabled:opacity-50`}
          >
            {loadingProviders ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
          </button>
        </div>
      </div>

      {/* Footer / Next */}
      <footer className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
        <button
          type="button"
          onClick={onNext}
          disabled={loadingProviders || !selectedProvider}
          className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold transition-all disabled:cursor-not-allowed disabled:bg-[#0d0e11] disabled:text-white/30`}
          style={
            loadingProviders || !selectedProvider
              ? {}
              : { background: ACCENT, color: "#001930", boxShadow: "0 6px 18px rgba(0,149,255,0.15)" }
          }
          onMouseEnter={(e) => { if (!loadingProviders && selectedProvider) e.currentTarget.style.background = ACCENT_BRIGHT; }}
          onMouseLeave={(e) => { if (!loadingProviders && selectedProvider) e.currentTarget.style.background = ACCENT; }}
        >
          Continue
          <span aria-hidden>→</span>
        </button>
      </footer>
    </section>
  );
}
