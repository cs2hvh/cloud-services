// 'use client';

// import { motion } from "motion/react";
// import { Box, Clock, Bell, Layers } from "lucide-react";
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";

// const KubernetesPage = () => {
//   return (
//     <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
//       <motion.div 
//         initial={{ opacity: 0, y: -20 }}
//         animate={{ opacity: 1, y: 0 }}
//         className="flex justify-between items-center mb-8"
//       >
//         <div>
//           <h1 className="text-3xl font-bold">Kubernetes</h1>
//           <p className="text-white/60">Managed Kubernetes clusters for container orchestration and microservices deployment.</p>
//         </div>
//       </motion.div>

//       {/* Under Development Card */}
//       <motion.div 
//         initial={{ opacity: 0, y: 20 }} 
//         animate={{ opacity: 1, y: 0 }} 
//         transition={{ delay: 0.1 }}
//         className="max-w-2xl mx-auto"
//       >
//         <Card className="bg-white/5 border-white/10 text-center">
//           <CardContent className="py-16">
//             <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
//               <Box className="h-10 w-10 text-blue-400" />
//             </div>
            
//             <h2 className="text-2xl font-bold text-white mb-4">Under Development</h2>
            
//             <p className="text-white/60 mb-8 max-w-md mx-auto leading-relaxed">
//               We&apos;re actively developing a comprehensive Kubernetes platform to help you deploy, 
//               manage, and scale containerized applications with ease. Our managed K8s service will provide 
//               enterprise-grade orchestration capabilities.
//             </p>

//             <div className="flex items-center justify-center gap-2 text-white/50 mb-8">
//               <Clock className="h-4 w-4" />
//               <span className="text-sm"></span>
//             </div>

//             <div className="space-y-4">
//               <h3 className="text-lg font-semibold text-white">What&apos;s Coming:</h3>
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-white/70">
//                 <div className="text-left">
//                   <ul className="space-y-2">
//                     <li>• Managed K8s clusters</li>
//                     <li>• Auto-scaling capabilities</li>
//                     <li>• Helm chart repository</li>
//                     <li>• CI/CD integration</li>
//                   </ul>
//                 </div>
//                 <div className="text-left">
//                   <ul className="space-y-2">
//                     <li>• Multi-zone deployment</li>
//                     <li>• Load balancer integration</li>
//                     <li>• Monitoring & logging</li>
//                     <li>• Security policies</li>
//                   </ul>
//                 </div>
//               </div>
//             </div>

//             <div className="mt-8">
//               <Button 
//                 className="bg-white text-black hover:bg-gray-200"
//                 onClick={() => {
//                   // You can implement a notification signup here
//                   alert('We\'ll notify you when Kubernetes is available!');
//                 }}
//               >
//                 <Bell className="h-4 w-4 mr-2" />
//                 Notify Me When Available
//               </Button>
//             </div>
//           </CardContent>
//         </Card>
//       </motion.div>

//       {/* Feature Preview */}
//       <motion.div 
//         initial={{ opacity: 0, y: 20 }} 
//         animate={{ opacity: 1, y: 0 }} 
//         transition={{ delay: 0.3 }}
//         className="mt-12"
//       >
//         <h2 className="text-2xl font-bold text-white mb-6 text-center">Planned Kubernetes Features</h2>
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//           <Card className="bg-white/5 border-white/10">
//             <CardHeader>
//               <CardTitle className="text-white">Managed Clusters</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <CardDescription className="text-white/60">
//                 Fully managed Kubernetes clusters with automatic updates, patching, and maintenance handled for you.
//               </CardDescription>
//             </CardContent>
//           </Card>

//           <Card className="bg-white/5 border-white/10">
//             <CardHeader>
//               <CardTitle className="text-white">Auto-scaling</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <CardDescription className="text-white/60">
//                 Horizontal and vertical pod auto-scaling based on CPU, memory, and custom metrics to handle traffic spikes.
//               </CardDescription>
//             </CardContent>
//           </Card>

//           <Card className="bg-white/5 border-white/10">
//             <CardHeader>
//               <CardTitle className="text-white">Enterprise Security</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <CardDescription className="text-white/60">
//                 Built-in security policies, RBAC, network policies, and compliance features for enterprise workloads.
//               </CardDescription>
//             </CardContent>
//           </Card>

//           <Card className="bg-white/5 border-white/10">
//             <CardHeader>
//               <CardTitle className="text-white">CI/CD Integration</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <CardDescription className="text-white/60">
//                 Seamless integration with popular CI/CD tools for automated deployment pipelines and GitOps workflows.
//               </CardDescription>
//             </CardContent>
//           </Card>

//           <Card className="bg-white/5 border-white/10">
//             <CardHeader>
//               <CardTitle className="text-white">Monitoring & Logging</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <CardDescription className="text-white/60">
//                 Comprehensive monitoring, logging, and observability tools with Prometheus, Grafana, and centralized logging.
//               </CardDescription>
//             </CardContent>
//           </Card>

//           <Card className="bg-white/5 border-white/10">
//             <CardHeader>
//               <CardTitle className="text-white">Multi-zone Deployment</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <CardDescription className="text-white/60">
//                 Deploy across multiple availability zones for high availability and disaster recovery capabilities.
//               </CardDescription>
//             </CardContent>
//           </Card>
//         </div>
//       </motion.div>
//     </div>
//   );
// };

// export default KubernetesPage;




'use client';

import { motion } from "motion/react";
import { DockIcon, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import fs from "node:fs/promises";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";



type Cluster = {
  id: string;
  cluster_name: string;
  cluster_id: string;
  status: string;
  workers: Array<any>;
  created_at: string; // ISO
  k8s_version: string;
  kubeconfig: string;
};

const KubernetesPage = () => {
  // Dummy data for now, replace with actual data from your backend
  const [clusters, setClusters] = useState([] as Cluster[]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const downloadKubeconfig = async (clusterId: string, kubeconfig: string) => {
    const res = await fetch("/api/services/kubernetes/clusters/downloadkube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kubeconfig: kubeconfig }),
    });
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([data.data], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${clusterId}.txt`;
      a.click();
    }

    // console.log(await res.json(),".............res from download api...........");
  };

  useEffect(() => {
    //fetch clusters from backend.
    async function fetchClusters() {
      try {
        //debugger;
        setLoading(true);
        const res = await fetch("/api/services/kubernetes/clusters/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          const response = await res.json();
          console.log(
            response,
            ".............response from clusters read api..........."
          );
          if (response.success) {
            //set clusters
            setClusters(
              response.data.filter((item: Cluster) => item.status === "ready")
            );
          }
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchClusters();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Kubernetes</h1>
          <p className="text-white/60">
            Manage and provision your Kubernetes clusters.
          </p>
        </div>
        <Link
          href="/dashboard/services/kubernetes/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          New Kubernetes
        </Link>
      </motion.div>

      {clusters.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <Th>Cluster</Th>
                <Th>Nodes</Th>
                <Th>Created</Th>
                <Th>Version</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clusters.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <Td>
                    <div className="font-medium text-slate-900">
                      {c.cluster_name}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {c.id}
                    </div>
                  </Td>
                  <Td>{c.workers?.length}</Td>
                  <Td>
                    <time dateTime={c.created_at}>
                      {new Date(c.created_at).toLocaleString()}
                    </time>
                  </Td>
                  <Td>{c.k8s_version}</Td>
                  <Td>{c.status}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <a
                        onClick={() => {
                          downloadKubeconfig(c.cluster_id, c.kubeconfig);
                        }}
                        //href={`/api/clusters/${encodeURIComponent(c.cluster_id)}/kubeconfig`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                        // download
                      >
                        Download kubeconfig
                      </a>
                      <Link
                        href={{
                          pathname: `/dashboard/services/kubernetes/clusters/${encodeURIComponent(c.cluster_id)}`,
                          query: { clusterStatus: c.status },
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        View Cluster
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center py-20 border-2 border-dashed border-white/10 rounded-lg"
        >
          <DockIcon className="mx-auto h-16 w-16 text-white/20" />
          <h3 className="mt-4 text-xl font-semibold">No Kubernetes Found</h3>
          <p className="mt-2 text-sm text-white/50">
            Get started by provisioning a new Kubernetes cluster.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard/services/Kubernetes/new"
              className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Create Cluster
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600"
    >
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-6 py-4 text-sm text-slate-800 align-middle">
      {children}
    </td>
  );
}












export default KubernetesPage;
















