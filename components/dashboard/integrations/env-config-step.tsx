'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  Key, 
  Eye, 
  EyeOff, 
  RefreshCw,
  AlertTriangle,
  Info
} from 'lucide-react';
import type { EnvVarConfig } from './types';

interface EnvConfigStepProps {
  envVarConfigs: EnvVarConfig[];
  onChange: (configs: EnvVarConfig[]) => void;
  conflicts: string[];
  onResolveConflicts?: () => void;
  disabled?: boolean;
}

/**
 * Environment variable configuration step
 * Allows users to customize env key names before injection
 */
export function EnvConfigStep({
  envVarConfigs,
  onChange,
  conflicts,
  onResolveConflicts,
  disabled = false,
}: EnvConfigStepProps) {
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  const toggleShowValue = (key: string) => {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleKeyChange = (index: number, newKey: string) => {
    const updated = [...envVarConfigs];
    // Sanitize: uppercase, alphanumeric + underscore only
    updated[index].customKey = newKey.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    onChange(updated);
  };

  const resetToDefault = (index: number) => {
    const updated = [...envVarConfigs];
    updated[index].customKey = updated[index].originalKey;
    onChange(updated);
  };

  const conflictSet = new Set(conflicts);

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-400 font-medium">Customize Environment Variables</p>
            <p className="text-xs text-blue-400/70 mt-1">
              You can rename the variable keys to match your app&apos;s configuration. 
              These will be injected into your app.
            </p>
          </div>
        </div>
      </div>

      {/* Conflict Warning */}
      {conflicts.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-yellow-400 font-medium">Variable Name Conflicts</p>
              <p className="text-xs text-yellow-400/70 mt-1">
                These variable names already exist in your app: {conflicts.join(', ')}
              </p>
              {onResolveConflicts && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onResolveConflicts}
                  className="text-yellow-400 hover:text-yellow-300 mt-2 h-7 px-2"
                >
                  Force Overwrite
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Env Var List */}
      <div className="space-y-3">
        {envVarConfigs.map((config, index) => (
          <div 
            key={config.originalKey}
            className={`p-3 rounded-lg border ${
              conflictSet.has(config.customKey)
                ? 'bg-yellow-500/5 border-yellow-500/30'
                : 'bg-white/5 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-white/50">{config.description}</Label>
              {config.customKey !== config.originalKey && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resetToDefault(index)}
                  disabled={disabled}
                  className="h-6 px-2 text-xs text-white/40 hover:text-white"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              )}
            </div>
            
            {/* Key Input */}
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-4 h-4 text-white/40" />
              <Input
                value={config.customKey}
                onChange={(e) => handleKeyChange(index, e.target.value)}
                disabled={disabled}
                className={`flex-1 bg-white/5 border-white/10 text-white font-mono text-sm ${
                  conflictSet.has(config.customKey) ? 'border-yellow-500/50' : ''
                }`}
                placeholder="VARIABLE_NAME"
              />
            </div>

            {/* Value Preview */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/30 w-4">=</span>
              <div className="flex-1 relative">
                <Input
                  value={showValues[config.originalKey] ? config.value : '••••••••••••'}
                  readOnly
                  className="flex-1 bg-white/5 border-white/10 text-white/60 font-mono text-xs pr-10"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleShowValue(config.originalKey)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                >
                  {showValues[config.originalKey] ? (
                    <EyeOff className="w-3 h-3 text-white/40" />
                  ) : (
                    <Eye className="w-3 h-3 text-white/40" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="pt-2 border-t border-white/10">
        <p className="text-xs text-white/40">
          {envVarConfigs.length} environment variable{envVarConfigs.length !== 1 ? 's' : ''} will be injected
        </p>
      </div>
    </div>
  );
}
