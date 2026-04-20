'use client';

import { AlertCircle, ShieldAlert } from 'lucide-react';

interface EnvVarsWarningsProps {
  hasSensitiveVisible: boolean;
  hasDuplicates: boolean;
}

export function EnvVarsWarnings({ hasSensitiveVisible, hasDuplicates }: EnvVarsWarningsProps) {
  return (
    <>
      {/* Always-visible security reminder */}
      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-amber-300 text-xs">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Environment variables are stored encrypted at rest. Never commit secrets to source
          control — use this panel to manage them securely.
        </span>
      </div>

      {/* Sensitive value visible */}
      {hasSensitiveVisible && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            One or more sensitive values are currently visible on screen. Hide them when done to
            avoid accidental exposure.
          </span>
        </div>
      )}

      {/* Duplicate key */}
      {hasDuplicates && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Duplicate variable names detected. Only the last value will be used. Remove duplicates
            before saving.
          </span>
        </div>
      )}
    </>
  );
}
