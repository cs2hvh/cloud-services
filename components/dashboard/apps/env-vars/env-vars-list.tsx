'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, X } from 'lucide-react';
import { EnvVarRow } from './env-var-row';
import { type EnvVar, type IndexedEnvVar } from './env-vars-types';

interface EnvVarsListProps {
  vars: EnvVar[];
  searchQuery: string;
  draggedIndex: number | null;
  copiedField: string | null;
  onSearchChange: (q: string) => void;
  onAddVar: () => void;
  onUpdate: (idx: number, field: 'key' | 'value', val: string) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>, idx: number, field: 'key' | 'value') => void;
  onToggleVisible: (idx: number) => void;
  onCopyRow: (env: IndexedEnvVar) => void;
  onDuplicate: (idx: number) => void;
  onRemove: (idx: number) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDragEnd: () => void;
}

export function EnvVarsList({
  vars,
  searchQuery,
  draggedIndex,
  copiedField,
  onSearchChange,
  onAddVar,
  onUpdate,
  onPaste,
  onToggleVisible,
  onCopyRow,
  onDuplicate,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: EnvVarsListProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const hasVars = vars.length > 0;

  // Attach original indices before filtering
  const indexed: IndexedEnvVar[] = vars.map((env, idx) => ({ ...env, idx }));
  const filtered = indexed.filter(
    env =>
      !searchQuery ||
      env.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      env.value.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      {/* Search bar */}
      {hasVars && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={`Search ${vars.length} variable${vars.length !== 1 ? 's' : ''}…`}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/50 pl-10 pr-8"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Search result count */}
      {searchQuery && (
        <p className="text-xs text-white/40">
          {filtered.length === 0
            ? `No match for "${searchQuery}"`
            : `${filtered.length} of ${vars.length} variable${vars.length !== 1 ? 's' : ''} match`}
        </p>
      )}

      {/* Empty state */}
      {!hasVars && (
        <div className="flex flex-col items-center gap-2 py-10 text-white/40">
          <div className="border border-dashed border-white/20 rounded-full p-3">
            <Plus className="h-5 w-5" />
          </div>
          <p className="text-sm">No environment variables yet</p>
          <p className="text-xs text-white/30">
            Click &ldquo;Add Variable&rdquo; below or upload a .env file above
          </p>
        </div>
      )}

      {/* Variable list */}
      {hasVars && (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-0.5">
          {filtered.map((env) => (
            <EnvVarRow
              key={env.idx}
              env={env}
              allVars={vars}
              isDragging={draggedIndex === env.idx}
              searchActive={!!searchQuery}
              isCopied={copiedField === env.key}
              onUpdate={onUpdate}
              onPaste={onPaste}
              onToggleVisible={onToggleVisible}
              onCopy={onCopyRow}
              onDuplicate={onDuplicate}
              onRemove={onRemove}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            />
          ))}

          {searchQuery && filtered.length === 0 && (
            <div className="text-center py-6 text-white/40 text-sm">
              No variables match &ldquo;{searchQuery}&rdquo;
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="block mx-auto mt-2 text-xs text-white/50 underline hover:text-white"
              >
                Clear search
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          type="button"
          onClick={onAddVar}
          size="sm"
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
        >
          <Plus className="h-3 w-3 mr-1" /> Add Variable
        </Button>
        {vars.length > 1 && !searchQuery && (
          <span className="text-xs text-white/30">Drag rows to reorder</span>
        )}
      </div>
    </div>
  );
}
