'use client';

import { motion } from "motion/react";
import { Code, Plus, Search, GitBranch, Globe, ExternalLink, Loader2, CheckCircle2, XCircle, Clock, Trash2, Eye, Terminal } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  // Fetch apps
  useEffect(() => {
    fetchApps();
    const interval = setInterval(fetchApps, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

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
      setDeployedApps(data.apps || []);
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
    if (!confirm(`Are you sure you want to delete ${appName}? This action cannot be undone.`)) return;
    
    // Show loading state
    const originalApps = [...deployedApps];
    setDeployedApps(deployedApps.map(app => 
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
        // Remove the app from the list
        setDeployedApps(deployedApps.filter(app => app.id !== appId));
        const data = await res.json();
        alert(data.message || 'App deleted successfully');
      } else {
        // Restore original state on error
        setDeployedApps(originalApps);
        const errorData = await res.json();
        alert(errorData.error || 'Failed to delete app');
      }
    } catch (error) {
      // Restore original state on error
      setDeployedApps(originalApps);
      console.error('Error deleting app:', error);
      alert('Error deleting app');
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
        {loading ? (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 text-white/30 mb-4 animate-spin" />
              <p className="text-white/60">Loading applications...</p>
            </CardContent>
          </Card>
        ) : filteredApps.length > 0 ? (
          <div>
            {/* Search bar */}
            <div className="bg-white/5 p-4 rounded-lg mb-6 flex items-center justify-between">
              <div className="flex items-center w-full max-w-md">
                <Search className="w-5 h-5 text-white/50 mr-3"/>
                <input 
                  type="text" 
                  placeholder="Search deployed applications..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-transparent focus:outline-none text-white placeholder-white/50"
                />
              </div>
              <div className="text-sm text-white/60">
                {filteredApps.length} of {deployedApps.length} apps
              </div>
            </div>
            
            {/* Deployed applications */}
            <div className="grid grid-cols-1 gap-4">
              {filteredApps.map((app) => {
                const build = buildInfo[app.name];
                const logs = buildLogs[app.name];
                const isExpanded = selectedApp === app.name;
                const domain = app.deployment_url ? new URL(app.deployment_url).hostname : `${app.slug}.uizb210.xyz`;

                return (
                  <Card key={app.id} className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-white">{app.name}</h3>
                            {getStatusBadge(app.status, build)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-white/60">
                            <a 
                              href={`https://${domain}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center hover:text-white transition-colors"
                            >
                              <Globe className="w-4 h-4 mr-1" />
                              {domain}
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </a>
                            <span className="flex items-center">
                              <GitBranch className="w-4 h-4 mr-1" />
                              Port {app.port}
                            </span>
                            <span>
                              Created {new Date(app.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          
                          {build && (
                            <div className="mt-3 flex items-center gap-4 text-sm">
                              <span className="text-white/70">
                                Build #{build.number}
                              </span>
                              {build.building ? (
                                <span className="text-blue-400 flex items-center">
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Building...
                                </span>
                              ) : build.result === 'SUCCESS' ? (
                                <span className="text-green-400 flex items-center">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Success ({(build.duration / 1000).toFixed(0)}s)
                                </span>
                              ) : build.result === 'FAILURE' ? (
                                <span className="text-red-400 flex items-center">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Failed
                                </span>
                              ) : (
                                <span className="text-yellow-400">Pending</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
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
                            className="bg-white/5 border-white/10 hover:bg-white/20"
                          >
                            <Terminal className="w-4 h-4 mr-2" />
                            {isExpanded ? 'Hide' : 'View'} Logs
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteApp(app.id, app.name)}
                            className="bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Build Logs */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4"
                        >
                          <div className="bg-black/50 rounded-lg p-4 border border-white/10">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-semibold text-white flex items-center">
                                <Terminal className="w-4 h-4 mr-2" />
                                Build Logs {build && `(Build #${build.number})`}
                              </h4>
                              {build?.building && (
                                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                              )}
                            </div>
                            <pre className="text-xs text-white/80 font-mono overflow-x-auto max-h-96 overflow-y-auto">
                              {logs || 'Loading logs...'}
                            </pre>
                          </div>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <Card className="bg-white/5 border-white/10 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Code className="h-12 w-12 text-white/30 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Applications Deployed</h3>
              <p className="text-white/60 text-center mb-4 max-w-md">
                Deploy your first application from a Git repository to get started with our platform.
              </p>
              <Button asChild>
                <Link href="/dashboard/services/apps/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Deploy Your First App
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
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
    </div>
  );
};

export default ApplicationDeploymentPage;
