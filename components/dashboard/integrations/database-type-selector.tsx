'use client';

import { Database } from 'lucide-react';
import { DATABASE_ENGINES, type DatabaseEngineType } from './types';

interface DatabaseTypeSelectorProps {
  selected: DatabaseEngineType | null;
  onSelect: (engine: DatabaseEngineType) => void;
  disabled?: boolean;
}

/**
 * Database type selector - MySQL, PostgreSQL, MongoDB
 */
export function DatabaseTypeSelector({
  selected,
  onSelect,
  disabled = false,
}: DatabaseTypeSelectorProps) {
  const engines = Object.entries(DATABASE_ENGINES) as [DatabaseEngineType, typeof DATABASE_ENGINES[DatabaseEngineType]][];

  return (
    <div className="grid grid-cols-3 gap-3">
      {engines.map(([engine, config]) => (
        <button
          key={engine}
          type="button"
          onClick={() => onSelect(engine)}
          disabled={disabled}
          className={`
            p-4 rounded-lg border-2 transition-all text-center
            ${selected === engine
              ? 'bg-blue-500/20 border-blue-500/50 ring-2 ring-blue-500/30'
              : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="text-3xl mb-2">{config.icon}</div>
          <p className={`font-medium ${config.color}`}>{config.label}</p>
        </button>
      ))}
    </div>
  );
}
