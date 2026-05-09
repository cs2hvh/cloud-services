import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { PAGE_SIZE } from "./activity.types";

interface ActivityPaginationProps {
  page: number;
  totalPages: number;
  totalFiltered: number;
  onPage: (p: number) => void;
}

const NavBtn = ({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
  >
    {children}
  </button>
);

export function ActivityPagination({
  page,
  totalPages,
  totalFiltered,
  onPage,
}: ActivityPaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalFiltered);

  // Sliding window of up to 5 page numbers with ellipsis markers
  const buildPages = (): (number | "…")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "…")[] = [1];
    if (page > 3) pages.push("…");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  };

  const pages = buildPages();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t border-white/[0.06] px-1">
      {/* Summary */}
      <div className="flex items-center gap-1.5 text-[12px] text-white/35 order-2 sm:order-1">
        <span className="tabular-nums">
          {from}–{to}
        </span>
        <span className="text-white/20">of</span>
        <span className="text-white/55 tabular-nums">{totalFiltered} events</span>
        <span className="text-white/15 mx-1">·</span>
        <span>
          page <span className="text-white/55 tabular-nums">{page}</span>
          <span className="text-white/20"> / </span>
          <span className="tabular-nums">{totalPages}</span>
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-0.5 order-1 sm:order-2">
        {/* First */}
        <NavBtn onClick={() => onPage(1)} disabled={page === 1} title="First page">
          <ChevronsLeft className="w-3.5 h-3.5" />
        </NavBtn>

        {/* Prev */}
        <NavBtn onClick={() => onPage(page - 1)} disabled={page === 1} title="Previous page">
          <ChevronLeft className="w-3.5 h-3.5" />
        </NavBtn>

        {/* Separator */}
        <div className="w-px h-4 bg-white/[0.07] mx-1" />

        {/* Page numbers with ellipsis */}
        {pages.map((p, idx) =>
          p === "…" ? (
            <span
              key={`ellipsis-${idx}`}
              className="w-8 h-8 flex items-center justify-center text-[12px] text-white/20 select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={`w-8 h-8 flex items-center justify-center text-[12px] font-medium rounded transition-colors ${
                p === page
                  ? "bg-white/[0.10] text-white border border-white/[0.15]"
                  : "text-white/38 hover:text-white/75 hover:bg-white/[0.05]"
              }`}
            >
              {p}
            </button>
          )
        )}

        {/* Separator */}
        <div className="w-px h-4 bg-white/[0.07] mx-1" />

        {/* Next */}
        <NavBtn onClick={() => onPage(page + 1)} disabled={page === totalPages} title="Next page">
          <ChevronRight className="w-3.5 h-3.5" />
        </NavBtn>

        {/* Last */}
        <NavBtn onClick={() => onPage(totalPages)} disabled={page === totalPages} title="Last page">
          <ChevronsRight className="w-3.5 h-3.5" />
        </NavBtn>
      </div>
    </div>
  );
}
