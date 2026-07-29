"use client";

import { RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BillingShape, SortKey, StatusFilter } from "./types";

/**
 * Filters for a catalog of ~86 models across two billing shapes and a dozen
 * providers. The margin filters live on the summary cards (click a KPI); these
 * are the orthogonal axes — status, provider, shape — plus sort, because
 * "worst margin first" is how an operator actually wants to read this table.
 */
export function FilterBar({
  search,
  onSearch,
  status,
  onStatus,
  provider,
  onProvider,
  providers,
  shape,
  onShape,
  sort,
  onSort,
  shown,
  total,
  loading,
  onRefresh,
  onClear,
  filtered,
}: {
  search: string;
  onSearch: (value: string) => void;
  status: StatusFilter;
  onStatus: (value: StatusFilter) => void;
  provider: string;
  onProvider: (value: string) => void;
  providers: string[];
  shape: BillingShape;
  onShape: (value: BillingShape) => void;
  sort: SortKey;
  onSort: (value: SortKey) => void;
  shown: number;
  total: number;
  loading: boolean;
  onRefresh: () => void;
  onClear: () => void;
  filtered: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Filter by model id or name…"
          className="h-9 border-white/10 bg-black/40 pl-8"
        />
      </div>

      <Select value={status} onValueChange={(v) => onStatus(v as StatusFilter)}>
        <SelectTrigger className="h-9 w-[130px] border-white/10 bg-black/40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
          <SelectItem value="any">Any status</SelectItem>
        </SelectContent>
      </Select>

      <Select value={provider} onValueChange={onProvider}>
        <SelectTrigger className="h-9 w-[150px] border-white/10 bg-black/40">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">All providers</SelectItem>
          {providers.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={shape} onValueChange={(v) => onShape(v as BillingShape)}>
        <SelectTrigger className="h-9 w-[140px] border-white/10 bg-black/40">
          <SelectValue placeholder="Billing" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any billing</SelectItem>
          <SelectItem value="token">Per token</SelectItem>
          <SelectItem value="unit">Per unit</SelectItem>
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(v) => onSort(v as SortKey)}>
        <SelectTrigger className="h-9 w-[170px] border-white/10 bg-black/40">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="margin_asc">Worst margin first</SelectItem>
          <SelectItem value="margin_desc">Best margin first</SelectItem>
          <SelectItem value="model_id">Model id (A–Z)</SelectItem>
        </SelectContent>
      </Select>

      {filtered && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}

      <span className="ml-auto text-sm text-neutral-400 tabular-nums">
        {shown} of {total}
      </span>
      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        Refresh
      </Button>
    </div>
  );
}
