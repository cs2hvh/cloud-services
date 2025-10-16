'use client';

import { motion } from "motion/react";
import { Box, Clock, Bell, Layers } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const KubernetesPage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Kubernetes</h1>
          <p className="text-white/60">Managed Kubernetes clusters for container orchestration and microservices deployment.</p>
        </div>
      </motion.div>

      {/* Under Development Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.1 }}
        className="max-w-2xl mx-auto"
      >
        <Card className="bg-white/5 border-white/10 text-center">
          <CardContent className="py-16">
            <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Box className="h-10 w-10 text-blue-400" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-4">Under Development</h2>
            
            <p className="text-white/60 mb-8 max-w-md mx-auto leading-relaxed">
              We&apos;re actively developing a comprehensive Kubernetes platform to help you deploy, 
              manage, and scale containerized applications with ease. Our managed K8s service will provide 
              enterprise-grade orchestration capabilities.
            </p>

            <div className="flex items-center justify-center gap-2 text-white/50 mb-8">
              <Clock className="h-4 w-4" />
              <span className="text-sm"></span>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">What&apos;s Coming:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-white/70">
                <div className="text-left">
                  <ul className="space-y-2">
                    <li>• Managed K8s clusters</li>
                    <li>• Auto-scaling capabilities</li>
                    <li>• Helm chart repository</li>
                    <li>• CI/CD integration</li>
                  </ul>
                </div>
                <div className="text-left">
                  <ul className="space-y-2">
                    <li>• Multi-zone deployment</li>
                    <li>• Load balancer integration</li>
                    <li>• Monitoring & logging</li>
                    <li>• Security policies</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Button 
                className="bg-white text-black hover:bg-gray-200"
                onClick={() => {
                  // You can implement a notification signup here
                  alert('We\'ll notify you when Kubernetes is available!');
                }}
              >
                <Bell className="h-4 w-4 mr-2" />
                Notify Me When Available
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Feature Preview */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.3 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Planned Kubernetes Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Managed Clusters</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Fully managed Kubernetes clusters with automatic updates, patching, and maintenance handled for you.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Auto-scaling</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Horizontal and vertical pod auto-scaling based on CPU, memory, and custom metrics to handle traffic spikes.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Enterprise Security</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Built-in security policies, RBAC, network policies, and compliance features for enterprise workloads.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">CI/CD Integration</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Seamless integration with popular CI/CD tools for automated deployment pipelines and GitOps workflows.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Monitoring & Logging</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Comprehensive monitoring, logging, and observability tools with Prometheus, Grafana, and centralized logging.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Multi-zone Deployment</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Deploy across multiple availability zones for high availability and disaster recovery capabilities.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
};

export default KubernetesPage;
