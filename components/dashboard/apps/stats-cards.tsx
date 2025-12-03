'use client';

import { Code, Globe, GitBranch } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
            <Code className="h-8 w-8 text-blue-400" />
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
            <Globe className="h-8 w-8 text-green-400" />
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
            <GitBranch className="h-8 w-8 text-purple-400" />
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
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Healthy</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
