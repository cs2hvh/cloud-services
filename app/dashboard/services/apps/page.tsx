'use client';

import { motion } from "motion/react";
import { Code, Plus, Search, GitBranch, Globe, ExternalLink, Loader2, CheckCircle2, XCircle, Clock, Trash2, Eye, Terminal, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Image from "next/image";
import { useEffect, useState } from "react";

interface App {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  port: number;
  status: string;
  deployment_url?: string;
  created_at: string;
  project_id?: string;
}

interface BuildInfo {
  number: number;
  building: boolean;
  result: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | null;
  duration: number;
  timestamp: number;
  url: string;
}

const ApplicationDeploymentPage = () => {
  const [deployedApps, setDeployedApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [buildInfo, setBuildInfo] = useState<Record<string, BuildInfo>>({});
  const [buildLogs, setBuildLogs] = useState<Record<string, string>>({});
  const [fetchedBuilds, setFetchedBuilds] = useState<Set<string>>(new Set());
  
  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [appToDelete, setAppToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch apps
  useEffect(() => {
    fetchApps();
    const interval = setInterval(() => {
      // Don't refresh while deleting to prevent race condition
      if (!isDeleting) {
        fetchApps();
      }
    }, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [isDeleting]);

  // Fetch build info for each app (only once per app)
  useEffect(() => {
    deployedApps.forEach(app => {
      if (!fetchedBuilds.has(app.name)) {
        fetchBuildInfo(app.name);
        setFetchedBuilds(prev => new Set(prev).add(app.name));
      }
    });
  }, [deployedApps, fetchedBuilds]);

  // Refresh build info for apps that are building
  useEffect(() => {
    const buildingApps = deployedApps.filter(app => {
      const build = buildInfo[app.name];
      return build?.building || app.status === 'building';
    });

    if (buildingApps.length === 0) return;

    const interval = setInterval(() => {
      buildingApps.forEach(app => {
        fetchBuildInfo(app.name);
      });
    }, 10000); // Check building apps every 10 seconds

    return () => clearInterval(interval);
  }, [deployedApps, buildInfo]);

  const fetchApps = async () => {
    try {
      const res = await fetch('/api/services/platform-apps/list');
      const data = await res.json();
      // Preserve 'deleting' status for apps that are being deleted
      setDeployedApps(prev => {
        const deletingAppIds = prev.filter(app => app.status === 'deleting').map(app => app.id);
        const newApps = data.apps || [];
        // Keep deleting apps visible with their status
        const deletingApps = prev.filter(app => app.status === 'deleting' && !newApps.some((a: App) => a.id === app.id));
        return [
          ...newApps.map((app: App) => 
            deletingAppIds.includes(app.id) ? { ...app, status: 'deleting' } : app
          ),
          ...deletingApps
        ];
      });
    } catch (error) {
      console.error('Error fetching apps:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuildInfo = async (appName: string) => {
    try {
      const res = await fetch(`/api/jenkins/build-info?app=${appName}`);
      if (res.ok) {
        const data = await res.json();
        setBuildInfo(prev => ({ ...prev, [appName]: data }));
      }
    } catch (error) {
      console.error(`Error fetching build info for ${appName}:`, error);
    }
  };

  const fetchBuildLogs = async (appName: string, buildNumber: number) => {
    try {
      const res = await fetch(`/api/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=0`);
      if (res.ok) {
        const data = await res.json();
        setBuildLogs(prev => ({ ...prev, [appName]: data.logs }));
      }
    } catch (error) {
      console.error(`Error fetching build logs for ${appName}:`, error);
    }
  };

  const deleteApp = async (appId: string, appName: string) => {
    // Open confirmation modal
    setAppToDelete({ id: appId, name: appName });
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!appToDelete) return;
    
    const { id: appId, name: appName } = appToDelete;
    setIsDeleting(true);
    
    // Show loading state in the app list (keep the app visible with 'deleting' status)
    setDeployedApps(prev => prev.map(app => 
      app.id === appId ? { ...app, status: 'deleting' } : app
    ));
    
    try {
      const res = await fetch(`/api/services/platform-apps/delete`, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app_id: appId
        })
      });
      
      if (res.ok) {
        toast.success(`${appName} deleted successfully`, {
          description: "All resources have been cleaned up including DNS, Kubernetes, and certificates."
        });
        // Remove the app from the list AFTER successful deletion
        setDeployedApps(prev => prev.filter(app => app.id !== appId));
      } else {
        // Restore original status on error
        setDeployedApps(prev => prev.map(app => 
          app.id === appId ? { ...app, status: 'running' } : app
        ));
        const errorData = await res.json();
        toast.error(`Failed to delete ${appName}`, {
          description: errorData.error || 'An unexpected error occurred'
        });
      }
    } catch (error) {
      // Restore original status on error
      setDeployedApps(prev => prev.map(app => 
        app.id === appId ? { ...app, status: 'running' } : app
      ));
      console.error('Error deleting app:', error);
      toast.error(`Error deleting ${appName}`, {
        description: 'Network error or server unavailable'
      });
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setAppToDelete(null);
    }
  };

  const getStatusBadge = (status: string, buildResult?: BuildInfo) => {
    if (buildResult?.building) {
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Building</Badge>;
    }
    
    switch (status) {
      case 'running':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Running</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'building':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Building</Badge>;
      case 'deleting':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Deleting</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  // Filter apps based on search
  const filteredApps = deployedApps.filter(app => 
    app.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const stats = {
    totalApps: deployedApps.length,
    activeDeployments: deployedApps.filter(app => app.status === 'running').length,
    totalBuilds: deployedApps.length,
    successRate: deployedApps.length > 0 
      ? `${Math.round((deployedApps.filter(app => app.status === 'running').length / deployedApps.length) * 100)}%`
      : "100%"
  };

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Application Deployment</h1>
          <p className="text-white/60">Deploy your applications directly from Git repositories with automatic builds and scaling.</p>
        </div>
        <Link
          href="/dashboard/services/apps/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          Deploy Application
        </Link>
      </motion.div>

      {/* About Application Deployment */}
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
              Our Application Deployment platform allows you to deploy web applications, APIs, and static sites directly from your Git repositories. 
              Similar to Vercel or DigitalOcean App Platform, simply connect your GitHub, GitLab, or Bitbucket repository and we&apos;ll automatically 
              build and deploy your application. With support for popular frameworks like Next.js, React, Vue, Node.js, Python, and more, 
              you can go from code to production in minutes with automatic SSL, custom domains, and global CDN distribution.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Cards */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
      >
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60">Total Apps</p>
                <p className="text-2xl font-bold text-white">{stats.totalApps}</p>
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
                <p className="text-2xl font-bold text-white">{stats.activeDeployments}</p>
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
                <p className="text-2xl font-bold text-white">{stats.totalBuilds}</p>
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
                <p className="text-2xl font-bold text-white">{stats.successRate}</p>
              </div>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                Healthy
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Deployed Applications */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
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
                {deployedApps.length} {deployedApps.length === 1 ? 'app' : 'apps'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 text-white/30 mb-4 animate-spin" />
                <p className="text-white/60">Loading applications...</p>
              </div>
            ) : deployedApps.length > 0 ? (
              <div>
                {/* Search bar */}
                <div className="bg-black/30 p-3 rounded-lg mb-4 flex items-center justify-between border border-white/5">
                  <div className="flex items-center w-full max-w-md">
                    <Search className="w-4 h-4 text-white/40 mr-2"/>
                    <input 
                      type="text" 
                      placeholder="Search applications..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-transparent focus:outline-none text-sm text-white placeholder-white/40"
                    />
                  </div>
                  <div className="text-xs text-white/50">
                    {filteredApps.length} of {deployedApps.length}
                  </div>
                </div>
                
                {/* Scrollable apps list */}
                <div className="max-h-[500px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {filteredApps.map((app) => {
                    const build = buildInfo[app.name];
                    const logs = buildLogs[app.name];
                    const isExpanded = selectedApp === app.name;
                    const domain = app.deployment_url ? new URL(app.deployment_url).hostname : `${app.slug}.galaxyhvh.com`;
                    const isAppDeleting = app.status === 'deleting';

                    return (
                      <div 
                        key={app.id} 
                        className={`rounded-lg border transition-all duration-200 ${
                          isAppDeleting 
                            ? 'bg-yellow-500/5 border-yellow-500/20 opacity-70' 
                            : 'bg-black/30 border-white/5 hover:border-white/10 hover:bg-black/40'
                        }`}
                      >
                        <div className="p-4">
                          {/* Main Row */}
                          <div className="flex items-center justify-between">
                            {/* Left: App Info */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              {/* Status Indicator */}
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isAppDeleting ? 'bg-yellow-400 animate-pulse' :
                                app.status === 'running' ? 'bg-green-400' : 
                                app.status === 'failed' ? 'bg-red-400' :
                                app.status === 'building' ? 'bg-blue-400 animate-pulse' :
                                'bg-yellow-400'
                              }`} />
                              
                              {/* App Name & URL */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-sm font-semibold text-white truncate">{app.name}</h3>
                                  {getStatusBadge(app.status, build)}
                                </div>
                                <a 
                                  href={`https://${domain}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className={`text-xs flex items-center gap-1 transition-colors truncate ${
                                    isAppDeleting ? 'text-white/40 pointer-events-none' : 'text-white/50 hover:text-blue-400'
                                  }`}
                                >
                                  <Globe className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{domain}</span>
                                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                </a>
                              </div>
                            </div>

                            {/* Center: Build Info */}
                            <div className="hidden md:flex items-center gap-6 px-4">
                              <div className="text-center">
                                <p className="text-xs text-white/40 mb-0.5">Port</p>
                                <p className="text-sm text-white font-mono">{app.port}</p>
                              </div>
                              {build && (
                                <div className="text-center">
                                  <p className="text-xs text-white/40 mb-0.5">Build</p>
                                  <p className="text-sm text-white font-mono flex items-center gap-1">
                                    #{build.number}
                                    {build.building ? (
                                      <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                                    ) : build.result === 'SUCCESS' ? (
                                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    ) : build.result === 'FAILURE' ? (
                                      <XCircle className="w-3 h-3 text-red-400" />
                                    ) : null}
                                  </p>
                                </div>
                              )}
                              <div className="text-center">
                                <p className="text-xs text-white/40 mb-0.5">Created</p>
                                <p className="text-sm text-white/70">{new Date(app.created_at).toLocaleDateString()}</p>
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-2 ml-4">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isAppDeleting}
                                onClick={() => {
                                  if (isExpanded) {
                                    setSelectedApp(null);
                                  } else {
                                    setSelectedApp(app.name);
                                    if (build) {
                                      fetchBuildLogs(app.name, build.number);
                                    }
                                  }
                                }}
                                className="h-8 px-2 text-white/60 hover:text-white hover:bg-white/10"
                              >
                                <Terminal className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isAppDeleting}
                                onClick={() => deleteApp(app.id, app.name)}
                                className="h-8 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                              >
                                {isAppDeleting ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Mobile: Additional Info */}
                          <div className="md:hidden mt-3 pt-3 border-t border-white/5 flex items-center gap-4 text-xs text-white/50">
                            <span className="flex items-center gap-1">
                              <GitBranch className="w-3 h-3" />
                              Port {app.port}
                            </span>
                            {build && (
                              <span className="flex items-center gap-1">
                                Build #{build.number}
                                {build.building ? (
                                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                                ) : build.result === 'SUCCESS' ? (
                                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                                ) : build.result === 'FAILURE' ? (
                                  <XCircle className="w-3 h-3 text-red-400" />
                                ) : null}
                              </span>
                            )}
                            <span>{new Date(app.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {/* Build Logs (Expandable) */}
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="border-t border-white/5"
                          >
                            <div className="p-4 bg-black/50">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-white/70 flex items-center">
                                  <Terminal className="w-3 h-3 mr-1.5" />
                                  Build Logs {build && `#${build.number}`}
                                </h4>
                                {build?.building && (
                                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                                )}
                              </div>
                              <pre className="text-[11px] text-white/70 font-mono overflow-x-auto max-h-64 overflow-y-auto bg-black/30 rounded p-3 custom-scrollbar">
                                {logs || 'Loading logs...'}
                              </pre>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* No results message */}
                {filteredApps.length === 0 && searchTerm && (
                  <div className="text-center py-8">
                    <Search className="w-8 h-8 text-white/20 mx-auto mb-2" />
                    <p className="text-sm text-white/50">No applications match "{searchTerm}"</p>
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
      </motion.div>

      {/* Supported Frameworks */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.3 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Supported Frameworks & Languages</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { name: 'Next.js', icon: '/next.svg' },
            { name: 'React', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg' },
            { name: 'Vue.js', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg' },
            { name: 'Node.js', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg' },
            { name: 'Express.js', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg' },
            { name: 'Python', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg' },
            { name: 'Django', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/django/django-plain.svg' },
            { name: 'Flask', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/flask/flask-original.svg' },
          ].map((framework) => (
            <Card key={framework.name} className="bg-white/5 border-white/10 text-center">
              <CardContent className="p-4">
                <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center">
                  <Image 
                    src={framework.icon} 
                    alt={framework.name}
                    width={48}
                    height={48}
                    className="object-contain"
                  />
                </div>
                <p className="text-sm font-medium text-white">{framework.name}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Git Providers */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.4 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Supported Git Providers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Image src="/github.png" alt="GitHub" width={20} height={20} className="mr-2" />
                GitHub
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Deploy directly from your GitHub repositories with automatic builds on every push.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• Public and private repositories</li>
                <li>• Branch-based deployments</li>
                <li>• Pull request previews</li>
                <li>• Automatic SSL certificates</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Image src="/gitlab.png" alt="GitLab" width={20} height={20} className="mr-2" />
                GitLab
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Seamless integration with GitLab repositories and CI/CD pipelines.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• GitLab.com and self-hosted</li>
                <li>• CI/CD pipeline integration</li>
                <li>• Merge request deployments</li>
                <li>• Environment variables</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Image src="/BitBucket.png" alt="Bitbucket" width={20} height={20} className="mr-2" />
                Bitbucket
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Deploy from Bitbucket repositories with support for Bitbucket Pipelines.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• Bitbucket Cloud integration</li>
                <li>• Pipeline-based deployments</li>
                <li>• Branch protection rules</li>
                <li>• Team collaboration features</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* How It Works */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.5 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6">How Application Deployment Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-400">1</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Connect Repository</h3>
              <p className="text-sm text-white/60">
                Connect your GitHub, GitLab, or Bitbucket repository to our platform
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-green-400">2</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Configure Build</h3>
              <p className="text-sm text-white/60">
                Set up build settings, environment variables, and deployment configuration
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-purple-400">3</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Automatic Deploy</h3>
              <p className="text-sm text-white/60">
                Every push triggers an automatic build and deployment to production
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-orange-400">4</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Scale & Monitor</h3>
              <p className="text-sm text-white/60">
                Monitor performance, scale automatically, and manage your live application
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent className="bg-zinc-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Delete Application
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-white/70 text-sm">
                Are you sure you want to delete <span className="font-semibold text-white">{appToDelete?.name}</span>?
                <br /><br />
                This action will permanently remove:
                <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
                  <li>Kubernetes deployment, service, and ingress</li>
                  <li>SSL certificate and TLS secret</li>
                  <li>DNS record</li>
                  <li>Jenkins build job</li>
                </ul>
                <p className="text-red-400 font-medium mt-4">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={isDeleting}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Application
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ApplicationDeploymentPage;
