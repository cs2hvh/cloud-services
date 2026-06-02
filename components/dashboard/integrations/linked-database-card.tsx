'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  ChevronDown,
  ChevronUp,
  Key,
  Link2Off,
  Loader2,
  Pencil,
  RotateCw,
} from 'lucide-react';
import { IntegrationBadge } from './integration-badge';
import type { LinkedDatabase } from './types';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface LinkedDatabaseCardProps {
  database: LinkedDatabase;
  onUnlink: (databaseId: string) => Promise<void>;
  onEdit?: (databaseId: string) => void;
  onRetry?: (databaseId: string) => void;
  unlinking?: boolean;
}

export function LinkedDatabaseCard({
  database,
  onUnlink,
  onEdit,
  onRetry,
  unlinking = false,
}: LinkedDatabaseCardProps) {
  const [showEnvVars, setShowEnvVars] = useState(false);

  const getEngineLogoPath = () => {
    switch (database.engine) {
      case 'pg': return '/images/database-logos/postgresql.png';
      case 'mysql': return '/images/database-logos/mysql.svg';
      case 'mongodb': return '/images/database-logos/mongodb.png';
      default: return '/images/database-logos/postgresql.png';
    }
  };

  const getEngineLabel = (engine?: string) => {
    switch (engine) {
      case 'pg': return 'PostgreSQL';
      case 'mysql': return 'MySQL';
      case 'mongodb': return 'MongoDB';
      default: return engine || 'Database';
    }
  };

  return (
    <div className="rounded-[5px] border border-white/[0.06] bg-[#0d0e11] overflow-hidden">
      <div className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Database info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="h-9 w-9 rounded-[6px] bg-[#111216] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Image
                src={getEngineLogoPath()}
                alt={getEngineLabel(database.engine)}
                width={20}
                height={20}
                className="object-contain max-h-5 max-w-5"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5 min-w-0">
                <span className={`${MONO} min-w-0 max-w-full text-[13px] font-semibold text-white truncate`}>
                  {database.database_name || database.database_cluster_id}
                </span>
                <IntegrationBadge status={database.status} />
              </div>
              <p className={`${MONO} text-[11px] text-white/40`}>
                {getEngineLabel(database.engine)}
              </p>
              <p className={`${MONO} text-[10.5px] text-white/30 mt-0.5`}>
                Linked {new Date(database.linked_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-1.5 sm:flex-shrink-0 sm:justify-end">
            <button
              type="button"
              onClick={() => setShowEnvVars(!showEnvVars)}
              className={`${MONO} inline-flex h-8 items-center gap-1 rounded-[5px] border border-white/[0.08] bg-[#0d0e11] px-2.5 text-[10.5px] text-white/55 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04] hover:text-white`}
            >
              <Key className="h-3 w-3" />
              {database.injected_env_keys?.length || 0} vars
              {showEnvVars ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {onEdit && database.status === 'linked' && (
              <button
                type="button"
                onClick={() => onEdit(database.database_cluster_id)}
                title="Edit env var names"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-white/[0.08] bg-[#0d0e11] text-white/45 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04] hover:text-white"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onRetry && database.status === 'failed' && (
              <button
                type="button"
                onClick={() => onRetry(database.database_cluster_id)}
                title="Retry linking"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-amber-400/25 bg-[#0d0e11] text-amber-300 transition-colors hover:bg-amber-500/[0.10]"
              >
                <RotateCw className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onUnlink(database.database_cluster_id)}
              disabled={unlinking || database.status === 'pending'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-rose-500/25 bg-[#0d0e11] text-rose-300 transition-colors hover:bg-rose-500/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {unlinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Env vars panel */}
        {showEnvVars && database.injected_env_keys && database.injected_env_keys.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.10em] text-white/35 mb-2`}>
              Injected variables
            </p>
            <div className="rounded-[4px] border border-white/[0.06] bg-[#111216] divide-y divide-white/[0.04] overflow-hidden">
              {database.injected_env_keys.map((key) => (
                <div key={key} className={`${MONO} break-all px-3 py-1.5 text-[11px] text-white/55`}>
                  {key}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
