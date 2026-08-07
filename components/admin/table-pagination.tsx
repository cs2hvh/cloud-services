"use client";

/**
 * Client-side pagination for admin tables.
 *
 * These lists are already fetched and already bounded server-side — the problem
 * is rendering all of them at once. The AI Audit page put up to 2,000 rows into
 * the DOM, the agentcore page up to 500 runs, and Model Pricing all 86 models.
 * So this pages what is already in memory; it is not an API pager. (When the
 * bound is the SERVER's, page there instead — see the AI Jobs route.)
 *
 * THE BUG THIS DELIBERATELY AVOIDS: when a filter narrows the list, the page
 * index must reset. Leaving it means a user on page 4 filters down to 12 rows
 * and sees an empty table — which reads as "no results" rather than "wrong
 * page". The AI Jobs page shipped with exactly that and had to be fixed.
 * `usePagedRows` keys its reset on the row count and the caller's filter token,
 * so callers cannot forget.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PagedRows<T> {
  /** Just this page's rows — what the table should map over. */
  pageRows: T[];
  page: number;
  setPage: (n: number) => void;
  pageCount: number;
  /** 1-based inclusive range of this page, or 0/0 when empty. */
  from: number;
  to: number;
  total: number;
}

/**
 * @param rows        the full, already-filtered list
 * @param pageSize    rows per page
 * @param filterToken any string that changes when the filter changes; paging
 *                    resets when it does. Pass the concatenated filter state.
 */
export function usePagedRows<T>(rows: T[], pageSize: number, filterToken = ""): PagedRows<T> {
  const [page, setPage] = useState(0);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Reset on a filter change, and clamp if the list shrank under us (e.g. a
  // refresh while the operator sat on the last page).
  useEffect(() => {
    setPage(0);
  }, [filterToken, pageSize]);
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const pageRows = useMemo(() => rows.slice(page * pageSize, page * pageSize + pageSize), [rows, page, pageSize]);

  return {
    pageRows,
    page,
    setPage,
    pageCount,
    from: total === 0 ? 0 : page * pageSize + 1,
    to: Math.min((page + 1) * pageSize, total),
    total,
  };
}

/**
 * The control bar. Renders nothing when everything fits on one page — a pager
 * under a 12-row table is noise.
 */
export function TablePagination({
  paged,
  noun,
  className,
}: {
  paged: Pick<PagedRows<unknown>, "page" | "setPage" | "pageCount" | "from" | "to" | "total">;
  /** Plural noun for the count line, e.g. "event", "run", "model". */
  noun: string;
  className?: string;
}) {
  if (paged.pageCount <= 1) return null;

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 pt-1", className)}>
      <p className="text-xs tabular-nums text-neutral-500">
        Showing {paged.from}–{paged.to} of {paged.total} {noun}
        {paged.total === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-white/10 text-xs"
          disabled={paged.page === 0}
          onClick={() => paged.setPage(Math.max(0, paged.page - 1))}
        >
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          Previous
        </Button>
        <span className="text-xs tabular-nums text-neutral-400">
          Page {paged.page + 1} of {paged.pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-white/10 text-xs"
          disabled={paged.page >= paged.pageCount - 1}
          onClick={() => paged.setPage(Math.min(paged.pageCount - 1, paged.page + 1))}
        >
          Next
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
