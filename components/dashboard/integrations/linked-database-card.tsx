'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { 
  // Database, 
  Link2Off, 
  Loader2,
  Key,
  ChevronDown,
  ChevronUp,
  Pencil,
  RotateCw,
} from 'lucide-react';
import { IntegrationBadge } from './integration-badge';
import type { LinkedDatabase } from './types';

interface LinkedDatabaseCardProps {
  database: LinkedDatabase;
  onUnlink: (databaseId: string) => Promise<void>;
  onEdit?: (databaseId: string) => void;
  onRetry?: (databaseId: string) => void;
  unlinking?: boolean;
}

/**
 * Card displaying a linked database with unlink action
 */
export function LinkedDatabaseCard({ 
  database, 
  onUnlink,
  onEdit,
  onRetry,
  unlinking = false 
}: LinkedDatabaseCardProps) {
  const [showEnvVars, setShowEnvVars] = useState(false);

  const getEngineLogoPath = () => {
    switch (database.engine) {
      case 'pg':
        return '/images/database-logos/postgresql.png';
      case 'mysql':
        return '/images/database-logos/mysql.svg';
      case 'mongodb':
        return '/images/database-logos/mongodb.png';
      default:
        return '/images/database-logos/postgresql.png';
    }
  };

  const getEngineColor = () => {
    switch (database.engine) {
      case 'pg': return 'text-blue-400 bg-blue-500/10';
      case 'mysql': return 'text-orange-400 bg-orange-500/10';
      case 'mongodb': return 'text-green-400 bg-green-500/10';
      default: return 'text-blue-400 bg-blue-500/10';
    }
  };

  const getEngineLabel = (engine?: string) => {
    switch (engine) {
      case 'pg':
        return 'PostgreSQL';
      case 'mysql':
        return 'MySQL';
      case 'mongodb':
        return 'MongoDB';
      default:
        return engine || 'Database';
    }
  };

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-colors">      
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Database Info */}
          <div className="flex items-start gap-3 flex-1">
            <div className={`p-2 rounded-lg flex items-center justify-center h-10 w-10 ${getEngineColor()}`}>
              <Image
                src={getEngineLogoPath()}
                alt={getEngineLabel(database.engine)}
                width={24}
                height={24}
                className="object-contain h-full w-full max-h-6 max-w-6"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-white truncate">
                  {database.database_name || database.database_cluster_id}
                </h4>
                <IntegrationBadge status={database.status} />
              </div>
              <p className="text-sm text-white/50">
                {getEngineLabel(database.engine)}
              </p>
              <p className="text-xs text-white/40 mt-1">
                Linked {new Date(database.linked_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEnvVars(!showEnvVars)}
              className="text-white/60 hover:text-white"
            >
              <Key className="w-4 h-4 mr-1" />
              {database.injected_env_keys?.length || 0} vars
              {showEnvVars ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </Button>
            {/* Edit button — rename env var keys */}
            {onEdit && database.status === 'linked' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(database.database_cluster_id)}
                className="text-white/60 hover:text-white hover:bg-white/10"
                title="Edit env var names"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
            {/* Retry button — for failed integrations */}
            {onRetry && database.status === 'failed' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRetry(database.database_cluster_id)}
                className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                title="Retry linking"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUnlink(database.database_cluster_id)}
              disabled={unlinking || database.status === 'pending'}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              {unlinking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2Off className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Injected Environment Variables */}
        {showEnvVars && database.injected_env_keys && database.injected_env_keys.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[11px] text-white/40 mb-2 uppercase tracking-wide">Injected variables</p>
            <div className="rounded border border-white/[0.06] bg-black/20 divide-y divide-white/[0.05] overflow-hidden">
              {database.injected_env_keys.map((key) => (
                <div key={key} className="px-2.5 py-1.5 font-mono text-[11px] text-white/55">
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
