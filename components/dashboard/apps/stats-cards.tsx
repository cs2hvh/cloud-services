'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  totalApps: number;
  activeDeployments: number;
  totalBuilds: number;
  successRate: string;
}

export function StatsCards({ totalApps, activeDeployments, totalBuilds, successRate }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/60">Total Apps</p>
              <p className="text-2xl font-bold text-white">{totalApps}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <Image src="/dashboard icons/total apps.png" alt="Total Apps" width={44} height={44} className="h-11 w-11 object-contain" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/60">Active Deployments</p>
              <p className="text-2xl font-bold text-white">{activeDeployments}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <Image src="/dashboard icons/healthy.png" alt="Active Deployments" width={44} height={44} className="h-11 w-11 object-contain" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/60">Total Builds</p>
              <p className="text-2xl font-bold text-white">{totalBuilds}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <Image src="/dashboard icons/active builds.png" alt="Total Builds" width={44} height={44} className="h-11 w-11 object-contain" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/60">Success Rate</p>
              <p className="text-2xl font-bold text-white">{successRate}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <Image src="/dashboard icons/sucess rate .png" alt="Success Rate" width={44} height={44} className="h-11 w-11 object-contain" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
