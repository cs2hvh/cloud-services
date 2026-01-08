'use client';

import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Link2Off,
  Loader2 
} from 'lucide-react';
import type { IntegrationStatus } from './types';

interface IntegrationBadgeProps {
  status: IntegrationStatus;
  className?: string;
}

/**
 * Status badge for integration state
 */
export function IntegrationBadge({ status, className = '' }: IntegrationBadgeProps) {
  switch (status) {
    case 'linked':
      return (
        <Badge className={`bg-green-500/20 text-green-400 border-green-500/30 ${className}`}>
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Linked
        </Badge>
      );
    case 'pending':
      return (
        <Badge className={`bg-yellow-500/20 text-yellow-400 border-yellow-500/30 ${className}`}>
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Pending
        </Badge>
      );
    case 'failed':
      return (
        <Badge className={`bg-red-500/20 text-red-400 border-red-500/30 ${className}`}>
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case 'unlinked':
      return (
        <Badge className={`bg-white/10 text-white/50 border-white/20 ${className}`}>
          <Link2Off className="w-3 h-3 mr-1" />
          Unlinked
        </Badge>
      );
    default:
      return (
        <Badge className={`bg-white/10 text-white/50 ${className}`}>
          <Clock className="w-3 h-3 mr-1" />
          Unknown
        </Badge>
      );
  }
}
