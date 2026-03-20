'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  X,
  Save,
  ArrowUpCircle,
  Zap,
  Server,
  AlertTriangle,
  FolderOpen,
  Edit2,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DeleteAppModal } from '@/components/dashboard/apps/delete-app-modal';
import { CustomDomainsManager } from '@/components/dashboard/apps/custom-domains/manager';
import { RuntimeLogs } from '@/components/dashboard/apps/runtime-logs';
import { AppIssues } from '@/components/dashboard/apps/app-issues';
import { BuildLogsPanel } from '@/components/dashboard/apps/build-logs';
import { AppIntegrationsSection, StorageIntegrationsSection } from '@/components/dashboard/integrations';
import { BuildInfo } from '@/components/dashboard/apps/types';
import { useAppDetails, useAppMetrics } from '@/hooks/use-app-metrics';
import { useRealtimeDeployments } from '@/hooks/use-realtime-deployments';
import { useRealtimeApp } from '@/hooks/use-realtime-app';
import api from '@/lib/axios/axios';
import { toast } from 'sonner';
import { useProjects } from '@/app/dashboard/provider';
import { EnvVarsEditor, EnvVar } from '@/components/dashboard/apps/env-vars-editor';



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
  project_id?: string | null;
  // Extended fields
  framework?: string;
  branch?: string;
  git_provider?: string;
  auto_deploy?: boolean;
  deploy_branch?: string;
  build_command?: string;
  output_directory?: string;
  env_vars?: Array<{ key: string; value: string }>;
  size?: string;
  // Failure tracking
  last_failure_reason?: string | null;
}

// Size specifications
const SIZE_SPECS = {
  small: { cpu: "0.5 CPU", memory: "512MB", replicas: 1, price: "$5/mo" },
  medium: { cpu: "1 CPU", memory: "1GB", replicas: 2, price: "$15/mo" },
  large: { cpu: "2 CPU", memory: "2GB", replicas: 3, price: "$30/mo" },
} as const;

type SizeKey = keyof typeof SIZE_SPECS;

const SECTION_META: Array<{
  value: string;
  label: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  helper: string;
}> = [
  {
    value: 'overview',
    label: 'Overview',
    description: 'Inspect status, health, traffic, and runtime capacity.',
    eyebrow: 'Operations',
    icon: Activity,
    helper: 'Start here to verify runtime health, network readiness, and workload capacity before making changes.',
  },
  {
    value: 'integrations',
    label: 'Integrations',
    description: 'Review connected services and storage integrations.',
    eyebrow: 'Connectivity',
    icon: Zap,
    helper: 'Confirm downstream services and storage targets before promoting traffic or changing runtime settings.',
  },
  {
    value: 'domains',
    label: 'Domains',
    description: 'Manage custom domains, DNS, and certificate routing.',
    eyebrow: 'Routing',
    icon: Link2,
    helper: 'Keep routing clean and verify domain coverage before switching production traffic.',
  },
  {
    value: 'build-logs',
    label: 'Build Logs',
    description: 'Trace build output, pipeline execution, and release logs.',
    eyebrow: 'Build',
    icon: Terminal,
    helper: 'Use build logs to validate pipeline output and diagnose release failures quickly.',
  },
  {
    value: 'runtime-logs',
    label: 'Runtime Logs',
    description: 'Inspect instance output and live application runtime logs.',
    eyebrow: 'Runtime',
    icon: Server,
    helper: 'Check runtime output after deploys to catch boot, network, or dependency regressions early.',
  },
  {
    value: 'issues',
    label: 'Issues',
    description: 'Review surfaced application issues and failure signals.',
    eyebrow: 'Health',
    icon: AlertTriangle,
    helper: 'Triage issues here before scaling, resizing, or changing rollout settings.',
  },
  {
    value: 'deployments',
    label: 'Deployments',
    description: 'Track historical deployments and live rollout updates.',
    eyebrow: 'History',
    icon: Layers,
    helper: 'Deployment history shows release timing, failure reasons, and active rollout state in one place.',
  },
  {
    value: 'settings',
    label: 'Settings',
    description: 'Manage sizing, redeploys, env vars, and project assignment.',
    eyebrow: 'Configuration',
    icon: Settings,
    helper: 'Use settings for controlled changes to capacity, environment configuration, and ownership.',
  },
];

function getStatusBadge(status: string, building?: boolean) {
  if (building) {
    return (
      <Badge className="rounded-none border-blue-500/30 bg-blue-500/20 text-blue-400">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        Building
      </Badge>
    );
  }

  switch (status) {
    case 'running':
      return (
        <Badge className="rounded-none border-green-500/30 bg-green-500/20 text-green-400">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Running
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="rounded-none border-red-500/30 bg-red-500/20 text-red-400">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case 'building':
      return (
        <Badge className="rounded-none border-blue-500/30 bg-blue-500/20 text-blue-400">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Building
        </Badge>
      );
    case 'deleting':
      return (
        <Badge className="rounded-none border-yellow-500/30 bg-yellow-500/20 text-yellow-400">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Deleting
        </Badge>
      );
    default:
      return (
        <Badge className="rounded-none border-yellow-500/30 bg-yellow-500/20 text-yellow-400">
          Pending
        </Badge>
      );
  }
}

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;
  const { projects } = useProjects();

  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [buildLogs, setBuildLogs] = useState<string>('');
  // true only for the very first fetch of a build (shows skeleton, hides old logs)
  const [initialLogLoading, setInitialLogLoading] = useState(false);
  // tracks the byte/char offset for incremental raw log fetches during active builds
  const logOffsetRef = useRef(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Environment variables editing state
  const [editedEnvVars, setEditedEnvVars] = useState<EnvVar[]>([]);
  const [envVarsModified, setEnvVarsModified] = useState(false);
  const [savingEnvVars, setSavingEnvVars] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [envVarError, setEnvVarError] = useState<string | null>(null);
  const [envVarSuccess, setEnvVarSuccess] = useState<string | null>(null);

  // Resize state
  const [selectedSize, setSelectedSize] = useState<SizeKey | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const [resizeSuccess, setResizeSuccess] = useState<string | null>(null);
  const [sizePrices, setSizePrices] = useState<Record<string, number>>({});

  // Project assignment state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);

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

  // Real-time deployments
  const { 
    deployments, 
    loading: deploymentsLoading, 
    connectionStatus 
  } = useRealtimeDeployments({ 
    appId,
    limit: 50,
    enabled: !!app 
  });

  // Real-time app metadata updates
  const { 
    app: realtimeApp, 
    connectionStatus: appConnectionStatus 
  } = useRealtimeApp({ 
    appId,
    enabled: !!app 
  });

  const fetchApp = useCallback(async () => {
    try {
      const res = await api.post('/services/platform-apps/get', { app_id: appId });
      
      if (!res.data) {
        setError('Failed to load app');
        return;
      }

      setApp(res.data);
    } catch (err) {
      console.error('Error fetching app:', err);
      setError('Failed to load app');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const fetchBuildInfo = useCallback(async (appName: string) => {
    try {
       const res = await api.get(`/jenkins/build-info?app=${appName}`);
      if (res.data) {
        setBuildInfo((prev) => {
          // Guard: after triggering a redeploy, Jenkins takes ~5s to register
          // the new build. During that window it returns the PREVIOUS build's
          // info (older number, building=false). Don't let that overwrite our
          // optimistic state for the new build. Once Jenkins knows about the
          // new build number, accept all updates (including completion).
          if (prev?.building && res.data.number < prev.number) {
            return prev;
          }
          return res.data;
        });
      }
    } catch (error) {
      console.error('Error fetching build info:', error);
    }
  }, []);

  const fetchBuildLogs = useCallback(async (
    appName: string,
    buildNumber: number,
    raw = false,
    append = false,
  ): Promise<boolean /* more */> => {
    if (!append) {
      // Full replacement (initial fetch or build switch) — show skeleton
      setInitialLogLoading(true);
      logOffsetRef.current = 0;
    }
    try {
      const start = append ? logOffsetRef.current : 0;
      const url = raw
        ? `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=${start}`
        : `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=0&deployment=true`;
      const res = await api.get(url);
      if (res.data) {
        const newChunk: string = res.data.logs || '';
        if (append && newChunk) {
          setBuildLogs((prev) => prev + newChunk);
        } else if (!append) {
          setBuildLogs(newChunk || 'No logs available');
        }
        // Use the byte offset returned by Jenkins (X-Text-Size header), not character count
        if (res.data.next_start != null) {
          logOffsetRef.current = res.data.next_start;
        }
        return !!res.data.more;
      }
    } catch (error) {
      console.error('Error fetching build logs:', error);
    } finally {
      if (!append) setInitialLogLoading(false);
    }
    return false;
  }, []);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  // Sync real-time app updates to local state
  useEffect(() => {
    if (realtimeApp) {
      setApp((prev) => {
        // Only update if there are actual changes
        if (!prev || JSON.stringify(prev) !== JSON.stringify({ ...prev, ...realtimeApp })) {
          return { ...prev, ...realtimeApp } as AppDetail;
        }
        return prev;
      });
    }
  }, [realtimeApp]);

  useEffect(() => {
    if (app?.name) {
      fetchBuildInfo(app.name);
    }
  }, [app?.name, fetchBuildInfo]);

  useEffect(() => {
    if (app?.name && buildInfo?.number) {
      // Use raw logs while building (deployment stage hasn't run yet),
      // switch to deployment-filtered summary once the build completes.
      fetchBuildLogs(app.name, buildInfo.number, !!buildInfo.building);
    }
  }, [app?.name, buildInfo?.number, buildInfo?.building, fetchBuildLogs]);

  // Poll build info and APPEND new log lines while a build is actively running.
  // - 2s interval (down from 5s) for faster perceived updates
  // - fetchBuildInfo and fetchBuildLogs run in parallel to halve per-tick latency
  // - when Jenkins signals more data is ready (X-More-Data: true), schedule
  //   a catch-up fetch 400ms later instead of waiting the full 2s
  useEffect(() => {
    if (!app?.name || !buildInfo?.building || !buildInfo?.number) return;

    // Capture stable values to avoid stale closures inside the interval
    const appName = app.name;
    const buildNum = buildInfo.number;
    let catchupId: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(async () => {
      // Cancel any pending catch-up — the regular tick covers it
      if (catchupId) { clearTimeout(catchupId); catchupId = null; }

      const [, more] = await Promise.all([
        fetchBuildInfo(appName),
        fetchBuildLogs(appName, buildNum, true, true),
      ]);

      // Jenkins has more buffered output  — fetch again quickly without waiting the full 2s
      if (more) {
        catchupId = setTimeout(async () => {
          catchupId = null;
          await fetchBuildLogs(appName, buildNum, true, true);
        }, 400);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      if (catchupId) clearTimeout(catchupId);
    };
  }, [app?.name, buildInfo?.building, buildInfo?.number, fetchBuildInfo, fetchBuildLogs]);

  // Initialize edited env vars when app data loads
  useEffect(() => {
    if (app?.env_vars) {
      setEditedEnvVars(
        app.env_vars.map((env) => ({
          key: env?.key ?? '',
          value: env?.value ?? '',
          visible: false,
        }))
      );
    }
  }, [app?.env_vars]);

  // Initialize project assignment when app data loads
  useEffect(() => {
    if (app?.project_id !== undefined) {
      setProjectId(app.project_id || null);
    }
  }, [app?.project_id]);

  // Fetch platform app prices from products table
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await api.get('/services/platform-apps/prices');
        if (res.data) {
          setSizePrices(res.data.prices || {});
        }
      } catch (error) {
        console.error('Error fetching platform app prices:', error);
      }
    };
    fetchPrices();
  }, []);

  // Handle env var changes - now handled by EnvVarsEditor
  const handleEnvVarsChange = (vars: EnvVar[]) => {
    setEditedEnvVars(vars);
    setEnvVarsModified(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);
  };

  const handleSaveEnvVars = async () => {
    if (!app) return;
    
    // Filter out empty entries and validate
    const validEnvVars = editedEnvVars
      .map((env) => ({
        key: env.key ?? '',
        value: env.value ?? '',
        visible: env.visible ?? false,
      }))
      .filter((env) => env.key.trim() !== '');
    
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save environment variables');
      }

      // Handle different response types
      if (data.requiresRedeploy && data.appliedLive) {
        // Mixed scenario: runtime vars applied NOW, build-time vars need rebuild
        setEnvVarSuccess(`${data.message}\n${data.hint || ''}`);
        toast.success('Environment changes saved', {
          description:
            'Runtime environment variables have been applied and are live. Client-side build-time variables (NEXT_PUBLIC_*, NUXT_PUBLIC_*, PUBLIC_*, VITE_*) require a rebuild to take effect â€” click Redeploy to trigger a rebuild.',
          duration: 7000,
        });
      } else if (data.requiresRedeploy) {
        // Only build-time vars or app not running
        setEnvVarSuccess(`${data.message}\n${data.hint || ''}`);
        toast.warning(data.reason || 'Redeploy required', {
          description: 'Click the Redeploy button to apply changes',
          duration: 5000,
        });
      } else if (data.appliedLive) {
        // Pure runtime scenario: all vars applied
        setEnvVarSuccess(data.message);
        toast.success('All changes applied immediately.', {
          description: data.hint || 'Environment variables updated without rebuild',
          duration: 4000,
        });
      } else {
        // Fallback (shouldn't happen)
        setEnvVarSuccess(data.message || 'Environment variables saved successfully');
      }
      
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

  // Navigate to build logs for a specific historical build
  const handleSelectBuild = (buildNumber: number) => {
    if (!app?.name) return;
    // Only update if it's actually a different build
    if (buildInfo?.number !== buildNumber) {
      setBuildInfo({ number: buildNumber, building: false, result: null, duration: 0, timestamp: 0, url: '' });
    } else {
      // Same build — force a log refresh
      fetchBuildLogs(app.name, buildNumber);
    }
    setActiveTab('build-logs');
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

      // Clear stale logs immediately and reflect the new in-progress build
      setBuildLogs('');
      logOffsetRef.current = 0;
      setBuildInfo({ number: data.build_number, building: true, result: null, duration: 0, timestamp: Date.now(), url: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to trigger redeploy';
      setEnvVarError(message);
    } finally {
      setRedeploying(false);
    }
  };

  const handleResize = async () => {
    if (!app || !selectedSize) return;

    setResizing(true);
    setResizeError(null);
    setResizeSuccess(null);

    try {
      const res = await fetch('/api/services/platform-apps/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: app.id, new_size: selectedSize }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to resize app');
      }

      setResizeSuccess(`App resized to ${selectedSize} (Build #${data.build_number})`);
      setSelectedSize(null);

      // Clear stale logs immediately and reflect the new in-progress build
      setBuildLogs('');
      logOffsetRef.current = 0;
      setBuildInfo({ number: data.build_number, building: true, result: null, duration: 0, timestamp: Date.now(), url: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resize app';
      setResizeError(message);
    } finally {
      setResizing(false);
    }
  };

  const handleSaveProject = async () => {
    if (!app) return;

    setSavingProject(true);

    try {
      const res = await fetch('/api/services/platform-apps/update-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: app.id, project_id: projectId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update project assignment');
      }

      toast.success('Project assignment updated successfully');
      setEditingProject(false);
      
      // Update local state
      setApp(prev => prev ? { ...prev, project_id: projectId } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update project assignment';
      toast.error(message);
    } finally {
      setSavingProject(false);
    }
  };

  const handleCancelProjectEdit = () => {
    setProjectId(app?.project_id || null);
    setEditingProject(false);
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "No project assigned";
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown project";
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDeleteSuccess = () => {
    router.push('/dashboard/services/apps');
  };

  const activeSection = useMemo(
    () => SECTION_META.find((section) => section.value === activeTab) ?? SECTION_META[0],
    [activeTab]
  );

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
  const ActiveSectionIcon = activeSection.icon;
  const currentSize = (app.size || 'small') as SizeKey;
  const currentSizeSpec = SIZE_SPECS[currentSize];

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel overflow-hidden rounded-none"
      >
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link
              href="/dashboard/services/apps"
              className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to application inventory
            </Link>

            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
                  Application Deployment
                </p>
                {getStatusBadge(app.status, buildInfo?.building)}
                {/* Only show Live when the Supabase connection is up AND the app is actually running */}
                {appConnectionStatus === 'connected' && app.status === 'running' && !buildInfo?.building && (
                  <Badge className="rounded-none border-emerald-400/20 bg-emerald-500/10 text-emerald-300 text-xs">
                    <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                    Live
                  </Badge>
                )}
              </div>

              <div className="mt-2 flex items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  {app.name}
                </h1>
                <button
                  onClick={() => copyToClipboard(app.name, 'app-name')}
                  className="border border-white/[0.08] bg-white/[0.03] p-2 text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white/75"
                  title="Copy app name"
                >
                  {copiedField === 'app-name' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              {app.status === 'failed' && app.last_failure_reason && (
                <div className="mt-3 flex items-center gap-2 border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{app.last_failure_reason}</span>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-white/50 transition-colors hover:text-white"
                >
                  <Globe className="h-4 w-4" />
                  {domain}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  onClick={() => copyToClipboard(`https://${domain}`, 'domain')}
                  className="border border-white/[0.08] bg-white/[0.03] p-2 text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white/75"
                  title="Copy URL"
                >
                  {copiedField === 'domain' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (app.name) fetchBuildInfo(app.name);
                refetchDetails();
              }}
              className="rounded-none border-white/[0.12] bg-white/[0.03] text-white hover:bg-white/[0.08]"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteModalOpen(true)}
              className="rounded-none"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                App ID
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-sm text-white">{app.id}</p>
                <button
                  onClick={() => copyToClipboard(app.id, 'app-id')}
                  className="text-white/35 transition-colors hover:text-white/70"
                  title="Copy app ID"
                >
                  {copiedField === 'app-id' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Framework
              </div>
              <div className="mt-1.5 text-sm font-semibold text-white">{app.framework || 'Not specified'}</div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Branch
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-white">
                <GitBranch className="h-3.5 w-3.5 text-blue-300" />
                {app.branch || 'Not specified'}
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Runtime Size
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold capitalize text-white">{currentSize}</p>
                  <p className="text-xs text-white/45">
                    {currentSizeSpec.cpu} · {currentSizeSpec.memory}
                  </p>
                </div>
                <Badge className="rounded-none border-white/[0.08] bg-white/[0.04] text-white/75">
                  {currentSizeSpec.price}
                </Badge>
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Created
              </div>
              <div className="mt-1.5 text-sm font-semibold text-white">
                {new Date(app.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[272px_minmax(0,1fr)] xl:items-start">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.18, duration: 0.24 }}
              className="space-y-4 xl:sticky xl:top-8"
            >
              <Card className="glass-panel overflow-hidden rounded-none">
                <CardContent className="p-4">
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Application Areas
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/45">
                      Move between runtime health, domains, logs, deployments, and settings without leaving the page.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {SECTION_META.map((section) => {
                      const SectionIcon = section.icon;
                      const isActive = activeTab === section.value;
                      return (
                        <button
                          key={section.value}
                          type="button"
                          onClick={() => setActiveTab(section.value)}
                          className={`w-full border px-3 py-3 text-left transition-colors ${
                            isActive
                              ? 'border-blue-400/24 bg-white/[0.05]'
                              : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-9 w-9 items-center justify-center border ${
                                isActive
                                  ? 'border-blue-400/24 bg-white/[0.05] text-blue-200'
                                  : 'border-white/[0.08] bg-white/[0.03] text-white/55'
                              }`}
                            >
                              <SectionIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white">{section.label}</div>
                              <div className="mt-1 text-xs leading-5 text-white/40">
                                {section.description}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.24 }}
            >
              <Card className="glass-panel overflow-hidden rounded-none">
                <CardContent className="p-0">
                  <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 items-center justify-center border border-blue-500/18 bg-white/[0.03] text-blue-200">
                        <ActiveSectionIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          {activeSection.eyebrow}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold text-white">{activeSection.label}</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                          {activeSection.description}
                        </p>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/35">
                          {activeSection.helper}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-5 sm:px-6 sm:py-6">

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Health & Metrics */}
            {app.status === 'running' && (
              <Card className="glass-panel rounded-none border-white/[0.08]">
                <CardHeader className="border-b border-white/[0.06]">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Box className="w-5 h-5" />
                    Health & Metrics
                    {(detailsLoading || metricsLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-5">
                  {details || metrics ? (
                    <>
                      {/* Health Status */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <p className="text-xs text-white/40 mb-1">Status</p>
                          <Badge className={`rounded-none ${
                            health?.status === 'healthy' || details?.pod?.phase === 'Running' ? 'bg-green-500/20 text-green-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {health?.status || details?.pod?.phase || 'Unknown'}
                          </Badge>
                        </div>
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <p className="text-xs text-white/40 mb-1">Pods</p>
                          <p className="text-xl font-bold text-white">
                            {details?.deployment?.readyReplicas || health?.pod_count || 0}/{details?.deployment?.replicas || 1}
                          </p>
                        </div>
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <p className="text-xs text-white/40 mb-1">Restarts</p>
                          <p className="text-xl font-bold text-white">
                            {details?.container?.restartCount || health?.restart_count || 0}
                          </p>
                        </div>
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <p className="text-xs text-white/40 mb-1">Uptime</p>
                          <p className="text-sm text-white">{details?.pod?.uptime || '-'}</p>
                        </div>
                      </div>

                      {/* Resource Usage */}
                      {metrics && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
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
                          <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
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
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <h5 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                            <Network className="w-4 h-4" />
                            Network
                          </h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <p className="text-xs text-white/40 mb-1">Ingress Host</p>
                              <div className="flex items-center gap-1">
                                <p className="text-xs font-mono text-white truncate flex-1">{details.network.ingressHost}</p>
                                <button
                                  onClick={() => copyToClipboard(details.network?.ingressHost || '', 'ingress-host')}
                                  className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                                  title="Copy ingress host"
                                >
                                  {copiedField === 'ingress-host' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 mb-1">TLS</p>
                              <Badge className={`rounded-none ${details.network.tlsEnabled ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                {details.network.tlsEnabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 mb-1">Service</p>
                              <div className="flex items-center gap-1">
                                <p className="text-xs text-white truncate flex-1">{details.network.serviceName}</p>
                                <button
                                  onClick={() => copyToClipboard(details.network?.serviceName || '', 'service-name')}
                                  className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                                  title="Copy service name"
                                >
                                  {copiedField === 'service-name' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
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
            <Card className="glass-panel rounded-none border-white/[0.08]">
              <CardHeader className="border-b border-white/[0.06]">
                <CardTitle className="text-lg flex items-center gap-2">
                  <GitBranch className="w-5 h-5" />
                  Repository
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
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
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Git Provider</p>
                    <p className="text-sm text-white capitalize">{app.git_provider}</p>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Auto Deploy</p>
                    <Badge className={`rounded-none ${app.auto_deploy ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>
                      {app.auto_deploy ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Deploy Branch</p>
                    <p className="text-sm text-white">{app.deploy_branch || app.branch}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-4">
            <AppIntegrationsSection 
              appId={app.id} 
              appName={app.name} 
              projectId={app.project_id || ''} 
            />
            <StorageIntegrationsSection
              appId={app.id}
              appName={app.name}
              projectId={app.project_id || ''}
            />
          </TabsContent>

          {/* Domains Tab */}
          <TabsContent value="domains">
            <CustomDomainsManager
              appId={app.id}
              appStatus={app.status}
              platformDomain={domain}
            />
          </TabsContent>

          {/* Build Logs Tab */}
          <TabsContent value="build-logs">
            <BuildLogsPanel 
              buildInfo={buildInfo} 
              buildLogs={buildLogs}
              initialLoading={initialLogLoading}
              appName={app.name}
              fetchBuildLogs={fetchBuildLogs}
              deployments={deployments}
              onSelectBuild={handleSelectBuild}
            />
          </TabsContent>

          {/* Runtime Logs Tab */}
          <TabsContent value="runtime-logs">
            <RuntimeLogs
              appId={app.id}
              appName={app.name}
              appStatus={app.status}
            />
          </TabsContent>

          {/* Issues Tab */}
          <TabsContent value="issues">
            <AppIssues
              appId={app.id}
              appName={app.name}
              appStatus={app.status}
            />
          </TabsContent>

          {/* Deployments Tab */}
          <TabsContent value="deployments">
            <Card className="glass-panel rounded-none border-white/[0.08]">
              <CardHeader className="border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Deployment History
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {connectionStatus === 'connected' && (
                      <Badge className="rounded-none bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse" />
                        Live Updates
                      </Badge>
                    )}
                    {connectionStatus === 'connecting' && (
                      <Badge className="rounded-none bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Connecting...
                      </Badge>
                    )}
                    {connectionStatus === 'disconnected' && (
                      <Badge className="rounded-none bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                        <XCircle className="w-3 h-3 mr-1" />
                        Disconnected
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                {deploymentsLoading && deployments.length === 0 ? (
                  <div className="text-center py-8 text-white/50">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 opacity-50 animate-spin" />
                    <p>Loading deployments...</p>
                  </div>
                ) : deployments.length > 0 ? (
                  <div className="space-y-2">
                    {deployments.map((deployment) => (
                      <div
                        key={deployment.id}
                        className="flex flex-col gap-3 border border-white/[0.08] bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono text-white">
                              #{deployment.build_number}
                            </span>
                            <Badge className={`rounded-none ${
                              deployment.status === 'SUCCESS' ? 'bg-green-500/20 text-green-400' :
                              deployment.status === 'FAILURE' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {deployment.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-white/50">
                            <span>
                              {new Date(deployment.started_at).toLocaleString()}
                            </span>
                            {deployment.build_number > 0 && (
                              <button
                                onClick={() => handleSelectBuild(deployment.build_number)}
                                className="flex items-center gap-1 border border-white/[0.12] bg-white/[0.03] px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
                              >
                                <Terminal className="w-3 h-3" />
                                View Logs
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Commit Info Row */}
                        {deployment.commit_sha && (
                          <div className="flex items-center gap-2 text-xs text-white/60 pl-1">
                            <GitCommit className="w-3 h-3 text-white/40" />
                            <code className="border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-blue-200">
                              {deployment.commit_sha.substring(0, 7)}
                            </code>
                          </div>
                        )}
                        {/* Failure Reason Row */}
                        {deployment.status === 'FAILURE' && deployment.failure_reason && (
                          <div className="flex items-center gap-2 border border-red-500/20 bg-red-500/10 px-2 py-2 text-xs text-red-300">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            <span>{deployment.failure_reason}</span>
                          </div>
                        )}
                        {/* Trigger Badge */}
                        {deployment.trigger && (
                          <div className="flex items-center gap-2 text-xs text-white/40 pl-1">
                            <Badge variant="outline" className="rounded-none text-xs capitalize">
                              {deployment.trigger}
                            </Badge>
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
            <Card className="glass-panel rounded-none border-white/[0.08]">
              <CardHeader className="border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    App Settings
                  </CardTitle>
                  <Button
                    onClick={handleRedeploy}
                    disabled={redeploying || app.status === 'building' || app.status === 'deleting'}
                    className="rounded-none bg-blue-600 hover:bg-blue-700 text-white"
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
              <CardContent className="space-y-5 pt-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Build Command</p>
                    <p className="border border-white/[0.08] bg-black/20 px-3 py-3 text-sm font-mono text-white">
                      {app.build_command || 'Default'}
                    </p>
                  </div>
                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <p className="text-xs text-white/40 mb-1">Output Directory</p>
                    <p className="border border-white/[0.08] bg-black/20 px-3 py-3 text-sm font-mono text-white">
                      {app.output_directory || 'Default'}
                    </p>
                  </div>
                </div>

                {/* Project Assignment */}
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-yellow-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Project Assignment</p>
                        <p className="text-xs text-white/50">Assign this app to a project for organization</p>
                      </div>
                    </div>
                    {!editingProject && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingProject(true)}
                        className="h-8 rounded-none text-white/70 hover:bg-white/10"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>

                  {editingProject ? (
                    <div className="space-y-3">
                      <Select
                        value={projectId || "none"}
                        onValueChange={(value) => setProjectId(value === "none" ? null : value)}
                      >
                        <SelectTrigger className="rounded-none bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-black border-white/10">
                          <SelectItem value="none">No project</SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleSaveProject}
                          disabled={savingProject}
                          className="rounded-none bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                        >
                          {savingProject ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-3.5 h-3.5 mr-1" />
                              Save
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleCancelProjectEdit}
                          disabled={savingProject}
                          className="rounded-none border-white/20 text-white hover:bg-white/10"
                          size="sm"
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm font-medium text-yellow-200">
                        {getProjectName(projectId)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Instance Size - Resize Section */}
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <p className="text-sm font-medium text-white">Instance Size</p>
                  </div>

                  {/* Resize Messages */}
                  {resizeError && (
                    <div className="mb-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {resizeError}
                    </div>
                  )}
                  {resizeSuccess && (
                    <div className="mb-3 flex items-center gap-2 border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
                      <CheckCircle2 className="w-4 h-4" />
                      {resizeSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(Object.keys(SIZE_SPECS) as SizeKey[]).map((size) => {
                      const specs = SIZE_SPECS[size];
                      const currentSize = (app.size || 'small') as SizeKey;
                      const isCurrent = size === currentSize;
                      const isUpgrade = SIZE_SPECS[size] && 
                        (Object.keys(SIZE_SPECS) as SizeKey[]).indexOf(size) > 
                        (Object.keys(SIZE_SPECS) as SizeKey[]).indexOf(currentSize);
                      const isSelected = selectedSize === size;
                      const isDisabled = !isUpgrade || app.status === 'building' || app.status === 'deleting';

                      return (
                        <div
                          key={size}
                          onClick={() => !isDisabled && setSelectedSize(isSelected ? null : size)}
                          className={`relative border px-4 py-4 transition-all cursor-pointer ${
                            isCurrent
                              ? 'border-blue-500/40 bg-white/[0.05]'
                              : isSelected
                              ? 'border-green-500/40 bg-white/[0.05]'
                              : isUpgrade
                              ? 'border-white/20 bg-white/[0.03] hover:border-white/40'
                              : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {isCurrent && (
                            <Badge className="absolute -top-2 -right-2 rounded-none bg-blue-500 text-white text-xs">
                              Current
                            </Badge>
                          )}
                          {isUpgrade && !isCurrent && (
                            <Badge className="absolute -top-2 -right-2 rounded-none bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                              <ArrowUpCircle className="w-3 h-3 mr-1" />
                              Upgrade
                            </Badge>
                          )}

                          <h4 className="text-lg font-semibold text-white capitalize mb-2">{size}</h4>
                          
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2 text-white/70">
                              <Cpu className="w-3 h-3" />
                              <span>{specs.cpu}</span>
                            </div>
                            <div className="flex items-center gap-2 text-white/70">
                              <HardDrive className="w-3 h-3" />
                              <span>{specs.memory}</span>
                            </div>
                            <div className="flex items-center gap-2 text-white/70">
                              <Layers className="w-3 h-3" />
                              <span>{specs.replicas} replica{specs.replicas > 1 ? 's' : ''}</span>
                            </div>
                          </div>

                          <p className="mt-3 text-sm font-medium text-white/90">
                            {sizePrices[size] ? `$${sizePrices[size]}/mo` : specs.price}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {selectedSize && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        onClick={handleResize}
                        disabled={resizing || app.status === 'building'}
                        className="rounded-none bg-green-600 hover:bg-green-700 text-white"
                      >
                        {resizing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Resizing...
                          </>
                        ) : (
                          <>
                            <ArrowUpCircle className="w-4 h-4 mr-2" />
                            Resize & Redeploy
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedSize(null)}
                        className="rounded-none border-white/20 text-white hover:bg-white/10"
                      >
                        Cancel
                      </Button>
                      <span className="text-xs text-white/50">
                        Your app will be redeployed with new resources.
                      </span>
                    </div>
                  )}
                </div>

                {/* Environment Variables - Using EnvVarsEditor */}
                <div className="border-t border-white/10 pt-4">
                  {/* Success/Error Messages */}
                  {envVarError && (
                    <div className="mb-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {envVarError}
                    </div>
                  )}
                  {envVarSuccess && (
                    <div className="mb-3 flex items-center gap-2 border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
                      <CheckCircle2 className="w-4 h-4" />
                      {envVarSuccess}
                    </div>
                  )}

                  {/* Advanced Environment Variables Editor */}
                  <EnvVarsEditor value={editedEnvVars} onChange={handleEnvVarsChange} />

                  {/* Save Button */}
                  {envVarsModified && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        onClick={handleSaveEnvVars}
                        disabled={savingEnvVars}
                        className="rounded-none bg-green-600 hover:bg-green-700 text-white"
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
                        {envVarSuccess && envVarSuccess.toLowerCase().includes('applied') && envVarSuccess.toLowerCase().includes('immediately') ? (
                          <span className="text-yellow-400">
                            Runtime variables apply immediately. Build-time variables require a redeploy.
                          </span>
                        ) : envVarSuccess && (envVarSuccess.includes('applied instantly') || envVarSuccess.includes('All changes applied')) ? (
                          <span className="text-green-400">
                            All changes applied immediately. No rebuild required.
                          </span>
                        ) : envVarSuccess && envVarSuccess.toLowerCase().includes('redeploy') ? (
                          <span className="text-yellow-400">
                            Changes require clicking &quot;Redeploy&quot; to take effect.
                          </span>
                        ) : (
                          'Auto-detects if hot update or rebuild is needed'
                        )}
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
                    className="w-full rounded-none md:w-auto"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Application
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
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

