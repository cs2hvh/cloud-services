'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  ArrowUpDown,
  Trash2,
  X,
} from 'lucide-react';

interface EnvVarsToolbarProps {
  count: number;
  sortAsc: boolean | null;
  showClearConfirm: boolean;
  onSort: () => void;
  onClearRequest: () => void;
  onClearConfirm: () => void;
  onClearCancel: () => void;
}

export function EnvVarsToolbar({
  count,
  sortAsc,
  showClearConfirm,
  onSort,
  onClearRequest,
  onClearConfirm,
  onClearCancel,
}: EnvVarsToolbarProps) {
  const hasVars = count > 0;

  return (
    <div className="flex flex-wrap justify-between items-center gap-2">
      <Label className="text-white">
        Environment Variables
        {hasVars && (
          <span className="ml-2 text-white/40 font-normal text-xs">({count})</span>
        )}
      </Label>

      {hasVars && (
        <div className="flex gap-1.5 flex-wrap">
          {/* Sort */}
          <Button
            type="button"
            onClick={onSort}
            size="sm"
            variant="outline"
            className="border-white/20 text-white/70 hover:bg-white/10 h-7 px-2 text-xs"
            title="Sort alphabetically"
          >
            <ArrowUpDown className="h-3 w-3 mr-1" />
            {sortAsc === true ? 'Z→A' : 'A→Z'}
          </Button>

          {/* Clear all — two-step confirm */}
          {showClearConfirm ? (
            <span className="flex items-center gap-1">
              <Button
                type="button"
                onClick={onClearConfirm}
                size="sm"
                variant="outline"
                className="border-red-500/70 text-red-400 hover:bg-red-500/20 h-7 px-2 text-xs"
              >
                Confirm Clear
              </Button>
              <Button
                type="button"
                onClick={onClearCancel}
                size="sm"
                variant="ghost"
                className="text-white/40 hover:text-white h-7 w-7 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              onClick={onClearRequest}
              size="sm"
              variant="outline"
              className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-7 px-2 text-xs"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Clear All
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
