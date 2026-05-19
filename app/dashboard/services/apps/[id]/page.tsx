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
  RotateCcw,
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
import { RollbackAppModal } from '@/components/dashboard/apps/rollback-app-modal';
import { mergeDeploymentPresentation } from '@/components/dashboard/apps/types';
import { CustomDomainsManager } from '@/components/dashboard/apps/custom-domains/manager';
import { RuntimeLogs } from '@/components/dashboard/apps/runtime-logs';
import { AppIssues } from '@/components/dashboard/apps/app-issues';
import { BuildLogsPanel } from '@/components/dashboard/apps/build-logs';
import { OperationLogsPanel } from '@/components/dashboard/apps/operation-logs';
import { AppIntegrationsSection, StorageIntegrationsSection } from '@/components/dashboard/integrations';
import { BuildInfo } from '@/components/dashboard/apps/types';
import { useAppDetails, useAppMetrics } from '@/hooks/use-app-metrics';
import { useRealtimeDeployments } from '@/hooks/use-realtime-deployments';
import { useRealtimeApp } from '@/hooks/use-realtime-app';
import api from '@/lib/axios/axios';
import { getAppOperationLabel } from '@/lib/app-operations/core/presentation';
import { applyLiveBuildStatus } from '@/lib/app-operations/core/live-build-status';
import { toast } from 'sonner';
import { useProjects } from '@/app/dashboard/provider';
import { EnvVarsEditor, EnvVar } from '@/components/dashboard/apps/env-vars-editor';
import { DeploymentHistory } from '@/components/dashboard/apps/deployment-history';
import { AppStatusBadge } from '@/components/dashboard/apps/app-status-badge';
import { generateIdempotencyKey } from '@/lib/idempotency';



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
  can_rollback?: boolean;
  serving_build_number?: number | null;
  last_operation_build_number?: number | null;
  last_operation_trigger?: string | null;
  rollback_target_build_number?: number | null;
  rollback_target_commit_sha?: string | null;
  // Failure tracking
  last_failure_reason?: string | null;
}

type PlatformAppSize = 'small' | 'medium' | 'large';
type SizeKey = PlatformAppSize;

type PlatformAppRates = {
  initialCost: number;
  hourlyRate: number;
  price: number;
};

const PLATFORM_APP_SIZE_ORDER: SizeKey[] = ['small', 'medium', 'large'];

const PLATFORM_APP_SIZE_SPECS: Record<
  SizeKey,
  { cpu: string; memory: string; replicas: number }
> = {
  small: { cpu: '0.25 CPU', memory: '256 MB', replicas: 1 },
  medium: { cpu: '0.5 CPU', memory: '512 MB', replicas: 2 },
  large: { cpu: '1 CPU', memory: '1 GB', replicas: 3 },
};

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
    label: 'Build & Ops',
    description: 'Trace build output, pipeline execution, and operational rollout logs.',
    eyebrow: 'Build',
    icon: Terminal,
    helper: 'Use these logs to validate release builds, resize runs, and rollout execution details.',
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
  const prevBuildingRef = useRef<boolean | undefined>(undefined);
  const prevBuildNumberRef = useRef<number | null>(null);
  // Tracks the last-seen resize operation id so we only call fetchApp() when a NEW resize completes
  const prevResizeOpIdRef = useRef<string | null>(null);
  // Which build's logs the user is viewing — null means "show the active/latest build".
  // Separate from buildInfo so polling doesn't hijack the user's selection.
  const [viewingBuildNumber, setViewingBuildNumber] = useState<number | null>(null);
  // Tracks consecutive polls where Jenkins says "done" but the DB row is still
  // BUILDING � used to detect potentially orphaned builds and ask the backend
  // to run the canonical recovery path.
  const stalePollingCountRef = useRef(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Environment variables editing state
  const [editedEnvVars, setEditedEnvVars] = useState<EnvVar[]>([]);
  const [envVarsModified, setEnvVarsModified] = useState(false);
  const [savingEnvVars, setSavingEnvVars] = useState(false);
  const [envVarsLoading, setEnvVarsLoading] = useState(false);
  const [envVarsLoaded, setEnvVarsLoaded] = useState(false);
  const [revealingKey, setRevealingKey] = useState<string | null>(null);
  // Tracks per-key auto-expiry timers so revealed values don't linger indefinitely
  const revealTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Timer for the token-expired redirect — cleared on unmount to prevent ghost navigation
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [redeploying, setRedeploying] = useState(false);
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [envVarError, setEnvVarError] = useState<string | null>(null);
  const [envVarSuccess, setEnvVarSuccess] = useState<string | null>(null);

  // Resize state
  const [selectedSize, setSelectedSize] = useState<SizeKey | null>(null);
  const [pendingResizeSize, setPendingResizeSize] = useState<SizeKey | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const [resizeSuccess, setResizeSuccess] = useState<string | null>(null);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [operationLogs, setOperationLogs] = useState('');
  const [operationLogsLoading, setOperationLogsLoading] = useState(false);
  const [platformPricing, setPlatformPricing] = useState<Partial<Record<SizeKey, PlatformAppRates>>>({});

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
    connectionStatus,
    refetch: refetchDeployments,
  } = useRealtimeDeployments({ 
    appId,
    limit: 50,
    enabled: !!app 
  });

  const buildDeployments = useMemo(
    () =>
      deployments.filter(
        (deployment): deployment is typeof deployment & { build_number: number } =>
          typeof deployment.build_number === 'number' &&
          deployment.build_number > 0
      ),
    [deployments]
  );

  const operationDeployments = useMemo(
    () => deployments.filter((deployment) => deployment.history_type === 'operation'),
    [deployments]
  );
  const latestOperationDeployment = operationDeployments[0] ?? deployments[0] ?? null;
  const latestBuildDeployment = buildDeployments[0] ?? null;
  const releaseDeployments = useMemo(
    () => buildDeployments.filter((deployment) => deployment.history_type === 'release'),
    [buildDeployments]
  );
  const deploymentsForHistory = useMemo(
    () => deployments.map((deployment) => applyLiveBuildStatus(deployment, buildInfo)),
    [deployments, buildInfo]
  );
  const latestReleaseDeployment = releaseDeployments[0] ?? null;
  const activeBuildTrigger = latestBuildDeployment?.status === 'BUILDING'
    ? latestBuildDeployment.trigger
    : buildInfo?.building
      ? latestBuildDeployment?.trigger ?? null
      : null;
  const activeBuildNumber = useMemo(() => {
    if (buildInfo?.building && buildInfo.number) return buildInfo.number;
    if (latestBuildDeployment?.status === 'BUILDING') return latestBuildDeployment.build_number;
    return null;
  }, [buildInfo?.building, buildInfo?.number, latestBuildDeployment]);
  const isBuilding = activeBuildNumber !== null;
  const resizeInProgress = useMemo(() => {
    if (pendingResizeSize) return true;
    return latestBuildDeployment?.status === 'BUILDING' && latestBuildDeployment.trigger === 'resize';
  }, [latestBuildDeployment, pendingResizeSize]);
  const displayBuildInfo = useMemo<BuildInfo | null>(() => {

    // User explicitly selected a historical build to view
    if (viewingBuildNumber !== null) {
      // If the viewing build happens to be the active build, show live Jenkins info
      if (activeBuildNumber !== null && viewingBuildNumber === activeBuildNumber && buildInfo?.number === activeBuildNumber) {
        return { ...buildInfo, building: true };
      }
      // Historical build — show a static stub (not building)
      return {
        number: viewingBuildNumber,
        building: false,
        result: null,
        duration: 0,
        timestamp: 0,
        url: '',
      };
    }

    // No explicit selection — show the active build if one is running
    if (activeBuildNumber !== null) {
      if (buildInfo?.number === activeBuildNumber) {
        return { ...buildInfo, building: true };
      }

      return {
        number: activeBuildNumber,
        building: true,
        result: null,
        duration: 0,
        timestamp: Date.now(),
        url: '',
      };
    }

    return buildInfo;
  }, [activeBuildNumber, buildInfo, viewingBuildNumber]);
  const deploymentMutationBlocked = isBuilding || app?.status === 'building' || app?.status === 'deleting';

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
      
      if (!res?.data) {
        setError('Failed to load app');
        return;
      }

      setApp(res?.data);
    } catch (err) {
      console.error('Error fetching app:', err);
      setError('Failed to load app');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const fetchBuildInfo = useCallback(async (appName: string): Promise<BuildInfo | null> => {
    try {
       const res = await api.get(`/jenkins/build-info?app=${appName}`, {
         validateStatus: (status) => status < 500,
       });
      if (res.status === 200 && res?.data && !res?.data?.error) {
        setBuildInfo((prev) => {
          // Guard: after triggering a redeploy, Jenkins takes ~5s to register
          // the new build. During that window it returns the PREVIOUS build's
          // info (older number, building=false). Don't let that overwrite our
          // optimistic state for the new build. Once Jenkins knows about the
          // new build number, accept all updates (including completion).
          if (prev?.building && res?.data?.number < prev.number) {
            return prev;
          }
          return res?.data;
        });
        return res?.data as BuildInfo;
      }
    } catch (error) {
      console.error('Error fetching build info:', error);
    }
    return null;
  }, []);

  const fetchBuildLogs = useCallback(async (
    appName: string,
    buildNumber: number,
    raw = false,
    append = false,
  ): Promise<boolean /* more */> => {
    if (!append) {
      // Full replacement (initial fetch or build switch) � show skeleton
      setInitialLogLoading(true);
      logOffsetRef.current = 0;
    }
    try {
      const start = append ? logOffsetRef.current : 0;
      const url = raw
        ? `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=${start}`
        : `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=0&deployment=true`;
      const res = await api.get(url);
      if (res?.data) {
        const newChunk: string = res?.data?.logs || '';
        if (append && newChunk) {
          setBuildLogs((prev) => prev + newChunk);
        } else if (!append) {
          setBuildLogs(newChunk || 'No logs available');
        }
        // Use the byte offset returned by Jenkins (X-Text-Size header), not character count
        if (res?.data?.next_start != null) {
          logOffsetRef.current = res?.data?.next_start;
        }
        return !!res?.data?.more;
      }
    } catch (error) {
      console.error('Error fetching build logs:', error);
    } finally {
      if (!append) setInitialLogLoading(false);
    }
    return false;
  }, []);

  const fetchOperationLogs = useCallback(async (operationId: string) => {
    if (!app) return;

    setOperationLogsLoading(true);
    try {
      const res = await api.get(
        `/services/platform-apps/operation-logs?app_id=${app.id}&operation_id=${operationId}`
      );
      setOperationLogs(res?.data?.logs || 'No operation logs available.');
      setSelectedOperationId(operationId);
    } catch (error) {
      console.error('Error fetching operation logs:', error);
      setOperationLogs('Failed to load operation logs.');
    } finally {
      setOperationLogsLoading(false);
    }
  }, [app]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  // When the OAuth callback redirects back here after a successful git provider reconnect,
  // show a success toast and strip the ?*_connected=true param from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedParam =
      params.get('github_connected') === 'true' ? 'GitHub' :
      params.get('gitlab_connected') === 'true' ? 'GitLab' :
      params.get('bitbucket_connected') === 'true' ? 'Bitbucket' : null;
    if (connectedParam) {
      window.history.replaceState({}, '', window.location.pathname);
      toast.success(`${connectedParam} reconnected successfully. You can now redeploy.`, { duration: 6000 });
    }
  }, []);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  useEffect(() => {
    let cancelled = false;

    const fetchPlatformPricing = async () => {
      try {
        const res = await fetch('/api/services/platform-apps/prices');
        if (!res.ok) {
          throw new Error('Failed to load platform pricing');
        }

        const data = await res.json();
        if (!cancelled && data?.rates) {
          setPlatformPricing(data.rates);
        }
      } catch (error) {
        console.error('Error fetching platform pricing:', error);
      }
    };

    fetchPlatformPricing();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync real-time app updates to local state.
  // Preserve computed fields (e.g. can_rollback) that come from the API but are
  // absent in the Supabase realtime payload � spread realtimeApp AFTER prev so
  // undefined fields in realtimeApp don't overwrite known values.
  useEffect(() => {
    if (realtimeApp) {
      setApp((prev) => {
        if (!prev) return { ...realtimeApp } as AppDetail;
        // Merge realtime fields but preserve deployment metadata from the API
        const merged = mergeDeploymentPresentation(
          { ...prev, ...realtimeApp } as AppDetail,
          prev,
        );
        if (JSON.stringify(prev) !== JSON.stringify(merged)) {
          return merged;
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

  // When a new build starts, auto-switch to it (clear any historical selection)
  useEffect(() => {
    if (activeBuildNumber !== null) {
      setViewingBuildNumber(null);
    }
  }, [activeBuildNumber]);

  // Fetch logs for the build the user is currently viewing.
  // - If viewing the active build (or no explicit selection): raw streaming logs while building,
  //   deployment-filtered summary once complete.
  // - If viewing a historical build: deployment-filtered summary (non-raw).
  useEffect(() => {
    const isViewingActiveBuild = viewingBuildNumber === null || viewingBuildNumber === activeBuildNumber;
    const targetBuildNumber = viewingBuildNumber ?? activeBuildNumber ?? displayBuildInfo?.number ?? null;
    if (app?.name && targetBuildNumber && activeBuildTrigger !== 'resize') {
      const useRaw = isViewingActiveBuild && isBuilding;
      fetchBuildLogs(app.name, targetBuildNumber, useRaw);
    }
  }, [app?.name, viewingBuildNumber, activeBuildNumber, activeBuildTrigger, displayBuildInfo?.number, isBuilding, fetchBuildLogs]);

  // Poll Jenkins build status (and stream logs) while a build is actively running.
  // Only appends log output if the user is currently viewing the active build.
  useEffect(() => {
    if (!app?.name || !isBuilding || !activeBuildNumber || activeBuildTrigger === 'resize') return;

    const appName = app.name;
    const buildNum = activeBuildNumber;
    // Are we viewing the active build? If user switched to a historical build,
    // we still poll Jenkins for status but don't overwrite the displayed logs.
    const isViewingActive = viewingBuildNumber === null || viewingBuildNumber === activeBuildNumber;
    let catchupId: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(async () => {
      if (catchupId) { clearTimeout(catchupId); catchupId = null; }

      const promises: [Promise<BuildInfo | null>, Promise<boolean | void>] = [
        fetchBuildInfo(appName),
        isViewingActive
          ? fetchBuildLogs(appName, buildNum, true, true)
          : Promise.resolve(false),
      ];
      const [latestBuildInfo, more] = await Promise.all(promises);

      if (latestBuildInfo && !latestBuildInfo.building) {
        stalePollingCountRef.current += 1;
        if (stalePollingCountRef.current >= 3) {
          stalePollingCountRef.current = 0;
          api
            .post('/services/platform-apps/recover-build', { app_id: appId })
            .catch(() => {});
        }
      } else {
        stalePollingCountRef.current = 0;
      }

      if (more && isViewingActive) {
        catchupId = setTimeout(async () => {
          catchupId = null;
          await fetchBuildLogs(appName, buildNum, true, true);
        }, 400);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      if (catchupId) clearTimeout(catchupId);
      stalePollingCountRef.current = 0;
    };
  }, [app?.name, appId, isBuilding, activeBuildNumber, activeBuildTrigger, viewingBuildNumber, fetchBuildInfo, fetchBuildLogs]);

  // After a build completes, poll K8s details until servingBuildNumber reflects
  // the new pod's image tag. K8s rolling updates can take 10-30s after the build
  // finishes — a single delayed fetch is unreliable.
  useEffect(() => {
    const wasBuilding = prevBuildingRef.current;
    prevBuildingRef.current = isBuilding;

    if (wasBuilding === true && !isBuilding) {
      refetchDeployments();
      // Re-fetch full app state: last_failure_reason, can_rollback, rollback_target_build_number
      // and other server-computed fields are not carried by the Supabase realtime payload.
      fetchApp();

      // Poll details every 5s for up to 60s until the K8s pod image updates
      let attempts = 0;
      const maxAttempts = 12;
      const pollId = setInterval(() => {
        attempts++;
        refetchDetails();
        if (attempts >= maxAttempts) {
          clearInterval(pollId);
        }
      }, 5000);
      return () => clearInterval(pollId);
    }
  }, [isBuilding, refetchDetails, refetchDeployments, fetchApp]);

  // Idle poll: when no build is running, check Jenkins every 15 s so webhook-triggered
  // builds (started entirely on the backend) are detected promptly. Once Jenkins
  // reports building=true the fast 2 s polling loop above takes over.
  useEffect(() => {
    if (!app?.name || isBuilding) return;
    const id = setInterval(() => fetchBuildInfo(app.name), 15_000);
    return () => clearInterval(id);
  }, [app?.name, isBuilding, fetchBuildInfo]);

  useEffect(() => {
    if (!isBuilding) {
      stalePollingCountRef.current = 0;
    }
  }, [isBuilding]);

  // When the latest resize operation transitions to SUCCESS/FAILURE, refresh app data
  // so the header reflects the updated size. This is needed because resize runs on a
  // separate Jenkins job (build_number = null) and never sets isBuilding, so the
  // normal build-completion effect never fires for resize.
  useEffect(() => {
    const latestResize = operationDeployments.find((d) => d.trigger === 'resize');
    if (!latestResize) return;

    // Seed the ref on first render so we don't react to already-completed operations
    if (prevResizeOpIdRef.current === null) {
      prevResizeOpIdRef.current = latestResize.id;
      return;
    }

    // A new resize operation appeared and it's no longer building
    if (latestResize.id !== prevResizeOpIdRef.current && latestResize.status !== 'BUILDING') {
      prevResizeOpIdRef.current = latestResize.id;
      setPendingResizeSize(null);
      // Refresh on both success and failure: failure reason and status are updated server-side
      fetchApp();
    }
  }, [operationDeployments, fetchApp]);

  useEffect(() => {
    if (operationDeployments.length === 0) {
      setSelectedOperationId(null);
      setOperationLogs('');
      return;
    }

    const nextSelected =
      selectedOperationId && operationDeployments.some((deployment) => deployment.id === selectedOperationId)
        ? selectedOperationId
        : operationDeployments[0].id;

    if (nextSelected !== selectedOperationId) {
      fetchOperationLogs(nextSelected);
    }
  }, [fetchOperationLogs, operationDeployments, selectedOperationId]);

  // Notify when a new active build number appears.
  // This follows the merged active build state (optimistic local start or DB row),
  // so it still works during the realtime gap after manual resize/redeploy.
  useEffect(() => {
    if (!activeBuildNumber) return;
    const prev = prevBuildNumberRef.current;
    prevBuildNumberRef.current = activeBuildNumber;
    // prev === null means this is the first fetch � don't toast for an already-running build.
    if (prev === null) return;
    if (activeBuildNumber > prev) {
      toast.info(`Build #${activeBuildNumber} started`, { duration: 5000 });
    }
  }, [activeBuildNumber]);

  // Reset env vars state when navigating to a different app
  useEffect(() => {
    setEnvVarsLoaded(false);
    setEnvVarsLoading(false);
    setEditedEnvVars([]);
    setEnvVarsModified(false);
  }, [app?.id]);

  // Clear decrypted env var values from memory when the user leaves the Settings tab.
  // Secrets should not persist in React state any longer than necessary.
  useEffect(() => {
    if (activeTab !== 'settings') {
      // Cancel all pending reveal-expiry timers and wipe state when leaving the tab
      revealTimersRef.current.forEach(t => clearTimeout(t));
      revealTimersRef.current.clear();
      setEditedEnvVars([]);
      setEnvVarsLoaded(false);
      setEnvVarsModified(false);
    }
  }, [activeTab]);

  // Lazy-load env var values only when the Settings tab is first opened.
  // Values are intentionally excluded from the main page-load GET response
  // to avoid sending decrypted secrets over the wire unnecessarily.
  useEffect(() => {
    if (activeTab !== 'settings' || !app?.id || envVarsLoaded || envVarsLoading) return;

    setEnvVarsLoading(true);
    setEnvVarError(null);

    fetch('/api/services/platform-apps/env-vars/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: app.id }),
    })
      .then(res => res.ok ? res.json() : res.json().then(d => Promise.reject(d.error || 'Failed to load')))
      .then((data: { env_vars: Array<{ key: string; hasValue: boolean }>; truncated?: boolean }) => {
        setEditedEnvVars(
          data.env_vars.map(ev => ({ key: ev.key, value: '', hasValue: ev.hasValue, revealed: false, visible: false }))
        );
        setEnvVarsLoaded(true);
      })
      .catch((msg: string) => setEnvVarError(typeof msg === 'string' ? msg : 'Failed to load environment variables'))
      .finally(() => setEnvVarsLoading(false));
  }, [activeTab, app?.id, envVarsLoaded, envVarsLoading]);

  // Initialize project assignment when app data loads
  useEffect(() => {
    if (app?.project_id !== undefined) {
      setProjectId(app.project_id || null);
    }
  }, [app?.project_id]);

  // Reveal the value for a single masked env var by fetching it on demand.
  const handleRevealVar = useCallback(async (key: string) => {
    if (!app?.id || revealingKey === key) return;
    setRevealingKey(key);
    try {
      const res = await fetch('/api/services/platform-apps/env-vars/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: app.id, key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reveal');
      setEditedEnvVars(prev =>
        prev.map(ev =>
          ev.key === key ? { ...ev, value: data.value, revealed: true, visible: true } : ev
        )
      );

      // Auto-clear the revealed value after 5 minutes — secrets shouldn't sit in
      // React state any longer than necessary if the user walks away.
      const existing = revealTimersRef.current.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setEditedEnvVars(prev =>
          prev.map(ev =>
            ev.key === key && ev.revealed
              ? { ...ev, value: '', revealed: false, visible: false }
              : ev
          )
        );
        revealTimersRef.current.delete(key);
      }, 5 * 60_000);
      revealTimersRef.current.set(key, timer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reveal variable';
      setEnvVarError(msg);
    } finally {
      setRevealingKey(null);
    }
  }, [app?.id, revealingKey]);

  // Handle env var changes - now handled by EnvVarsEditor
  const handleEnvVarsChange = (vars: EnvVar[]) => {
    setEditedEnvVars(vars);
    setEnvVarsModified(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);
  };

  const handleSaveEnvVars = async () => {
    if (!app) return;
    
    // Separate vars the user actually has values for from vars that were
    // never revealed (existing server-side vars the user didn't touch).
    const allValid = editedEnvVars
      .map((env) => ({
        key: (env.key ?? '').trim(),
        value: env.value ?? '',
        visible: env.visible ?? false,
        revealed: env.revealed ?? false,
        hasValue: env.hasValue ?? false,
      }))
      .filter((env) => env.key !== '');

    // Vars to upsert: new vars (hasValue=false) + revealed existing vars
    const validEnvVars = allValid.filter(env => !env.hasValue || env.revealed);
    // Vars to preserve server-side without overwriting their stored value
    const keptKeys = allValid
      .filter(env => env.hasValue && !env.revealed)
      .map(env => env.key);
    
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
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey('env-update'),
        },
        body: JSON.stringify({
          app_id: app.id,
          env_vars: validEnvVars.map(env => ({
            key: env.key.trim(),
            value: env.value,
          })),
          kept_keys: keptKeys,
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
            'Runtime environment variables have been applied and are live. Client-side build-time variables (NEXT_PUBLIC_*, NUXT_PUBLIC_*, PUBLIC_*, VITE_*) require a rebuild to take effect — click Redeploy to trigger a rebuild.',
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
    setSelectedOperationId(null);
    // If selecting the active build, clear the override so we follow live state
    if (activeBuildNumber !== null && buildNumber === activeBuildNumber) {
      setViewingBuildNumber(null);
    } else {
      setViewingBuildNumber(buildNumber);
    }
    setActiveTab('build-logs');
  };

  const handleRedeploy = async () => {
    if (!app) return;

    setRedeploying(true);
    setEnvVarError(null);
    setEnvVarSuccess(null);
    // Clear stale failure reason optimistically so it doesn't flash while the build starts
    setApp(prev => prev ? { ...prev, last_failure_reason: null } : null);

    try {
      const res = await fetch('/api/services/platform-apps/redeploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey('redeploy'),
        },
        body: JSON.stringify({ app_id: app.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.code === 'GIT_TOKEN_MISSING') {
          const validProviders = ['github', 'gitlab', 'bitbucket'];
          const provider: string = validProviders.includes(data.provider) ? (data.provider as string) : 'github';
          setEnvVarError(`Your ${provider} account is not connected or the token has expired. Redirecting to Account Settings to reconnect…`);
          redirectTimerRef.current = setTimeout(() => {
            router.push(`/dashboard/nav/account?reconnect=${provider}&returnTo=/dashboard/services/apps/${app.id}`);
          }, 1500);
          return;
        }
        throw new Error(data.error || 'Failed to trigger redeploy');
      }

      const data = await res.json();
      setSelectedOperationId(null);

      if (res.status === 202 || typeof data.build_number !== 'number') {
        setEnvVarSuccess(data.message || 'Redeploy is already in progress.');
        setActiveTab('build-logs');
        refetchDeployments();
        return;
      }

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
    // Clear stale failure reason optimistically so it doesn't flash while the build starts
    setApp(prev => prev ? { ...prev, last_failure_reason: null } : null);

    try {
      const res = await fetch('/api/services/platform-apps/resize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey('resize'),
        },
        body: JSON.stringify({ app_id: app.id, new_size: selectedSize }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to resize app');
      }

      setPendingResizeSize(selectedSize);
      setResizeSuccess(data.message || `Resize operation started to ${selectedSize}`);
      setSelectedSize(null);
      if (data.operation_id) {
        setActiveTab('build-logs');
        fetchOperationLogs(data.operation_id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resize app';
      setResizeError(message);
    } finally {
      setResizing(false);
    }
  };

  const handleRollbackSuccess = useCallback(async () => {
    setEnvVarError(null);
    setEnvVarSuccess('Rollback completed successfully');
    await Promise.all([refetchDeployments(), refetchDetails()]);
    await fetchApp();
  }, [fetchApp, refetchDeployments, refetchDetails]);

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

  // -- Transparency: derive which build is actually serving traffic --
  const servingBuildNumber = useMemo(() => {
    // The running container's imageTag is the Jenkins BUILD_NUMBER (e.g. "14")
    const tag = details?.container?.imageTag;
    if (!tag) return null;
    const num = parseInt(tag, 10);
    return Number.isNaN(num) ? null : num;
  }, [details?.container?.imageTag]);
  const lastOperationBuildNumber = useMemo(() => {
    if (
      typeof latestOperationDeployment?.build_number === 'number' &&
      latestOperationDeployment.build_number > 0
    ) {
      return latestOperationDeployment.build_number;
    }

    if (
      typeof latestOperationDeployment?.rollback_target_build_number === 'number' &&
      latestOperationDeployment.rollback_target_build_number > 0
    ) {
      return latestOperationDeployment.rollback_target_build_number;
    }

    return typeof app?.last_operation_build_number === 'number'
      ? app.last_operation_build_number
      : null;
  }, [app?.last_operation_build_number, latestOperationDeployment]);
  const lastOperationTrigger = useMemo(() => {
    if (typeof latestOperationDeployment?.trigger === 'string') {
      return latestOperationDeployment.trigger;
    }

    return typeof app?.last_operation_trigger === 'string'
      ? app.last_operation_trigger
      : null;
  }, [app?.last_operation_trigger, latestOperationDeployment]);
  const lastOperationLabel = useMemo(() => {
    if (!lastOperationTrigger && lastOperationBuildNumber === null) return null;
    return getAppOperationLabel({
      buildNumber: lastOperationBuildNumber,
      trigger: lastOperationTrigger,
      rollbackTargetBuildNumber: latestOperationDeployment?.rollback_target_build_number ?? null,
      operationDetails: latestOperationDeployment?.operation_details ?? null,
    });
  }, [lastOperationBuildNumber, lastOperationTrigger, latestOperationDeployment]);
  const canRollback = useMemo(
    () => !!app?.can_rollback,
    [app?.can_rollback]
  );

  // Detect "degraded" state: app status is running (old pod healthy) but the
  // latest deployment failed � meaning the new code never took over.
  const isDegraded = useMemo(() => {
    if (app?.status !== 'running') return false;
    if (!latestReleaseDeployment) return false;
    // While a deploy is in progress the new pod hasn't started yet � not degraded.
    if (latestReleaseDeployment.status === 'BUILDING') return false;
    // While actively building � not degraded.
    if (isBuilding) return false;
    // No image tag info yet � can't determine serving version.
    if (servingBuildNumber === null) return false;
    // Details still loading � don't flash a false degraded banner.
    if (detailsLoading) return false;
    // Sole ground truth: is a completed deployment (any recorded status) sitting at
    // a higher build number than what the pod is actually running?
    // We intentionally ignore latestDeployment.status here because the deployment
    // record is written by a webhook that can silently fail (e.g. WEBHOOK_BASE_URL
    // misconfigured). The running container's image tag is always reliable � if the
    // build number matches what's serving, the deploy succeeded regardless of what
    // the database says.
    if (latestReleaseDeployment.build_number <= servingBuildNumber) return false;
    // Not degraded if the user intentionally rolled back from the latest release build —
    // a successful rollback operation after that build's creation time means it was
    // deliberately replaced, not stuck.
    const latestReleasedAt = new Date(latestReleaseDeployment.created_at).getTime();
    const wasRolledBackFrom = operationDeployments.some(
      (d) =>
        d.trigger === 'rollback' &&
        d.status === 'SUCCESS' &&
        new Date(d.created_at).getTime() > latestReleasedAt
    );
    return !wasRolledBackFrom;
  }, [app?.status, latestReleaseDeployment, servingBuildNumber, isBuilding, detailsLoading, operationDeployments]);

  // High restart count warning (CrashLoopBackOff signature)
  const restartCount = details?.container?.restartCount ?? health?.restart_count ?? 0;
  const hasHighRestarts = restartCount >= 5;

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
  const currentSize = (app.size === 'medium' || app.size === 'large' ? app.size : 'small') as SizeKey;
  const currentSizeSpec = PLATFORM_APP_SIZE_SPECS[currentSize];
  const currentSizePrice = platformPricing[currentSize]?.price ?? 0;

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
                {<AppStatusBadge status={app.status} building={isBuilding} />}
                {/* Live badge � but show Degraded when new deploy failed and old pod is serving */}
              {appConnectionStatus === 'connected' && app.status === 'running' && !isBuilding && (
                  isDegraded ? (
                    <Badge className="rounded-none border-orange-400/20 bg-orange-500/10 text-orange-300 text-xs">
                      <AlertTriangle className="mr-1.5 h-2 w-2" />
                      Degraded
                    </Badge>
                  ) : (
                    <Badge className="rounded-none border-emerald-400/20 bg-emerald-500/10 text-emerald-300 text-xs">
                      <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                      Live
                    </Badge>
                  )
                )}
                {/* Show which build is actually serving traffic */}
                {servingBuildNumber !== null && app.status === 'running' && !isBuilding && (
                  <Badge className="rounded-none border-white/10 bg-white/[0.05] text-white/60 text-xs font-mono">
                    Serving Build #{servingBuildNumber}
                  </Badge>
                )}
                {lastOperationLabel && !isBuilding && (
                  <Badge className="rounded-none border-white/10 bg-white/[0.05] text-white/60 text-xs">
                    Last Operation: {lastOperationLabel}
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

              {/* Failure reason: shown for failed apps AND running apps with a recent operation failure (e.g. resize, redeploy on first-ever build) that did NOT leave a prior release live */}
              {app.last_failure_reason && !isBuilding && !isDegraded &&
                (app.status === 'failed' || app.status === 'running') && (
                <div className={`mt-3 flex items-center gap-2 border px-3 py-2 text-sm ${
                  app.status === 'failed'
                    ? 'border-red-400/20 bg-red-500/10 text-red-300'
                    : 'border-orange-400/20 bg-orange-500/10 text-orange-300'
                }`}>
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{app.last_failure_reason}</span>
                </div>
              )}
              {/* Degraded state warning: newer release failed but old pod is still serving */}
              {isDegraded && latestReleaseDeployment && servingBuildNumber !== null && (
                <div className="mt-3 flex items-center gap-2 border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-sm text-orange-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {`Build #${latestReleaseDeployment.build_number} did not take over — still serving Build #${servingBuildNumber}.`}
                    {app.last_failure_reason ? ` Failure: ${app.last_failure_reason}` : ''}
                  </span>
                </div>
              )}
              {/* High restart warning */}
              {hasHighRestarts && app.status === 'running' && !isBuilding && (
                <div className="mt-3 flex items-center gap-2 border border-yellow-400/20 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300">
                  <RefreshCw className="h-4 w-4 flex-shrink-0" />
                  <span>
                    Your app has restarted {restartCount} times. It may be repeatedly crashing — check Runtime Logs.
                  </span>
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
              onClick={() => setRollbackModalOpen(true)}
              disabled={deploymentMutationBlocked || !canRollback}
              className="rounded-none border-white/[0.12] bg-white/[0.03] text-white hover:bg-white/[0.08]"
              title={
                canRollback
                  ? app?.rollback_target_build_number
                    ? `Rollback release to Build #${app.rollback_target_build_number}; current size stays unchanged`
                    : 'Rollback to the previous successful release'
                  : 'No previous release available. Resize-only operations do not create rollback targets.'
              }
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Rollback Release
            </Button>
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
              disabled={deploymentMutationBlocked}
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
                {resizeInProgress ? 'Requested Size' : 'Runtime Size'}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold capitalize text-white">{currentSize}</p>
                  <p className="text-xs text-white/45">
                    {currentSizeSpec.cpu} – {currentSizeSpec.memory}
                  </p>
                  {resizeInProgress ? (
                    <p className="mt-1 text-[11px] text-amber-300/80">
                      Resize rollout in progress. Serving capacity updates after deployment finishes.
                    </p>
                  ) : null}
                </div>
                <Badge className="rounded-none border-white/[0.08] bg-white/[0.04] text-white/75">
                  {currentSizePrice > 0 ? `$${currentSizePrice.toFixed(2)}/mo` : 'Free'}
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
                            health?.status === 'degraded' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {health?.status || details?.pod?.phase || 'Unknown'}
                          </Badge>
                        </div>
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <p className="text-xs text-white/40 mb-1">Instances</p>
                          <p className="text-xl font-bold text-white">
                            {details?.deployment?.readyReplicas || health?.pod_count || 0}/{details?.deployment?.replicas || 1}
                          </p>
                        </div>
                        <div className={`border bg-white/[0.03] px-4 py-4 ${hasHighRestarts ? 'border-yellow-500/30' : 'border-white/[0.08]'}`}>
                          <p className="text-xs text-white/40 mb-1">Restarts</p>
                          <p className={`text-xl font-bold ${hasHighRestarts ? 'text-yellow-400' : 'text-white'}`}>
                            {restartCount}
                          </p>
                          {hasHighRestarts && (
                            <p className="text-xs text-yellow-400/70 mt-1">Repeatedly restarting</p>
                          )}
                        </div>
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <p className="text-xs text-white/40 mb-1">Uptime</p>
                          <p className="text-sm text-white">{details?.pod?.uptime || '-'}</p>
                        </div>
                      </div>

                      {/* Container Info: what image is actually running */}
                      {details?.container && (
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <h5 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                            <Box className="w-4 h-4" />
                            Running Version
                          </h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <p className="text-xs text-white/40 mb-1">Image Tag</p>
                              <p className="text-sm font-mono text-white">{details.container.imageTag || 'latest'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 mb-1">State</p>
                              <Badge className={`rounded-none text-xs ${
                                details.container.state === 'Running' ? 'bg-green-500/20 text-green-400' :
                                details.container.state?.includes('CrashLoop') ? 'bg-red-500/20 text-red-400' :
                                'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {details.container.state?.includes('CrashLoop') ? 'Restarting' : details.container.state || 'Unknown'}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 mb-1">Ready</p>
                              <Badge className={`rounded-none text-xs ${
                                details.container.ready ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                              }`}>
                                {details.container.ready ? 'Yes' : 'No'}
                              </Badge>
                            </div>
                            {servingBuildNumber !== null && (
                              <div>
                                <p className="text-xs text-white/40 mb-1">Serving Build</p>
                                <p className="text-sm font-mono text-emerald-300">#{servingBuildNumber}</p>
                              </div>
                            )}
                            {lastOperationLabel && (
                              <div>
                                <p className="text-xs text-white/40 mb-1">Last Operation</p>
                                <p className="text-sm text-white">
                                  {lastOperationLabel}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}



                      {/* Resource Usage */}
                      {metrics && details?.container?.resources && (
                        <div>
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
                              <div className="mt-2 space-y-1 text-[11px] text-white/40 font-mono">
                                <p>Allocated: {details.container.resources.requests?.cpu || '-'}</p>
                                <p>Max: {details.container.resources.limits?.cpu || '-'}</p>
                              </div>
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
                              <div className="mt-2 space-y-1 text-[11px] text-white/40 font-mono">
                                <p>Allocated: {details.container.resources.requests?.memory || '-'}</p>
                                <p>Max: {details.container.resources.limits?.memory || '-'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Capacity */}
                      {details?.deployment && (
                        <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs text-white/40 mb-1">Running Instances</p>
                              <p className="text-2xl font-bold text-white">{details.deployment.readyReplicas}/{details.deployment.replicas}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-white/40 mb-1">Status</p>
                              <Badge className={`rounded-none ${
                                details.deployment.readyReplicas >= details.deployment.replicas
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {details.deployment.readyReplicas >= details.deployment.replicas ? 'Healthy' : 'Scaling'}
                              </Badge>
                            </div>
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
                              <p className="text-xs text-white/40 mb-1">Hostname</p>
                              <div className="flex items-center gap-1">
                                <p className="text-xs font-mono text-white truncate flex-1">{details.network.ingressHost}</p>
                                <button
                                  onClick={() => copyToClipboard(details.network?.ingressHost || '', 'ingress-host')}
                                  className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                                  title="Copy hostname"
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

                      {/* Warning Events from K8s */}
                      {details?.events && details.events.filter(e => e.type === 'Warning').length > 0 && (
                        <div className="border border-yellow-500/20 bg-yellow-500/[0.04] px-4 py-4">
                          <h5 className="text-sm font-semibold text-yellow-400/80 mb-3 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4" />
                            Recent Warnings
                          </h5>
                          <div className="space-y-2">
                            {details.events.filter(e => e.type === 'Warning').map((event, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs text-yellow-200/70">
                                <span className="font-mono text-yellow-400/60 shrink-0">{event.reason}</span>
                                <span className="text-white/50">{event.message}</span>
                                {event.count > 1 && (
                                  <Badge className="rounded-none bg-yellow-500/10 text-yellow-400/60 text-[10px] ml-auto shrink-0">
                                    �{event?.count}
                                  </Badge>
                                )}
                              </div>
                            ))}
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
            <div className="space-y-4">
              <BuildLogsPanel 
                buildInfo={displayBuildInfo} 
                buildLogs={buildLogs}
                initialLoading={initialLogLoading}
                appName={app.name}
                fetchBuildLogs={fetchBuildLogs}
                deployments={releaseDeployments}
                onSelectBuild={handleSelectBuild}
              />
              <OperationLogsPanel
                operations={operationDeployments}
                selectedOperationId={selectedOperationId}
                logs={operationLogs}
                loading={operationLogsLoading}
                onSelectOperation={fetchOperationLogs}
                onRefresh={() => {
                  if (selectedOperationId) {
                    fetchOperationLogs(selectedOperationId);
                  }
                }}
              />
            </div>
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
            <DeploymentHistory
              deployments={deploymentsForHistory}
              deploymentsLoading={deploymentsLoading}
              connectionStatus={connectionStatus}
              servingBuildNumber={servingBuildNumber}
              onSelectBuild={handleSelectBuild}
              onViewOperationLogs={(deploymentId) => {
                setActiveTab('build-logs');
                fetchOperationLogs(deploymentId);
              }}
            />
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
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setRollbackModalOpen(true)}
                      disabled={deploymentMutationBlocked || !canRollback}
                      variant="outline"
                      className="rounded-none border-white/15 bg-transparent text-white hover:bg-white/10"
                      title={
                        canRollback
                          ? app?.rollback_target_build_number
                            ? `Rollback release to Build #${app.rollback_target_build_number}; current size stays unchanged`
                            : 'Rollback to the previous successful release'
                          : 'No previous release available. Resize-only operations do not create rollback targets.'
                      }
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Rollback Release
                    </Button>
                    <Button
                      onClick={handleRedeploy}
                      disabled={redeploying || deploymentMutationBlocked}
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
                    {PLATFORM_APP_SIZE_ORDER.map((size) => {
                      const specs = PLATFORM_APP_SIZE_SPECS[size];
                      const monthlyPrice = platformPricing[size]?.price ?? 0;
                      const currentSize = (app.size === 'medium' || app.size === 'large' ? app.size : 'small') as SizeKey;
                      const isCurrent = size === currentSize;
                      const isUpgrade =
                        PLATFORM_APP_SIZE_ORDER.indexOf(size) >
                        PLATFORM_APP_SIZE_ORDER.indexOf(currentSize);
                      const isSelected = selectedSize === size;
                      const isDisabled = !isUpgrade || deploymentMutationBlocked;

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
                              <span>{specs.replicas} instance{specs.replicas > 1 ? 's' : ''}</span>
                            </div>
                          </div>

                          <p className="mt-3 text-sm font-medium text-white/90">
                            {monthlyPrice > 0 ? `$${monthlyPrice.toFixed(2)}/mo` : 'Free'}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {selectedSize && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        onClick={handleResize}
                        disabled={resizing || deploymentMutationBlocked}
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
                  {envVarsLoading ? (
                    <div className="flex items-center gap-2 py-6 text-white/50 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading environment variables…
                    </div>
                  ) : (
                    <EnvVarsEditor value={editedEnvVars} onChange={handleEnvVarsChange} appId={app?.id} onReveal={handleRevealVar} revealingKey={revealingKey} />
                  )}

                  {/* Save Button */}
                  {envVarsModified && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        onClick={handleSaveEnvVars}
                        disabled={savingEnvVars || deploymentMutationBlocked}
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
                    disabled={deploymentMutationBlocked}
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
      <RollbackAppModal
        open={rollbackModalOpen}
        onOpenChange={setRollbackModalOpen}
        appId={app?.id || null}
        appName={app?.name || null}
        currentBuildNumber={servingBuildNumber}
        targetBuildNumber={app?.rollback_target_build_number ?? null}
        targetCommitSha={app?.rollback_target_commit_sha ?? null}
        currentSizeLabel={app?.size ?? null}
        onRollbackSuccess={handleRollbackSuccess}
      />
    </div>
  );
}
