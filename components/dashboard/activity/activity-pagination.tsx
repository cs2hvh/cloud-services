import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "./activity.types";

interface ActivityPaginationProps {
  page: number;
  totalPages: number;
  totalFiltered: number;
  onPage: (p: number) => void;
}

export function ActivityPagination({
  page,
  totalPages,
  totalFiltered,
  onPage,
}: ActivityPaginationProps) {
  if (totalPages <= 1) return null;

  // Build visible page numbers (max 5)
  const pageNums: number[] = [];
  const windowSize = Math.min(totalPages, 5);
  let start = Math.max(1, page - 2);
  if (start + windowSize - 1 > totalPages) start = totalPages - windowSize + 1;
  for (let i = 0; i < windowSize; i++) pageNums.push(start + i);

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalFiltered);

  return (
    <div className="flex items-center justify-between mt-6 px-1">
      <p className="text-[12px] text-white/30">
        {from}–{to} of <span className="text-white/50">{totalFiltered}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white hover:border-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {pageNums.map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-[12px] font-medium transition-colors ${
              p === page
                ? "bg-white/[0.12] text-white border border-white/[0.18]"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
            }`}
          >
            {p}
          </button>
        ))}

        <button
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white hover:border-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
