'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { 
  Link2Off, 
  Loader2,
  Key,
  ChevronDown,
  ChevronUp,
  Pencil,
  RotateCw,
  Archive,
} from 'lucide-react';
import { IntegrationBadge } from './integration-badge';
import type { LinkedBucket } from './types';

interface LinkedStorageCardProps {
  bucket: LinkedBucket;
  onUnlink: (bucketId: string) => Promise<void>;
  onEdit?: (bucketId: string) => void;
  onRetry?: (bucketId: string) => void;
  unlinking?: boolean;
  retrying?: boolean;
}

/**
 * Card displaying a linked object storage bucket with unlink action
 */
export function LinkedStorageCard({ 
  bucket,
  onUnlink,
  onEdit,
  onRetry,
  unlinking = false,
  retrying = false 
}: LinkedStorageCardProps) {
  const [showEnvVars, setShowEnvVars] = useState(false);

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Bucket Info */}
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-lg flex items-center justify-center h-10 w-10 bg-neutral-800">
              <Archive className="h-5 w-5 text-neutral-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-white truncate">
                  {bucket.bucket_name}
                </h4>
                <IntegrationBadge status={bucket.status} />
              </div>
              <p className="text-sm text-white/50">
                {bucket.region}
                {bucket.env_prefix && bucket.env_prefix !== 'CUSTOM' && (
                  <span className="ml-2 text-white/40">{bucket.env_prefix}_*</span>
                )}
              </p>
              <p className="text-xs text-white/40 mt-1">
                Linked {new Date(bucket.linked_at).toLocaleDateString()}
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
              {bucket.injected_vars?.length || 0} vars
              {showEnvVars ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </Button>
            {/* Edit button — rename env var keys */}
            {onEdit && bucket.status === 'linked' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(bucket.bucket_id)}
                className="text-white/60 hover:text-white hover:bg-white/10"
                title="Edit env var names"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
            {/* Retry button — for failed integrations */}
            {onRetry && bucket.status === 'failed' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRetry(bucket.bucket_id)}
                disabled={retrying}
                className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                title="Retry linking"
              >
                {retrying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCw className="w-4 h-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUnlink(bucket.bucket_id)}
              disabled={unlinking || bucket.status === 'pending'}
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
        {showEnvVars && bucket.injected_vars && bucket.injected_vars.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-2">
              <Key className="w-3 h-3 text-white/40" />
              <p className="text-[11px] text-white/40 uppercase tracking-wide">Injected variables</p>
            </div>
            <div className="rounded border border-white/[0.06] bg-black/20 divide-y divide-white/[0.05] overflow-hidden">
              {bucket.injected_vars.map((key) => (
                <div key={key} className="px-2.5 py-1.5 font-mono text-[11px] text-white/60">
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
