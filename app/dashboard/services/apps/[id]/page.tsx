'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Globe,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  GitBranch,
  GitCommit,
  Terminal,
  Activity,
  Settings,
  Trash2,
  Clock,
  Box,
  Cpu,
  HardDrive,
  Network,
  Layers,
  RefreshCw,
  Copy,
  Check,
  Link2,
  Play,
  Plus,
  X,
  Save,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeleteAppModal } from '@/components/dashboard/apps/delete-app-modal';
import { CustomDomainsManager } from '@/components/dashboard/apps/custom-domains';
import { BuildInfo } from '@/components/dashboard/apps/types';
import { useAppDetails, useAppMetrics } from '@/hooks/use-app-metrics';

// Extended App type for detail page (includes all fields from API)
interface AppDetail {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  port: number;
  status: string;
  deployment_url?: string;
  created_at: string;
  project_id?: string;
  // Extended fields
  framework?: string;
  branch?: string;
  git_provider?: string;
  auto_deploy?: boolean;
  deploy_branch?: string;
  build_command?: string;
  output_directory?: string;
  env_vars?: Array<{ key: string; value: string }>;
}

function getStatusBadge(status: string, building?: boolean) {
  if (building) {
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        Building
      </Badge>
    );
  }

  switch (status) {
    case 'running':
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Running
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case 'building':
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Building
        </Badge>
      );
    case 'deleting':
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Deleting
        </Badge>
      );
    default:
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          Pending
        </Badge>
      );
  }
}

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;

  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [buildLogs, setBuildLogs] = useState<string>('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Array<{
    build_number: number;
    status: string;
    started_at: string;
    duration?: number;
    commit_sha?: string;
    commit_message?: string;
  }>>([]);

  // Environment variables editing state
  const [editedEnvVars, setEditedEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [envVarsModified, setEnvVarsModified] = useState(false);
  const [savingEnvVars, setSavingEnvVars] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [envVarError, setEnvVarError] = useState<string | null>(null);
  const [envVarSuccess, setEnvVarSuccess] = useState<string | null>(null);

  // Fetch detailed K8s info
  const { details, loading: detailsLoading, refetch: refetchDetails } = useAppDetails({
    appId,
    enabled: app?.status === 'running',
  });

  // Fetch metrics
  const { metrics, health, loading: metricsLoading } = useAppMetrics({
    appId,
    enabled: app?.status === 'running',
    refreshInterval: 30000,
  });

  const fetchApp = useCallback(async () => {
    try {
      const res = await fetch('/api/services/platform-apps/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId }),
      });
      
      if (!res.ok) {
        if (res.status === 404) {
          setError('App not found');
        } else if (res.status === 403) {
          setError('You do not have permission to view this app');
        } else {
          setError('Failed to load app');
        }
        return;
      }

      const data = await res.json();
      setApp(data);
    } catch (err) {
      console.error('Error fetching app:', err);
      setError('Failed to load app');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const fetchBuildInfo = useCallback(async (appName: string) => {
    try {
      const res = await fetch(`/api/jenkins/build-info?app=${appName}`);
      if (res.ok) {
        const data = await res.json();
        setBuildInfo(data);
      }
    } catch (error) {
      console.error('Error fetching build info:', error);
    }
  }, []);

  const fetchBuildLogs = useCallback(async (appName: string, buildNumber: number) => {
    try {
      const res = await fetch(
        `/api/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=0`
      );
      if (res.ok) {
        const data = await res.json();
        setBuildLogs(data.logs || 'No logs available');
      }
    } catch (error) {
      console.error('Error fetching build logs:', error);
    }
  }, []);

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/platform-apps/deployments?app_id=${appId}`);
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments || []);
      }
    } catch (error) {
      console.error('Error fetching deployments:', error);
    }
  }, [appId]);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  useEffect(() => {
    if (app?.name) {
      fetchBuildInfo(app.name);
      fetchDeployments();
    }
  }, [app?.name, fetchBuildInfo, fetchDeployments]);

  useEffect(() => {
    if (app?.name && buildInfo?.number) {
      fetchBuildLogs(app.name, buildInfo.number);
    }
  }, [app?.name, buildInfo?.number, fetchBuildLogs]);

  // Auto-refresh for building apps
  useEffect(() => {
    if (app?.status === 'building' || buildInfo?.building) {
      const interval = setInterval(() => {
        fetchApp();
        if (app?.name) {
          fetchBuildInfo(app.name);
          if (buildInfo?.number) {
            fetchBuildLogs(app.name, buildInfo.number);
          }
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [app?.status, app?.name, buildInfo?.building, buildInfo?.number, fetchApp, fetchBuildInfo, fetchBuildLogs]);

  // Initialize edited env vars when app data loads
  useEffect(() => {
    if (app?.env_vars) {
      setEditedEnvVars(app.env_vars.map(env => ({ ...env })));
    }
  }, [app?.env_vars]);

  // Handle env var changes
  const handleEnvVarChange = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...editedEnvVars];
    updated[index] = { ...updated[index], [field]: newValue };
    setEditedEnvVars(updated);
    setEnvVarsModified(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);
  };

  const handleAddEnvVar = () => {
    setEditedEnvVars([...editedEnvVars, { key: '', value: '' }]);
    setEnvVarsModified(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);
  };

  const handleRemoveEnvVar = (index: number) => {
    setEditedEnvVars(editedEnvVars.filter((_, i) => i !== index));
    setEnvVarsModified(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);
  };

  const handleSaveEnvVars = async () => {
    if (!app) return;
    
    // Filter out empty entries and validate
    const validEnvVars = editedEnvVars.filter(env => env.key.trim() !== '');
    
    // Check for duplicate keys
    const keys = validEnvVars.map(e => e.key.trim());
    const uniqueKeys = new Set(keys);
    if (keys.length !== uniqueKeys.size) {
      setEnvVarError('Duplicate environment variable keys are not allowed');
      return;
    }

    setSavingEnvVars(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);

    try {
      const res = await fetch('/api/services/platform-apps/env-vars/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: app.id,
          env_vars: validEnvVars.map(env => ({
            key: env.key.trim(),
            value: env.value,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save environment variables');
      }

      setEnvVarSuccess('Environment variables saved successfully');
      setEnvVarsModified(false);
      
      // Update local app state
      setApp(prev => prev ? { ...prev, env_vars: validEnvVars } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save environment variables';
      setEnvVarError(message);
    } finally {
      setSavingEnvVars(false);
    }
  };

  const handleRedeploy = async () => {
    if (!app) return;

    setRedeploying(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);

    try {
      const res = await fetch('/api/services/platform-apps/redeploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: app.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to trigger redeploy');
      }

      const data = await res.json();
      setEnvVarSuccess(`Redeploy triggered (Build #${data.build_number})`);
      
      // Update status and refresh
      setApp(prev => prev ? { ...prev, status: 'building' } : null);
      fetchApp();
      fetchDeployments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to trigger redeploy';
      setEnvVarError(message);
    } finally {
      setRedeploying(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDeleteSuccess = () => {
    router.push('/dashboard/services/apps');
  };

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
        <div className="text-center py-20">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">{error || 'App not found'}</h2>
          <Link href="/dashboard/services/apps">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Apps
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const domain = app.deployment_url
    ? new URL(app.deployment_url).hostname
    : `${app.slug}.galaxyhvh.com`;

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          href="/dashboard/services/apps"
          className="inline-flex items-center text-white/60 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Apps
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{app.name}</h1>
              {getStatusBadge(app.status, buildInfo?.building)}
            </div>
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/50 hover:text-blue-400 flex items-center gap-1 transition-colors"
            >
              <Globe className="w-4 h-4" />
              {domain}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchApp();
                if (app.name) fetchBuildInfo(app.name);
                refetchDetails();
              }}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteModalOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
      >
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 mb-1">Framework</p>
            <p className="text-sm font-medium text-white">{app.framework || 'Not specified'}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 mb-1">Branch</p>
            <p className="text-sm font-medium text-white flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {app.branch}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 mb-1">Port</p>
            <p className="text-sm font-mono text-white">{app.port}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 mb-1">Created</p>
            <p className="text-sm text-white">
              {new Date(app.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="overview" className="data-[state=active]:bg-white/10">
              <Activity className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="domains" className="data-[state=active]:bg-white/10">
              <Link2 className="w-4 h-4 mr-2" />
              Domains
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-white/10">
              <Terminal className="w-4 h-4 mr-2" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="deployments" className="data-[state=active]:bg-white/10">
              <Layers className="w-4 h-4 mr-2" />
              Deployments
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-white/10">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Health & Metrics */}
            {app.status === 'running' && (
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Box className="w-5 h-5" />
                    Health & Metrics
                    {(detailsLoading || metricsLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {details || metrics ? (
                    <>
                      {/* Health Status */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-black/30 rounded-lg p-4">
                          <p className="text-xs text-white/40 mb-1">Status</p>
                          <Badge className={`${
                            health?.status === 'healthy' || details?.pod?.phase === 'Running' ? 'bg-green-500/20 text-green-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {health?.status || details?.pod?.phase || 'Unknown'}
                          </Badge>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4">
                          <p className="text-xs text-white/40 mb-1">Pods</p>
                          <p className="text-xl font-bold text-white">
                            {details?.deployment?.readyReplicas || health?.pod_count || 0}/{details?.deployment?.replicas || 1}
                          </p>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4">
                          <p className="text-xs text-white/40 mb-1">Restarts</p>
                          <p className="text-xl font-bold text-white">
                            {details?.container?.restartCount || health?.restart_count || 0}
                          </p>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4">
                          <p className="text-xs text-white/40 mb-1">Uptime</p>
                          <p className="text-sm text-white">{details?.pod?.uptime || '-'}</p>
                        </div>
                      </div>

                      {/* Resource Usage */}
                      {metrics && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-black/30 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-white/40 flex items-center gap-1">
                                <Cpu className="w-3.5 h-3.5" /> CPU Usage
                              </p>
                              <span className="text-sm font-mono text-white">
                                {(metrics.cpu_usage ?? 0).toFixed(2)}%
                              </span>
                            </div>
                            <Progress value={metrics.cpu_usage ?? 0} className="h-2" />
                          </div>
                          <div className="bg-black/30 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-white/40 flex items-center gap-1">
                                <HardDrive className="w-3.5 h-3.5" /> Memory Usage
                              </p>
                              <span className="text-sm font-mono text-white">
                                {(metrics.memory_mb ?? 0).toFixed(1)} Mi
                              </span>
                            </div>
                            <Progress value={metrics.memory_usage ?? 0} className="h-2" />
                          </div>
                        </div>
                      )}

                      {/* Network Info */}
                      {details?.network && (
                        <div className="bg-black/30 rounded-lg p-4">
                          <h5 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                            <Network className="w-4 h-4" />
                            Network
                          </h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <p className="text-xs text-white/40 mb-1">Ingress Host</p>
                              <p className="text-xs font-mono text-white truncate">{details.network.ingressHost}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 mb-1">TLS</p>
                              <Badge className={details.network.tlsEnabled ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                                {details.network.tlsEnabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 mb-1">Service</p>
                              <p className="text-xs text-white">{details.network.serviceName}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 mb-1">Port</p>
                              <p className="text-xs font-mono text-white">{details.network.servicePort}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-white/50">
                      <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>Loading metrics...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Repository Info */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GitBranch className="w-5 h-5" />
                  Repository
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-white/40 mb-1">Repository URL</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-mono text-white truncate flex-1">
                        {app.repository_url}
                      </p>
                      <button
                        onClick={() => copyToClipboard(app.repository_url, 'repo')}
                        className="text-white/30 hover:text-white/70 transition-colors"
                      >
                        {copiedField === 'repo' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Git Provider</p>
                    <p className="text-sm text-white capitalize">{app.git_provider}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Auto Deploy</p>
                    <Badge className={app.auto_deploy ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}>
                      {app.auto_deploy ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Deploy Branch</p>
                    <p className="text-sm text-white">{app.deploy_branch || app.branch}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Domains Tab */}
          <TabsContent value="domains">
            <CustomDomainsManager
              appId={app.id}
              appStatus={app.status}
              platformDomain={domain}
            />
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Terminal className="w-5 h-5" />
                    Build Logs
                    {buildInfo && <span className="text-white/50">#{buildInfo.number}</span>}
                  </CardTitle>
                  {buildInfo?.building && (
                    <Badge className="bg-blue-500/20 text-blue-400">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Building
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-white/70 font-mono overflow-x-auto max-h-[500px] overflow-y-auto bg-black/50 rounded-lg p-4">
                  {buildLogs || 'Loading logs...'}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Deployments Tab */}
          <TabsContent value="deployments">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Deployment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deployments.length > 0 ? (
                  <div className="space-y-2">
                    {deployments.map((deployment, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col p-3 bg-black/30 rounded-lg gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono text-white">
                              #{deployment.build_number}
                            </span>
                            <Badge className={
                              deployment.status === 'SUCCESS' ? 'bg-green-500/20 text-green-400' :
                              deployment.status === 'FAILURE' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }>
                              {deployment.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-white/50">
                            {deployment.duration && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {Math.round(deployment.duration / 1000)}s
                              </span>
                            )}
                            <span>
                              {new Date(deployment.started_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        {/* Commit Info Row */}
                        {(deployment.commit_sha || deployment.commit_message) && (
                          <div className="flex items-center gap-2 text-xs text-white/60 pl-1">
                            <GitCommit className="w-3 h-3 text-white/40" />
                            {deployment.commit_sha && (
                              <code className="px-1.5 py-0.5 bg-white/10 rounded text-blue-400 font-mono">
                                {deployment.commit_sha}
                              </code>
                            )}
                            {deployment.commit_message && (
                              <span className="truncate max-w-[300px]" title={deployment.commit_message}>
                                {deployment.commit_message}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-white/50">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No deployment history available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    App Settings
                  </CardTitle>
                  <Button
                    onClick={handleRedeploy}
                    disabled={redeploying || app.status === 'building' || app.status === 'deleting'}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {redeploying ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Redeploying...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Redeploy
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-white/40 mb-1">Build Command</p>
                    <p className="text-sm font-mono text-white bg-black/30 p-2 rounded">
                      {app.build_command || 'Default'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Output Directory</p>
                    <p className="text-sm font-mono text-white bg-black/30 p-2 rounded">
                      {app.output_directory || 'Default'}
                    </p>
                  </div>
                </div>

                {/* Environment Variables - Editable */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-white/40">Environment Variables</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddEnvVar}
                      className="h-7 text-xs border-white/20 text-white hover:bg-white/10"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Variable
                    </Button>
                  </div>

                  {/* Success/Error Messages */}
                  {envVarError && (
                    <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                      {envVarError}
                    </div>
                  )}
                  {envVarSuccess && (
                    <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {envVarSuccess}
                    </div>
                  )}

                  {editedEnvVars.length > 0 ? (
                    <div className="space-y-2">
                      {editedEnvVars.map((env, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-black/30 p-2 rounded">
                          <Input
                            type="text"
                            value={env.key}
                            onChange={(e) => handleEnvVarChange(idx, 'key', e.target.value)}
                            placeholder="KEY"
                            className="flex-1 max-w-[200px] h-8 text-sm font-mono bg-black/50 border-white/10 text-blue-400 placeholder:text-white/30"
                          />
                          <span className="text-white/30">=</span>
                          <Input
                            type="text"
                            value={env.value}
                            onChange={(e) => handleEnvVarChange(idx, 'value', e.target.value)}
                            placeholder="value"
                            className="flex-1 h-8 text-sm font-mono bg-black/50 border-white/10 text-white placeholder:text-white/30"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveEnvVar(idx)}
                            className="h-8 w-8 p-0 text-white/50 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-white/50">No environment variables configured. Click "Add Variable" to add one.</p>
                  )}

                  {/* Save Button */}
                  {envVarsModified && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        onClick={handleSaveEnvVars}
                        disabled={savingEnvVars}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {savingEnvVars ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                      <span className="text-xs text-white/50">
                        Note: After saving, click "Redeploy" to apply changes to your app.
                      </span>
                    </div>
                  )}
                </div>

                {/* Danger Zone */}
                <div className="border-t border-white/10 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h4>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteModalOpen(true)}
                    className="w-full md:w-auto"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Application
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Delete Modal */}
      <DeleteAppModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        appId={app?.id || null}
        appName={app?.name || null}
        onDeleteStart={() => setApp(prev => prev ? { ...prev, status: 'deleting' } : null)}
        onDeleteSuccess={handleDeleteSuccess}
        onDeleteError={() => setApp(prev => prev ? { ...prev, status: 'failed' } : null)}
      />
    </div>
  );
}
