"use client";
import { Code, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Repository, GitProvider } from "./new-types";

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
    return repo.name.toLowerCase().includes(q) || repo.fullName.toLowerCase().includes(q) || (repo.description?.toLowerCase().includes(q));
  });

  const totalPages = Math.ceil(filteredRepos.length / reposPerPage);

  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | string)[] = [1];
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="border-b border-white/[0.06] px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Step 2</p>
        <CardTitle className="mt-1 text-lg font-semibold text-white">Select Repository</CardTitle>
        <p className="mt-1 text-sm text-white/48">Choose a repository from your connected {selectedProviderData?.name ?? "provider"} account.</p>
      </CardHeader>
      <CardContent className="px-6 py-6">
        {loadingRepos ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
            <p className="text-sm text-white/55">Loading repositories from {selectedProviderData?.name}...</p>
          </div>
        ) : repositories.length > 0 ? (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Search repositories..."
              value={repoSearchTerm}
              onChange={(e) => { onSearchChange(e.target.value); onPageChange(1); }}
              className="w-full border border-white/[0.14] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-blue-500/60 focus:outline-none transition-colors"
            />

            {filteredRepos.length > 0 ? (
              <>
                <RadioGroup value={selectedRepo} onValueChange={onSelectRepo} className="space-y-2">
                  {filteredRepos.slice((currentPage - 1) * reposPerPage, currentPage * reposPerPage).map((repo) => (
                    <div key={repo.id}>
                      <RadioGroupItem value={repo.id} id={repo.id} className="peer sr-only" />
                      <Label
                        htmlFor={repo.id}
                        className="flex items-start gap-3 rounded-lg border-2 border-transparent bg-white/[0.06] p-4 cursor-pointer transition-all hover:bg-white/[0.09] peer-data-[state=checked]:border-blue-500/60 peer-data-[state=checked]:bg-blue-500/10"
                      >
                        <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selectedRepo === repo.id ? "border-blue-500 bg-blue-500" : "border-white/30"}`}>
                          {selectedRepo === repo.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </div>
                        <Code className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{repo.name}</span>
                            {repo.private && <Badge variant="outline" className="border-white/25 text-xs text-white/60">Private</Badge>}
                          </div>
                          <div className="mt-0.5 text-xs text-white/50">{repo.fullName}</div>
                          {repo.description && <div className="mt-1 text-xs text-white/42">{repo.description}</div>}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/40">
                            {repo.language && <span>{repo.language}</span>}
                            <span>Updated {new Date(repo.updatedAt).toLocaleDateString()}</span>
                            <span>Default: {repo.defaultBranch}</span>
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>

                {filteredRepos.length > reposPerPage && (
                  <div className="border-t border-white/[0.07] pt-4">
                    <p className="mb-2 text-center text-xs text-white/35">Page {currentPage} of {totalPages} &mdash; {filteredRepos.length} repositories</p>
                    <div className="flex items-center justify-center gap-1">
                      <Button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} variant="ghost" size="sm" className="text-white/55 hover:text-white hover:bg-white/10 disabled:opacity-30">Prev</Button>
                      {getPageNumbers().map((p, i) =>
                        p === "..." ? (
                          <span key={`e-${i}`} className="px-2 text-white/35">...</span>
                        ) : (
                          <Button key={p} onClick={() => onPageChange(p as number)} variant="ghost" size="sm" className={`h-8 min-w-[32px] ${currentPage === p ? "bg-white/20 text-white" : "text-white/45 hover:text-white hover:bg-white/10"}`}>{p}</Button>
                        )
                      )}
                      <Button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} variant="ghost" size="sm" className="text-white/55 hover:text-white hover:bg-white/10 disabled:opacity-30">Next</Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center">
                <Code className="mx-auto mb-2 h-8 w-8 text-white/20" />
                <p className="text-sm text-white/45">No repositories match &ldquo;{repoSearchTerm}&rdquo;</p>
                <Button onClick={() => onSearchChange("")} size="sm" variant="outline" className="mt-3 border-white/[0.14] bg-white/[0.03] text-white/75 hover:bg-white/[0.07]">Clear Search</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-10 text-center">
            <Code className="mx-auto mb-4 h-10 w-10 text-white/25" />
            <p className="text-white/55">No repositories found</p>
            <p className="mt-2 text-sm text-white/40">
              {selectedProvider === "github"
                ? "For private repos, connect the GitHub App with repository permissions."
                : `Make sure you have repositories in your ${selectedProviderData?.name ?? ""} account.`}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={onRefreshRepos} className="border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500">Refresh</Button>
              {selectedProvider === "github" && (
                <Button onClick={() => onConnect("github")} disabled={isLoading} className="bg-blue-500 text-white hover:bg-blue-600">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Connect GitHub App
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between border-t border-white/[0.06] px-6 py-4">
        <Button variant="outline" onClick={onPrev} className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/75 hover:bg-white/[0.07]">Back</Button>
        <Button onClick={onNext} disabled={loadingRepos || !selectedRepo} className="cursor-pointer rounded-md bg-white text-black hover:bg-white/90">
          Next <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
