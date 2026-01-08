'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Database, 
  Loader2, 
  AlertTriangle,
  CheckCircle2,
  Search
} from 'lucide-react';
import type { AvailableDatabase, LinkDatabaseResponse } from './types';

interface LinkDatabaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  appName: string;
  databases: AvailableDatabase[];
  loadingDatabases?: boolean;
  onLink: (databaseId: string, envPrefix: string, force: boolean) => Promise<LinkDatabaseResponse>;
  onSuccess?: () => void;
}

/**
 * Modal for linking a database to an app
 */
export function LinkDatabaseModal({
  open,
  onOpenChange,
  appId,
  appName,
  databases,
  loadingDatabases = false,
  onLink,
  onSuccess,
}: LinkDatabaseModalProps) {
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [envPrefix, setEnvPrefix] = useState('DATABASE');
  const [force, setForce] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [success, setSuccess] = useState<{ injectedVars: string[]; redeployTriggered: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDatabases = databases.filter(db => 
    db.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    db.engine.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getEngineLabel = (engine: string) => {
    switch (engine) {
      case 'pg': return 'PostgreSQL';
      case 'mysql': return 'MySQL';
      case 'mongodb': return 'MongoDB';
      case 'redis': return 'Redis';
      default: return engine;
    }
  };

  const handleLink = async () => {
    if (!selectedDb) return;

    setLinking(true);
    setError(null);
    setConflicts([]);
    setSuccess(null);

    try {
      const result = await onLink(selectedDb, envPrefix, force);

      if (!result.success) {
        if (result.code === 'ENV_VAR_CONFLICT' && result.conflicts) {
          setConflicts(result.conflicts);
          setError('Environment variable conflict detected. Check the box below to overwrite.');
        } else {
          setError(result.error || 'Failed to link database');
        }
        return;
      }

      setSuccess({
        injectedVars: result.injected_vars || [],
        redeployTriggered: result.redeploy_triggered || false,
      });

      // Auto-close after success
      setTimeout(() => {
        onOpenChange(false);
        onSuccess?.();
        // Reset state
        setSelectedDb(null);
        setEnvPrefix('DATABASE');
        setForce(false);
        setError(null);
        setConflicts([]);
        setSuccess(null);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link database');
    } finally {
      setLinking(false);
    }
  };

  const handleClose = () => {
    if (!linking) {
      onOpenChange(false);
      setSelectedDb(null);
      setEnvPrefix('DATABASE');
      setForce(false);
      setError(null);
      setConflicts([]);
      setSuccess(null);
      setSearchQuery('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            Link Database
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Connect a database to <span className="text-white font-medium">{appName}</span>.
            Environment variables will be automatically injected.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Database Linked!</h3>
            <p className="text-white/60 text-sm mb-4">
              {success.injectedVars.length} environment variables injected
            </p>
            {success.redeployTriggered && (
              <p className="text-sm text-blue-400">
                Redeploy triggered to apply changes
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search databases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-white"
              />
            </div>

            {/* Database List */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {loadingDatabases ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                </div>
              ) : filteredDatabases.length === 0 ? (
                <div className="text-center py-8 text-white/50">
                  {searchQuery ? 'No databases match your search' : 'No databases available'}
                </div>
              ) : (
                filteredDatabases.map((db) => (
                  <button
                    key={db.cluster_id}
                    onClick={() => setSelectedDb(db.cluster_id)}
                    disabled={db.status !== 'online'}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      selectedDb === db.cluster_id
                        ? 'bg-blue-500/20 border-blue-500/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    } ${db.status !== 'online' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5 text-blue-400" />
                      <div className="flex-1">
                        <p className="font-medium text-white">{db.name}</p>
                        <p className="text-xs text-white/50">
                          {getEngineLabel(db.engine)} • {db.region || 'Unknown region'}
                        </p>
                      </div>
                      {db.status !== 'online' && (
                        <span className="text-xs text-yellow-400">{db.status}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Env Prefix */}
            <div className="space-y-2">
              <Label className="text-white/70">Environment Variable Prefix</Label>
              <Input
                value={envPrefix}
                onChange={(e) => setEnvPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder="DATABASE"
                className="bg-white/5 border-white/10 text-white font-mono"
              />
              <p className="text-xs text-white/40">
                Variables will be named: {envPrefix}_URL, {envPrefix}_HOST, etc.
              </p>
            </div>

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-400 font-medium">Conflicting Variables</p>
                    <p className="text-xs text-yellow-400/70 mt-1">
                      These variables already exist: {conflicts.join(', ')}
                    </p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={force}
                        onChange={(e) => setForce(e.target.checked)}
                        className="rounded border-yellow-500/50"
                      />
                      <span className="text-xs text-yellow-400">Overwrite existing variables</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && !conflicts.length && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={linking}
                className="text-white/60"
              >
                Cancel
              </Button>
              <Button
                onClick={handleLink}
                disabled={!selectedDb || linking}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {linking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Linking...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 mr-2" />
                    Link Database
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
