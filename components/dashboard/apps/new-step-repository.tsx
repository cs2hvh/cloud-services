"use client";

import { Code, Loader2 } from "lucide-react";
import { Repository, GitProvider } from "./new-types";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const BORDER_ACCENT = "rgba(0,149,255,0.4)";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

// Map common language names to a dot color so the row's mini-meta has
// the same visual rhythm as GitHub's repo list.
const LANG_COLOR: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f1e05a",
  python: "#3776ab",
  go: "#00add8",
  rust: "#dea584",
  java: "#b07219",
  ruby: "#701516",
  php: "#4f5d95",
  swift: "#fa7343",
  kotlin: "#a97bff",
  dart: "#00b4ab",
  c: "#555555",
  "c++": "#f34b7d",
  "c#": "#178600",
  html: "#e34c26",
  css: "#563d7c",
  shell: "#89e051",
  vue: "#41b883",
  svelte: "#ff3e00",
};

function langColor(lang: string | null | undefined): string {
  if (!lang) return "#52525b";
  return LANG_COLOR[lang.toLowerCase()] ?? "#71717a";
}

interface Props {
  repositories: Repository[];
  loadingRepos: boolean;
  selectedRepo: string;
  onSelectRepo: (id: string) => void;
  selectedProvider: string;
  selectedProviderData: GitProvider | undefined;
  repoSearchTerm: string;
  onSearchChange: (v: string) => void;
  currentPage: number;
  onPageChange: (p: number) => void;
  reposPerPage: number;
  isLoading: boolean;
  onConnect: (id: string) => void;
  onRefreshRepos: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function StepRepository({
  repositories, loadingRepos, selectedRepo, onSelectRepo,
  selectedProvider, selectedProviderData, repoSearchTerm, onSearchChange,
  currentPage, onPageChange, reposPerPage, isLoading, onConnect, onRefreshRepos,
  onPrev, onNext,
}: Props) {
  const filteredRepos = repositories.filter((repo) => {
    const q = repoSearchTerm.toLowerCase();
    return (
      repo.name.toLowerCase().includes(q) ||
      repo.fullName.toLowerCase().includes(q) ||
      (repo.description?.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filteredRepos.length / reposPerPage);

  const pageNumbers = (): (number | string)[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | string)[] = [1];
    if (currentPage > 3) pages.push("…");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  };

  return (
    <section className="border border-white/[0.06] bg-[#111216]">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-5">
        <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45`}>
          02 · Repository
        </p>
        <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-white">
          Choose a repository
        </h2>
        <p className="mt-1 text-[12.5px] text-white/50">
          Select the repository to deploy from your{" "}
          <span className="text-white/80">{selectedProviderData?.name ?? "provider"}</span>{" "}
          account. Branch can be changed after deployment.
        </p>
      </header>

      <div className="px-6 py-6">
        {loadingRepos ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            <p className={`${MONO} text-[11px] text-white/45`}>
              Loading repositories from {selectedProviderData?.name}…
            </p>
          </div>
        ) : repositories.length > 0 ? (
          <div className="space-y-3">
            {/* Search bar */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-white/[0.08] bg-[#0d0e11] focus-within:border-white/25">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/35 shrink-0">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder={`Search repositories${selectedProviderData?.username ? ` from @${selectedProviderData.username}` : ""}…`}
                value={repoSearchTerm}
                onChange={(e) => { onSearchChange(e.target.value); onPageChange(1); }}
                className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/30 outline-none"
              />
              <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/35`}>
                {filteredRepos.length} of {repositories.length}
              </span>
            </div>

            {filteredRepos.length > 0 ? (
              <>
                {/* Repo list */}
                <div className="border border-white/[0.06] bg-[#0d0e11]">
                  {filteredRepos
                    .slice((currentPage - 1) * reposPerPage, currentPage * reposPerPage)
                    .map((repo) => {
                      const selected = selectedRepo === repo.id;
                      const langDot = langColor(repo.language);
                      return (
                        <button
                          key={repo.id}
                          type="button"
                          onClick={() => onSelectRepo(repo.id)}
                          className="relative w-full flex items-start gap-3.5 px-4 py-3.5 text-left border-b border-white/[0.04] last:border-b-0 transition-colors"
                          style={
                            selected
                              ? { background: ACCENT_DIM }
                              : { background: "transparent" }
                          }
                          onMouseEnter={(e) => {
                            if (!selected) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                          }}
                          onMouseLeave={(e) => {
                            if (!selected) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {/* Selected accent bar */}
                          {selected && (
                            <span
                              className="absolute left-0 top-0 bottom-0 w-[2px]"
                              style={{ background: ACCENT }}
                            />
                          )}

                          {/* Icon */}
                          <div className="h-9 w-9 shrink-0 mt-0.5 flex items-center justify-center border border-white/[0.06] bg-[#16181d]">
                            <Code className="h-4 w-4 text-white/55" />
                          </div>

                          {/* Body */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13.5px] font-semibold text-white">{repo.name}</span>
                              {repo.private && (
                                <span className={`${MONO} text-[9.5px] uppercase tracking-[0.12em] font-medium border border-white/[0.08] bg-[#1a1c23] text-white/50 px-1.5 py-px`}>
                                  Private
                                </span>
                              )}
                            </div>
                            <div className={`${MONO} mt-1.5 flex items-center gap-2.5 text-[11px] text-white/45 flex-wrap`}>
                              {repo.language && (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: langDot }} />
                                  {repo.language}
                                </span>
                              )}
                              {repo.language && <span className="text-white/15">·</span>}
                              <span>{new Date(repo.updatedAt).toLocaleDateString()}</span>
                              <span className="text-white/15">·</span>
                              <span>default: {repo.defaultBranch}</span>
                            </div>
                            {repo.description && (
                              <p className="mt-1.5 text-[11.5px] text-white/40 line-clamp-1">
                                {repo.description}
                              </p>
                            )}
                          </div>

                          {/* Branch pill */}
                          <span className={`${MONO} shrink-0 inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 border border-white/[0.08] bg-[#16181d] text-[10.5px] text-white/55`}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="6" y1="3" x2="6" y2="15" />
                              <circle cx="18" cy="6" r="3" />
                              <circle cx="6" cy="18" r="3" />
                              <path d="M18 9a9 9 0 0 1-9 9" />
                            </svg>
                            {repo.defaultBranch}
                          </span>
                        </button>
                      );
                    })}
                </div>

                {/* Pagination */}
                {filteredRepos.length > reposPerPage && (
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <span className={`${MONO} text-[10.5px] text-white/35`}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <PageBtn
                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        ←
                      </PageBtn>
                      {pageNumbers().map((p, i) =>
                        p === "…" ? (
                          <span key={`e-${i}`} className={`${MONO} text-white/30 px-1.5`}>…</span>
                        ) : (
                          <PageBtn
                            key={p}
                            onClick={() => onPageChange(p as number)}
                            active={currentPage === p}
                          >
                            {p}
                          </PageBtn>
                        )
                      )}
                      <PageBtn
                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                      >
                        →
                      </PageBtn>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="border border-white/[0.06] bg-[#0d0e11] py-10 px-6 text-center">
                <Code className="mx-auto h-8 w-8 text-white/15" />
                <p className="mt-3 text-[13px] text-white/55">
                  No repositories match &ldquo;{repoSearchTerm}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className={`${MONO} mt-4 h-8 px-3 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.03] transition-colors`}
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="border border-white/[0.06] bg-[#0d0e11] py-12 px-6 text-center">
            <Code className="mx-auto h-10 w-10 text-white/15" />
            <p className="mt-4 text-[14px] font-semibold text-white">No repositories found</p>
            <p className="mt-1.5 text-[12px] text-white/45 max-w-sm mx-auto">
              {selectedProvider === "github"
                ? "Connect the GitHub App with repository permissions to access private repos."
                : `Make sure you have repositories in your ${selectedProviderData?.name ?? ""} account.`}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={onRefreshRepos}
                className={`${MONO} h-9 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold transition-all`}
                style={{ background: ACCENT, color: "#001930" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT_BRIGHT; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
              >
                Refresh
              </button>
              {selectedProvider === "github" && (
                <button
                  type="button"
                  onClick={() => onConnect("github")}
                  disabled={isLoading}
                  className={`${MONO} h-9 px-4 border border-white/[0.1] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50 inline-flex items-center gap-2`}
                >
                  {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  Connect GitHub App
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4">
        <button
          type="button"
          onClick={onPrev}
          className={`${MONO} h-9 px-3.5 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors`}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={loadingRepos || !selectedRepo}
          className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold transition-all disabled:cursor-not-allowed disabled:bg-[#0d0e11] disabled:text-white/30`}
          style={
            loadingRepos || !selectedRepo
              ? {}
              : { background: ACCENT, color: "#001930", boxShadow: "0 6px 18px rgba(0,149,255,0.15)" }
          }
          onMouseEnter={(e) => { if (!loadingRepos && selectedRepo) e.currentTarget.style.background = ACCENT_BRIGHT; }}
          onMouseLeave={(e) => { if (!loadingRepos && selectedRepo) e.currentTarget.style.background = ACCENT; }}
        >
          Continue
          <span aria-hidden>→</span>
        </button>
      </footer>
    </section>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${MONO} h-7 min-w-[28px] px-2 text-[11px] border transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
      style={
        active
          ? { background: "#ededee", color: "#08090b", borderColor: "transparent", fontWeight: 600 }
          : { background: "transparent", color: "rgba(255,255,255,0.55)", borderColor: "rgba(255,255,255,0.06)" }
      }
    >
      {children}
    </button>
  );
}
