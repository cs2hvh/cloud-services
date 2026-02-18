'use client';

import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState, useCallback } from 'react';
import {
  BuildInfo,
  AppsList,
  StatsCards,
  SupportedFrameworks,
  GitProviders,
  HowItWorks,
} from '@/components/dashboard/apps';
import api from '@/lib/axios/axios';
import { useRealtimeApps } from '@/hooks/use-realtime-apps';
import { createClient } from '@/lib/supabase/client';

export default function ApplicationDeploymentPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [buildInfo, setBuildInfo] = useState<Record<string, BuildInfo>>({});
  const [buildLogs, setBuildLogs] = useState<Record<string, string>>({});
  const [fetchedBuilds, setFetchedBuilds] = useState<Set<string>>(new Set());
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});
  const [logsError, setLogsError] = useState<Record<string, string>>({});
  const [localApps, setLocalApps] = useState<typeof realtimeApps>([]);

  // Get user ID on mount
  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  // Real-time apps subscription
  const { 
    apps: realtimeApps, 
    loading, 
    connectionStatus 
  } = useRealtimeApps({ 
    userId: userId || '',
    enabled: !!userId,
    limit: 100 
  });

  // Sync real-time apps to local state (with optimistic updates)
  useEffect(() => {
    setLocalApps(realtimeApps);
  }, [realtimeApps]);

  // Use local apps for display (allows optimistic updates)
  const deployedApps = localApps;

  // Check if any app is being deleted
  // const hasDeleting = deployedApps.some((app) => app.status === 'deleting');

  // Handle optimistic updates (for immediate feedback before real-time confirms)
  const handleUpdateApps = (updater: (apps: typeof localApps) => typeof localApps) => {
    setLocalApps(updater);
  };

  // Fetch build info using axios - only called for apps with valid status
  const fetchBuildInfo = useCallback(async (appName: string) => {
    try {
      // Accept 404 responses locally so the global axios interceptor doesn't toast
      // while this UI polls the endpoint for pending builds.
      const res = await api.get(`/jenkins/build-info?app=${appName}`, {
        validateStatus: (status) => status < 500,
      });

      if (res?.status === 200 && res?.data && !res.data.error) {
        setBuildInfo((prev) => ({ ...prev, [appName]: res.data }));
      }
      // If status is 404 the endpoint may be pending (no builds yet) — ignore here.
    } catch (error) {
      console.log(`[fetchBuildInfo] Build info not available for ${appName}:`, error);
    }
  }, []);

  // Fetch build logs using axios - only called when user expands logs
  const fetchBuildLogs = useCallback(async (appName: string, buildNumber: number) => {
    // Set loading state
    setLogsLoading((prev) => ({ ...prev, [appName]: true }));
    setLogsError((prev) => ({ ...prev, [appName]: '' }));
    
    try {
      const res = await api.get(`/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=0&deployment=true`);
      if (res?.data?.logs) {
        setBuildLogs((prev) => ({ ...prev, [appName]: res.data.logs }));
        setLogsError((prev) => ({ ...prev, [appName]: '' }));
      } else {
        setLogsError((prev) => ({ ...prev, [appName]: 'No logs available' }));
      }
    } catch (error) {
      console.error(`[fetchBuildLogs] Failed to fetch logs for ${appName}:`, error);
      setLogsError((prev) => ({ ...prev, [appName]: 'Failed to load logs. Click to retry.' }));
    } finally {
      setLogsLoading((prev) => ({ ...prev, [appName]: false }));
    }
  }, []);

  // Fetch build info for each app (only once per app, skip for pending/deleting apps)
  useEffect(() => {
    deployedApps.forEach((app) => {
      // Skip fetching build info for apps that are pending or deleting (no Jenkins job yet)
      if (app.status === 'pending' || app.status === 'deleting') {
        return;
      }
      if (!fetchedBuilds.has(app.name)) {
        fetchBuildInfo(app.name);
        setFetchedBuilds((prev) => new Set(prev).add(app.name));
      }
    });
  }, [deployedApps, fetchedBuilds, fetchBuildInfo]);

  // Refresh build info for apps that are building (reduced from 10s to 30s since real-time handles status)
  useEffect(() => {
    const buildingApps = deployedApps.filter((app) => {
      const build = buildInfo[app.name];
      return build?.building || app.status === 'building';
    });

    if (buildingApps.length === 0) return;

    const interval = setInterval(() => {
      buildingApps.forEach((app) => {
        fetchBuildInfo(app.name);
      });
    }, 30000); // 30 seconds instead of 10 (real-time handles app status updates)

    return () => clearInterval(interval);
  }, [deployedApps, buildInfo, fetchBuildInfo]);

  // Calculate stats
  const stats = {
    totalApps: deployedApps.length,
    activeDeployments: deployedApps.filter((app) => app.status === 'running').length,
    totalBuilds: deployedApps.length,
    successRate:
      deployedApps.length > 0
        ? `${Math.round(
            (deployedApps.filter((app) => app.status === 'running').length / deployedApps.length) *
              100
          )}%`
        : '100%',
  };

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            Application Deployment
            {connectionStatus === 'connected' && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse" />
                Live
              </Badge>
            )}
          </h1>
          <p className="text-white/60">
            Deploy your applications directly from Git repositories with automatic builds and
            scaling.
          </p>
        </div>
        <Link
          href="/dashboard/services/apps/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          Deploy Application
        </Link>
      </motion.div>

      {/* About Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-8"
      >
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-3">What is Application Deployment?</h2>
            <p className="text-white/70 leading-relaxed">
              Our Application Deployment platform allows you to deploy web applications, APIs, and
              static sites directly from your Git repositories. Similar to Vercel or DigitalOcean
              App Platform, simply connect your GitHub, GitLab, or Bitbucket repository and
              we&apos;ll automatically build and deploy your application. With support for popular
              frameworks like Next.js, React, Vue, Node.js, Python, and more, you can go from code
              to production in minutes with automatic SSL, custom domains, and global CDN
              distribution.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <StatsCards
          totalApps={stats.totalApps}
          activeDeployments={stats.activeDeployments}
          totalBuilds={stats.totalBuilds}
          successRate={stats.successRate}
        />
      </motion.div>

      {/* Deployed Applications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <AppsList
          apps={deployedApps}
          loading={loading}
          buildInfo={buildInfo}
          buildLogs={buildLogs}
          logsLoading={logsLoading}
          logsError={logsError}
          onFetchLogs={fetchBuildLogs}
          onUpdateApps={handleUpdateApps}
        />
      </motion.div>

      {/* Supported Frameworks */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <SupportedFrameworks />
      </motion.div>

      {/* Git Providers */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <GitProviders />
      </motion.div>

      {/* How It Works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <HowItWorks />
      </motion.div>
    </div>
  );
}
