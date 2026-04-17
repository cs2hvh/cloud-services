'use client';

import Image from 'next/image';
import { DATABASE_ENGINES, type DatabaseEngineType } from './types';

// Logo paths and metadata for each engine
const ENGINE_LOGOS: Record<DatabaseEngineType, { path: string; alt: string; width: number; height: number }> = {
  pg: {
    path: '/images/database-logos/postgresql.png',
    alt: 'PostgreSQL',
    width: 64,
    height: 64,
  },
  mysql: {
    path: '/images/database-logos/mysql.svg',
    alt: 'MySQL',
    width: 80,
    height: 40,
  },
  mongodb: {
    path: '/images/database-logos/mongodb.png',
    alt: 'MongoDB',
    width: 64,
    height: 64,
  },
};

const ENGINE_DESCRIPTIONS: Record<DatabaseEngineType, string> = {
  pg: 'Relational SQL',
  mysql: 'Relational SQL',
  mongodb: 'Document NoSQL',
};

interface DatabaseTypeSelectorProps {
  selected: DatabaseEngineType | null;
  onSelect: (engine: DatabaseEngineType) => void;
  disabled?: boolean;
}

export function DatabaseTypeSelector({
  selected,
  onSelect,
  disabled = false,
}: DatabaseTypeSelectorProps) {
  const engines = Object.entries(DATABASE_ENGINES) as [DatabaseEngineType, typeof DATABASE_ENGINES[DatabaseEngineType]][];

  return (
    <div className="grid grid-cols-3 gap-3">
      {engines.map(([engine, config]) => {
        const isSelected = selected === engine;
        const logo = ENGINE_LOGOS[engine];
        return (
          <button
            key={engine}
            type="button"
            onClick={() => onSelect(engine)}
            disabled={disabled}
            className={`
              relative flex flex-col items-center gap-3 p-4 rounded-lg border transition-all text-center
              ${isSelected
                ? 'bg-blue-500/10 border-blue-500/50'
                : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {isSelected && (
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-blue-400" />
            )}
            <div className="relative h-10 flex items-center justify-center">
              <Image
                src={logo.path}
                alt={logo.alt}
                width={logo.width}
                height={logo.height}
                className={`object-contain h-full max-h-10 w-auto ${
                  isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-90'
                }`}
              />
            </div>
            <div>
              <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-white/70'}`}>
                {config.label}
              </p>
              <p className={`text-xs mt-0.5 ${isSelected ? 'text-blue-400/70' : 'text-white/30'}`}>
                {ENGINE_DESCRIPTIONS[engine]}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
