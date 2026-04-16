'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Eye,
  EyeOff,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import type { EnvVarConfig } from './types';

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
      next.has(key) ? next.delete(key) : next.add(key);
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
    <div className="space-y-4">
      {/* Info banner */}
      {allValuesArePlaceholders ? (
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-neutral-800/60 border border-white/[0.07]">
          <ShieldCheck className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/50 leading-relaxed">
            Connection credentials are fetched securely from DigitalOcean at link time and never exposed in this UI.
            You can rename the variable keys below.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-neutral-800/60 border border-white/[0.07]">
          <ShieldCheck className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/50 leading-relaxed">
            Rename keys to match your app&apos;s expected variable names. Values shown are the actual credentials that will be injected.
          </p>
        </div>
      )}

      {/* Conflict warning */}
      {conflicts.length > 0 && (
        <div className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-400 font-medium mb-0.5">Variable name conflicts</p>
            <p className="text-xs text-amber-400/70 break-all">{conflicts.join(', ')}</p>
            {onResolveConflicts && (
              <button
                type="button"
                onClick={onResolveConflicts}
                className="mt-1.5 text-xs text-amber-400 underline underline-offset-2 hover:text-amber-300"
              >
                Force overwrite
              </button>
            )}
          </div>
        </div>
      )}

      {/* Variable rows — constrain height to prevent overflow */}
      <div className="rounded-md border border-white/[0.08] overflow-hidden divide-y divide-white/[0.06] max-h-[280px] overflow-y-auto">
        {envVarConfigs.map((config, index) => {
          const hasConflict = conflictSet.has(config.customKey);
          const isModified = config.customKey !== config.originalKey;
          const isPlaceholder = isPlaceholderValue(config.value);
          const isRevealed = revealedKeys.has(config.originalKey);

          return (
            <div
              key={config.originalKey}
              className={`flex items-center gap-3 px-3 py-2.5 ${hasConflict ? 'bg-amber-500/5' : 'bg-transparent'}`}
            >
              {/* Key column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={config.customKey}
                    onChange={(e) => handleKeyChange(index, e.target.value)}
                    disabled={disabled}
                    className={`
                      h-7 font-mono text-xs bg-white/[0.04] border-white/10 text-white/90 px-2
                      focus:ring-0 focus:ring-offset-0
                      ${hasConflict ? 'border-amber-500/50 text-amber-400' : ''}
                    `}
                    spellCheck={false}
                  />
                  {isModified && (
                    <button
                      type="button"
                      onClick={() => resetKey(index)}
                      disabled={disabled}
                      title="Reset to default"
                      className="text-white/30 hover:text-white/60 flex-shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-white/30 mt-0.5 truncate">{config.description}</p>
              </div>

              {/* Value column */}
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                {isPlaceholder ? (
                  <span className="text-[11px] text-white/30 italic font-mono truncate">
                    Injected on link
                  </span>
                ) : (
                  <>
                    <span className="flex-1 font-mono text-[11px] text-white/50 truncate">
                      {isRevealed ? config.value : '•'.repeat(Math.min(config.value.length, 20))}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleReveal(config.originalKey)}
                      className="text-white/30 hover:text-white/60 flex-shrink-0"
                    >
                      {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-white/30">
        {envVarConfigs.length} variable{envVarConfigs.length !== 1 ? 's' : ''} will be injected
      </p>
    </div>
  );
}
