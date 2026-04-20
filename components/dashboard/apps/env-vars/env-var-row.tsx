'use client';

import { Input } from '@/components/ui/input';
import {
  Eye,
  EyeOff,
  GripVertical,
  AlertCircle,
  ShieldAlert,
  Copy,
  Check,
  Files,
  Trash2,
  Unlock,
  Loader2,
} from 'lucide-react';
import {
  type IndexedEnvVar,
  isSensitiveKey,
  getSuggestions,
  validateKey,
  type EnvVar,
} from './env-vars-types';

interface EnvVarRowProps {
  env: IndexedEnvVar;
  allVars: EnvVar[];
  isDragging: boolean;
  searchActive: boolean;
  isCopied: boolean;
  isRevealing?: boolean;
  onUpdate: (idx: number, field: 'key' | 'value', val: string) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>, idx: number, field: 'key' | 'value') => void;
  onToggleVisible: (idx: number) => void;
  onReveal: (idx: number) => void;
  onCopy: (env: IndexedEnvVar) => void;
  onDuplicate: (idx: number) => void;
  onRemove: (idx: number) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDragEnd: () => void;
}

export function EnvVarRow({
  env,
  allVars,
  isDragging,
  searchActive,
  isCopied,
  isRevealing = false,
  onUpdate,
  onPaste,
  onToggleVisible,
  onReveal,
  onCopy,
  onDuplicate,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: EnvVarRowProps) {
  // An existing var that hasn't been revealed yet — value is masked server-side
  const needsReveal = env.hasValue && !env.revealed;
  const validation = validateKey(env.key, allVars);
  const sensitive = isSensitiveKey(env.key);
  const usedKeys = new Set(allVars.map(e => e.key));
  const suggestions = getSuggestions(env.key ?? '', usedKeys);

  // Whether a sub-row of messages needs to be rendered at all.
  // For sensitive keys we ALWAYS render it (with an invisible spacer when hidden)
  // so the row height never jumps when toggling the eye icon.
  const needsSubRow = sensitive || !validation.valid;
  const showSensitiveWarning = sensitive && env.visible;

  return (
    <div
      className={`group rounded-md transition-colors ${
        isDragging ? 'bg-white/20' : 'hover:bg-white/5'
      }`}
      draggable={!searchActive}
      onDragStart={() => onDragStart(env.idx)}
      onDragOver={(e) => onDragOver(e, env.idx)}
      onDragEnd={onDragEnd}
    >
      {/* ── Main input row ──────────────────────────────────────────────── */}
      <div className="flex gap-2 items-center p-2 flex-wrap sm:flex-nowrap">
        {/* Drag handle */}
        <div
          className={`cursor-grab active:cursor-grabbing shrink-0 self-center transition-opacity ${
            searchActive ? 'opacity-0 pointer-events-none' : ''
          }`}
        >
          <GripVertical className="h-4 w-4 text-white/30 group-hover:text-white/60" />
        </div>

        {/* Key input */}
        <div className="w-full sm:w-[42%] shrink-0 min-w-0">
          <Input
            value={env.key ?? ''}
            onChange={(e) =>
              onUpdate(env.idx, 'key', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))
            }
            onPaste={(e) => onPaste(e, env.idx, 'key')}
            placeholder="VARIABLE_NAME"
            className={`bg-white/10 border-white/20 text-white placeholder:text-white/50 font-mono text-sm w-full ${
              !validation.valid ? 'border-red-500 focus-visible:ring-red-500/40' : ''
            }`}
            list={`env-suggestions-${env.idx}`}
          />
          <datalist id={`env-suggestions-${env.idx}`}>
            {suggestions.map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        {/* Value input — truncates long revealed values, never wraps */}
        <div className="flex-1 min-w-0 relative">
          {needsReveal ? (
            // Value not yet fetched — show masked placeholder + reveal button
            <div className="flex items-center h-9 px-3 rounded-md bg-white/10 border border-white/20 gap-2">
              <span className="font-mono text-sm text-white/30 tracking-widest select-none flex-1">
                ••••••••
              </span>
              <button
                type="button"
                onClick={() => onReveal(env.idx)}
                disabled={isRevealing}
                className="text-white/40 hover:text-white transition-colors disabled:opacity-50"
                title="Reveal value"
              >
                {isRevealing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unlock className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ) : (
            <>
              <Input
                value={env.value ?? ''}
                onChange={(e) => onUpdate(env.idx, 'value', e.target.value)}
                onPaste={(e) => onPaste(e, env.idx, 'value')}
                placeholder="value"
                type={env.visible ? 'text' : 'password'}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 pr-8 font-mono text-sm w-full"
                style={{ textOverflow: 'ellipsis' }}
              />
              <button
                type="button"
                onClick={() => onToggleVisible(env.idx)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                title={env.visible ? 'Hide value' : 'Show value'}
              >
                {env.visible ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          )}
        </div>

        {/* Row actions */}
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onCopy(env)}
            className="p-1.5 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors"
            title="Copy KEY=VALUE"
          >
            {isCopied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(env.idx)}
            className="p-1.5 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors"
            title="Duplicate variable"
          >
            <Files className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(env.idx)}
            className="p-1.5 rounded text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove variable"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Sub-row: error / sensitive warning ─────────────────────────────
          Always rendered for sensitive keys (with invisible spacer) so the
          row height is stable and toggling the eye never causes a layout jump.
      ─────────────────────────────────────────────────────────────────────── */}
      {needsSubRow && (
        <div className="flex gap-2 px-2 pb-1.5 pl-8 sm:pl-10 flex-wrap sm:flex-nowrap">
          {/* Key-column slot: validation error or invisible spacer */}
          <div className="w-full sm:w-[42%] shrink-0 min-w-0 h-4 flex items-center">
            {!validation.valid && (
              <div className="flex items-center gap-1 text-red-400 text-xs">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {validation.error}
              </div>
            )}
          </div>

          {/* Value-column slot: sensitive warning or invisible spacer */}
          <div className="flex-1 min-w-0 h-4 flex items-center">
            {showSensitiveWarning && (
              <div className="flex items-center gap-1 text-amber-400 text-xs">
                <ShieldAlert className="h-3 w-3 shrink-0" />
                Sensitive — hide when done
              </div>
            )}
          </div>

          {/* Spacer aligning with the actions column (3 × 28 px buttons + 2 × 4 px gap ≈ 92 px) */}
          <div className="shrink-0 w-[92px]" aria-hidden />
        </div>
      )}
    </div>
  );
}
