'use client';

// import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Server, Network, Users, Database, Bot, Activity, Globe, Cpu, DollarSign, Building2, Boxes } from 'lucide-react';

export default function AdminDashboard({ checkAdmin }: { checkAdmin: boolean }) {
//   const [isAdmin, setIsAdmin] = useState(false);
//   const [isCheckingAuth, setIsCheckingAuth] = useState(true);

//   useEffect(() => {
//     const checkAdmin = async () => {
//       try {
//         // Try to fetch from admin endpoint to check if user is admin
//         const res = await fetch('/api/admin/proxmox/hosts', {
//           cache: 'no-store',
//         });
//         setIsAdmin(res.ok);
//       } catch {
//         setIsAdmin(false);
//       } finally {
//         setIsCheckingAuth(false);
//       }
//     };

//     checkAdmin();
//   }, []);

  // const getAccessToken = async () => {
  //   // In a real app, this would get the auth token from session/context
  //   // For now, the API will use the session directly
  //   return null;
  // };

//   if (checkAdmin) {
//     return (
//       <div className="min-h-screen bg-black p-6 sm:p-8">
//         <div className="max-w-7xl mx-auto">
//           <div className="text-white/60">Checking permissions...</div>
//         </div>
//       </div>
//     );
//   }

  if (checkAdmin===false) {
    return (
      <div className="min-h-screen bg-black p-6 sm:p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-white/60">You do not have permission to access the admin panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-white/60">Platform administration and management</p>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/hosts" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Network className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Proxmox Hosts</h3>
                  <p className="text-white/60 text-sm mt-1">Configure infrastructure</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/servers" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <Server className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">All Servers</h3>
                  <p className="text-white/60 text-sm mt-1">Manage VPS instances</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/users" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <Users className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Users</h3>
                  <p className="text-white/60 text-sm mt-1">Manage user accounts</p>
                </div>
              </div>
            </a>
          </Card>
           <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/databases" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <Database className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Databases</h3>
                  <p className="text-white/60 text-sm mt-1">Manage database instances</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/ai-agents" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-cyan-500/10 rounded-lg">
                  <Bot className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">AI Agents</h3>
                  <p className="text-white/60 text-sm mt-1">Manage platform models & pricing</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/inference-overview" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <Activity className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">AI Overview</h3>
                  <p className="text-white/60 text-sm mt-1">What is used & what needs attention</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/inference-jobs" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-amber-500/10 rounded-lg">
                  <Boxes className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">AI Jobs</h3>
                  <p className="text-white/60 text-sm mt-1">Per-job view, with retry & cancel</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/inference-orgs" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Inference Orgs</h3>
                  <p className="text-white/60 text-sm mt-1">Customers, keys & spend limits</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/inference-agents" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <Bot className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Inference Agents</h3>
                  <p className="text-white/60 text-sm mt-1">Runs, tools, sandboxes & MCP health</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/inference-pricing" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-emerald-500/10 rounded-lg">
                  <DollarSign className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">AI Model Pricing</h3>
                  <p className="text-white/60 text-sm mt-1">Price vs upstream cost & margin</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/inference-workers" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-cyan-500/10 rounded-lg">
                  <Boxes className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Worker Fleet</h3>
                  <p className="text-white/60 text-sm mt-1">Runner health, queues & stuck jobs</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/inference-rag" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-indigo-500/10 rounded-lg">
                  <Database className="h-6 w-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Vector Storage</h3>
                  <p className="text-white/60 text-sm mt-1">Collections, connectors & quota</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/inference-traces" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-amber-500/10 rounded-lg">
                  <Activity className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Observability</h3>
                  <p className="text-white/60 text-sm mt-1">Latency, failures & guardrail outcomes</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/gpu" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-orange-500/10 rounded-lg">
                  <Cpu className="h-6 w-6 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">GPU Stock</h3>
                  <p className="text-white/60 text-sm mt-1">Enable / disable GPU deployments</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/cluster-monitor" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-emerald-500/10 rounded-lg">
                  <Activity className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Cluster Monitor</h3>
                  <p className="text-white/60 text-sm mt-1">Deployments, events & node health</p>
                </div>
              </div>
            </a>
          </Card>

          <Card className="bg-black/50 border-white/10 hover:border-white/20 transition-colors">
            <a href="/dashboard/admin/domains" className="block p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-sky-500/10 rounded-lg">
                  <Globe className="h-6 w-6 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Domains</h3>
                  <p className="text-white/60 text-sm mt-1">Purchases, transfers & registrations</p>
                </div>
              </div>
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}
