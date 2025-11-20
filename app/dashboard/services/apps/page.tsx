'use client';

import { motion } from "motion/react";
import { Code, Plus, Search, GitBranch, Globe } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

const ApplicationDeploymentPage = () => {
  // No dummy data - will be replaced with actual deployed applications from backend
  const deployedApps = [];

  // Mock stats for demonstration
  const stats = {
    totalApps: 0,
    activeDeployments: 0,
    totalBuilds: 0,
    successRate: "100%"
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
        {deployedApps.length > 0 ? (
          <div>
            {/* Search bar */}
            <div className="bg-white/5 p-4 rounded-lg mb-6 flex items-center justify-between">
              <div className="flex items-center w-full max-w-md">
                <Search className="w-5 h-5 text-white/50 mr-3"/>
                <input 
                  type="text" 
                  placeholder="Search deployed applications..." 
                  className="w-full bg-transparent focus:outline-none text-white placeholder-white/50"
                />
              </div>
            </div>
            
            {/* Deployed applications will be mapped here */}
            <div className="grid grid-cols-1 gap-4">
              {/* Applications will be rendered here */}
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
