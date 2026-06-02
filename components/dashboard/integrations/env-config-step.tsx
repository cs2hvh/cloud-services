'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { EnvVarConfig } from './types';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface EnvConfigStepProps {
  envVarConfigs: EnvVarConfig[];
  onChange: (configs: EnvVarConfig[]) => void;
  conflicts: string[];
  onResolveConflicts?: () => void;
  disabled?: boolean;
}

const isPlaceholderValue = (value: string) =>
  value.startsWith('(fetched') || value === '' || value === 'creating...' || value === 'will be generated';

export function EnvConfigStep({
  envVarConfigs,
  onChange,
  conflicts,
  onResolveConflicts,
  disabled = false,
}: EnvConfigStepProps) {
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleKeyChange = (index: number, raw: string) => {
    const updated = [...envVarConfigs];
    updated[index] = { ...updated[index], customKey: raw.toUpperCase().replace(/[^A-Z0-9_]/g, '') };
    onChange(updated);
  };

  const resetKey = (index: number) => {
    const updated = [...envVarConfigs];
    updated[index] = { ...updated[index], customKey: updated[index].originalKey };
    onChange(updated);
  };

  const conflictSet = new Set(conflicts);
  const allValuesArePlaceholders = envVarConfigs.every(c => isPlaceholderValue(c.value));

  return (
    <div className="space-y-3">
      {/* Info banner */}
      <div className={`${MONO} flex items-start gap-2.5 px-3 py-2.5 border border-white/[0.06] bg-white/[0.02] rounded-[6px]`}>
        <ShieldCheck className="h-3.5 w-3.5 text-white/30 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-white/40 leading-relaxed">
          {allValuesArePlaceholders
            ? 'Credentials are fetched securely at link time and never exposed here. Rename the variable keys below.'
            : "Rename keys to match your app's expected variable names. Values shown are the actual credentials."}
        </p>
      </div>

      {/* Conflict warning */}
      {conflicts.length > 0 && (
        <div className={`${MONO} flex items-start gap-2.5 px-3 py-2.5 border border-amber-400/20 bg-amber-500/[0.05] rounded-[6px]`}>
          <AlertTriangle className="h-3.5 w-3.5 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-amber-200 font-semibold mb-0.5">Variable name conflicts</p>
            <p className="text-[10.5px] text-amber-200/60 break-all">{conflicts.join(', ')}</p>
            {onResolveConflicts && (
              <button
                type="button"
                onClick={onResolveConflicts}
                className="mt-1.5 text-[10.5px] text-amber-300 underline underline-offset-2 hover:text-amber-200"
              >
                Force overwrite
              </button>
            )}
          </div>
        </div>
      )}

      {/* Variable rows */}
      <div className="border border-white/[0.06] rounded-[6px] overflow-hidden divide-y divide-white/[0.05] max-h-[280px] overflow-y-auto">
        <div className={`${MONO} hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-3 px-3 py-2 bg-[#111216] text-[10px] uppercase tracking-[0.12em] text-white/30`}>
          <span>Variable name</span>
          <span>Injected value</span>
        </div>
        {envVarConfigs.map((config, index) => {
          const hasConflict = conflictSet.has(config.customKey);
          const isModified = config.customKey !== config.originalKey;
          const isPlaceholder = isPlaceholderValue(config.value);
          const isRevealed = revealedKeys.has(config.originalKey);

          return (
            <div
              key={config.originalKey}
              className={`flex flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${hasConflict ? 'bg-amber-500/[0.04]' : 'bg-[#0d0e11]'}`}
            >
              {/* Key column */}
              <div className="w-full min-w-0 sm:flex-1">
                <div className="flex items-center gap-1.5">
                  <input
                    value={config.customKey}
                    onChange={(e) => handleKeyChange(index, e.target.value)}
                    disabled={disabled}
                    spellCheck={false}
                    className={`${MONO} h-7 w-full bg-[#111216] border text-[11.5px] text-white/90 px-2 rounded-[4px] focus:outline-none focus:border-[#0095FF]/50 transition-colors disabled:opacity-50 ${
                      hasConflict ? 'border-amber-400/40 text-amber-300' : 'border-white/[0.08]'
                    }`}
                  />
                  {isModified && (
                    <button
                      type="button"
                      onClick={() => resetKey(index)}
                      disabled={disabled}
                      title="Reset to default"
                      className="text-white/25 hover:text-white/55 flex-shrink-0 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className={`${MONO} text-[10px] text-white/30 mt-0.5 truncate`}>{config.description}</p>
              </div>

              {/* Value column */}
              <div className="flex w-full min-w-0 items-center gap-1.5 rounded-[4px] border border-white/[0.05] bg-[#111216]/60 px-2 py-1.5 sm:flex-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                {isPlaceholder ? (
                  <span className={`${MONO} text-[10.5px] text-white/25 italic`}>
                    Injected on link
                  </span>
                ) : (
                  <>
                    <span className={`${MONO} flex-1 text-[11px] text-white/50 truncate`}>
                      {isRevealed ? config.value : '•'.repeat(Math.min(config.value.length, 20))}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleReveal(config.originalKey)}
                      className="text-white/25 hover:text-white/55 flex-shrink-0 transition-colors"
                    >
                      {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className={`${MONO} text-[10.5px] text-white/30`}>
        {envVarConfigs.length} variable{envVarConfigs.length !== 1 ? 's' : ''} will be injected
      </p>
    </div>
  );
}
