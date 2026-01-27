'use client';

import { useState, useMemo } from 'react';
import { Search, Code, Plus, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AppCard } from './app-card';
import { DeleteAppModal } from './delete-app-modal';
import { App, BuildInfo } from './types';
import { useMultipleAppMetrics } from '@/hooks/use-app-metrics';

interface AppsListProps {
  apps: App[];
  loading: boolean;
  buildInfo: Record<string, BuildInfo>;
  buildLogs: Record<string, string>;
  logsLoading: Record<string, boolean>;
  logsError: Record<string, string>;
  onFetchLogs: (appName: string, buildNumber: number) => void;
  onUpdateApps: (updater: (apps: App[]) => App[]) => void;
}

export function AppsList({
  apps,
  loading,
  buildInfo,
  buildLogs,
  logsLoading,
  logsError,
  onFetchLogs,
  onUpdateApps,
}: AppsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  
  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [appToDelete, setAppToDelete] = useState<{ id: string; name: string; originalStatus: string } | null>(null);

  // Get app IDs for running apps only (no need to fetch metrics for non-running apps)
  const runningAppIds = useMemo(() => 
    apps.filter(app => app.status === 'running').map(app => app.id),
    [apps]
  );

  // Fetch metrics for all running apps
  const { data: metricsData, loading: metricsLoading } = useMultipleAppMetrics({
    appIds: runningAppIds,
    enabled: runningAppIds.length > 0,
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  // Filter apps based on search
  const filteredApps = apps.filter((app) =>
    app.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = (appId: string, appName: string) => {
    const app = apps.find((a) => a.id === appId);
    setAppToDelete({ id: appId, name: appName, originalStatus: app?.status || 'running' });
    setDeleteModalOpen(true);
  };

  const handleDeleteStart = (appId: string) => {
    onUpdateApps((prev) =>
      prev.map((app) => (app.id === appId ? { ...app, status: 'deleting' } : app))
    );
  };

  const handleDeleteSuccess = (appId: string) => {
    onUpdateApps((prev) => prev.filter((app) => app.id !== appId));
    setAppToDelete(null);
  };

  const handleDeleteError = (appId: string) => {
    const originalStatus = appToDelete?.originalStatus || 'running';
    onUpdateApps((prev) =>
      prev.map((app) => (app.id === appId ? { ...app, status: originalStatus } : app))
    );
    setAppToDelete(null);
  };

  // Reset appToDelete when modal closes
  const handleModalOpenChange = (open: boolean) => {
    setDeleteModalOpen(open);
    if (!open) {
      // Small delay to avoid UI flicker during close animation
      setTimeout(() => setAppToDelete(null), 150);
    }
  };

  return (
    <>
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl text-white">Deployed Applications</CardTitle>
              <CardDescription className="text-white/60">
                Manage your deployed applications and view build status
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-white/60 border-white/20">
              {apps.length} {apps.length === 1 ? 'app' : 'apps'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 text-white/30 mb-4 animate-spin" />
              <p className="text-white/60">Loading applications...</p>
            </div>
          ) : apps.length > 0 ? (
            <div>
              {/* Search bar */}
              <div className="bg-black/30 p-3 rounded-lg mb-4 flex items-center justify-between border border-white/5">
                <div className="flex items-center w-full max-w-md">
                  <Search className="w-4 h-4 text-white/40 mr-2" />
                  <input
                    type="text"
                    placeholder="Search applications..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-transparent focus:outline-none text-sm text-white placeholder-white/40"
                  />
                </div>
                <div className="text-xs text-white/50">
                  {filteredApps.length} of {apps.length}
                </div>
              </div>

              {/* Scrollable apps list */}
              <div className="max-h-[500px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {filteredApps.map((app) => {
                  const appMetrics = metricsData[app.id];
                  return (
                    <AppCard
                      key={app.id}
                      app={app}
                      build={buildInfo[app.name]}
                      logs={buildLogs[app.name]}
                      logsLoading={logsLoading[app.name]}
                      logsError={logsError[app.name]}
                      isExpanded={selectedApp === app.name}
                      onToggleLogs={() =>
                        setSelectedApp(selectedApp === app.name ? null : app.name)
                      }
                      onDelete={() => handleDelete(app.id, app.name)}
                      onFetchLogs={(buildNumber) => onFetchLogs(app.name, buildNumber)}
                      metrics={appMetrics?.metrics}
                      health={appMetrics?.health}
                      metricsLoading={metricsLoading && app.status === 'running'}
                    />
                  );
                })}
              </div>

              {/* No results message */}
              {filteredApps.length === 0 && searchTerm && (
                <div className="text-center py-8">
                  <Search className="w-8 h-8 text-white/20 mx-auto mb-2" />
                  <p className="text-sm text-white/50">
                    No applications match &quot;{searchTerm}&quot;
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/10 rounded-lg">
              <Code className="h-10 w-10 text-white/20 mb-3" />
              <h3 className="text-base font-medium text-white mb-1">No Applications Deployed</h3>
              <p className="text-sm text-white/50 text-center mb-4 max-w-sm">
                Deploy your first application from a Git repository to get started.
              </p>
              <Button size="sm" asChild>
                <Link href="/dashboard/services/apps/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Deploy Your First App
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Modal */}
      <DeleteAppModal
        open={deleteModalOpen}
        onOpenChange={handleModalOpenChange}
        appId={appToDelete?.id || null}
        appName={appToDelete?.name || null}
        onDeleteStart={handleDeleteStart}
        onDeleteSuccess={handleDeleteSuccess}
        onDeleteError={handleDeleteError}
      />
    </>
  );
}
