'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  HardDrive, 
  Link2Off, 
  Loader2,
  Key,
  ChevronDown,
  ChevronUp,
  MapPin,
} from 'lucide-react';
import { IntegrationBadge } from './integration-badge';
import type { LinkedBucket } from './types';

interface LinkedStorageCardProps {
  bucket: LinkedBucket;
  onUnlink: (bucketId: string) => Promise<void>;
  unlinking?: boolean;
}

/**
 * Card displaying a linked object storage bucket with unlink action
 */
export function LinkedStorageCard({ 
  bucket, 
  onUnlink,
  unlinking = false 
}: LinkedStorageCardProps) {
  const [showEnvVars, setShowEnvVars] = useState(false);

  return (
    <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Bucket Info */}
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <HardDrive className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-white truncate">
                  {bucket.bucket_name}
                </h4>
                <IntegrationBadge status={bucket.status} />
              </div>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <MapPin className="w-3 h-3" />
                <span>{bucket.region}</span>
                <span className="text-white/30">•</span>
                <span className="text-purple-400">{bucket.env_prefix}_*</span>
              </div>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUnlink(bucket.bucket_id)}
              disabled={unlinking || bucket.status !== 'linked'}
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
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-white/50 mb-2">Injected Environment Variables:</p>
            <div className="flex flex-wrap gap-2">
              {bucket.injected_vars.map((key) => (
                <code 
                  key={key} 
                  className="text-xs bg-black/30 text-purple-400 px-2 py-1 rounded"
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
