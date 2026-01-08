'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Database, 
  Link2Off, 
  Loader2,
  Key,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { IntegrationBadge } from './integration-badge';
import type { LinkedDatabase } from './types';

interface LinkedDatabaseCardProps {
  database: LinkedDatabase;
  onUnlink: (databaseId: string) => Promise<void>;
  unlinking?: boolean;
}

/**
 * Card displaying a linked database with unlink action
 */
export function LinkedDatabaseCard({ 
  database, 
  onUnlink,
  unlinking = false 
}: LinkedDatabaseCardProps) {
  const [showEnvVars, setShowEnvVars] = useState(false);

  const getEngineIcon = () => {
    // Could add specific icons per engine type
    return <Database className="w-5 h-5 text-blue-400" />;
  };

  const getEngineLabel = (engine?: string) => {
    switch (engine) {
      case 'pg':
        return 'PostgreSQL';
      case 'mysql':
        return 'MySQL';
      case 'mongodb':
        return 'MongoDB';
      case 'redis':
        return 'Redis';
      case 'kafka':
        return 'Kafka';
      default:
        return engine || 'Database';
    }
  };

  return (
    <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Database Info */}
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-lg bg-blue-500/10">
              {getEngineIcon()}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUnlink(database.database_cluster_id)}
              disabled={unlinking || database.status !== 'linked'}
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
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-white/50 mb-2">Injected Environment Variables:</p>
            <div className="flex flex-wrap gap-2">
              {database.injected_env_keys.map((key) => (
                <code 
                  key={key} 
                  className="text-xs bg-black/30 text-green-400 px-2 py-1 rounded"
                >
                  {key}
                </code>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
