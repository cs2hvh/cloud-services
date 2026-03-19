'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DomainConnectionItem, DomainPurchase } from './domain-detail-types';

interface DomainOverviewTabProps {
  purchaseRequest: DomainPurchase | null;
  connections: DomainConnectionItem[];
  connectedAppNames: string[];
}

export function DomainOverviewTab({
  purchaseRequest,
  connections,
  connectedAppNames,
}: DomainOverviewTabProps) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="text-base">Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-white/75">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/55">Purchase status:</span>
          <span>{purchaseRequest?.status || 'Externally registered — not purchased through us'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/55">Connected apps:</span>
          <span>{connectedAppNames.length > 0 ? connectedAppNames.join(', ') : 'None yet'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/55">SSL:</span>
          <span>
            {connections.some((c) => c.sslStatus === 'active')
              ? 'Certificate active'
              : 'Not yet issued'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
