'use client';

import { motion } from "motion/react";
import { Shield, Plus, Network, Globe, CheckCircle, Activity } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tables } from "@/lib/supabase/types";
import SpectrumAppsTable from "./spectrum-apps-table";
import { useMemo } from "react";

interface NetworkDDoSMainProps {
  spectrumApps: Tables<"spectrum_apps">[];
  userId: string;
}

const NetworkDDoSMain = ({ spectrumApps, userId }: NetworkDDoSMainProps) => {
  // Calculate stats from actual data - memoized to prevent recalculation on every render
  const stats = useMemo(() => ({
    totalApplications: spectrumApps.length,
    activeConnections: spectrumApps.filter(app => app.status === "created" || app.status === "updated").length,
    dataTransferred: "0 GB", // This would come from analytics
    uptime: "99.9%"
  }), [spectrumApps]);

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-neutral-800 rounded-lg">
                <Shield className="h-6 w-6 text-neutral-300" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">Network DDoS Protection</h1>
                <p className="text-sm text-neutral-400 mt-0.5">
                  Layer 4 reverse proxy with advanced DDoS protection for TCP/UDP applications
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/services/network-ddos/new"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Enable Protection
            </Link>
          </div>
        </motion.div>

        {/* About Layer 4 Reverse Proxy */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
            <h2 className="text-lg font-semibold text-white mb-2.5">What is Layer 4 Reverse Proxy?</h2>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Our Layer 4 reverse proxy operates at the transport layer, providing advanced DDoS protection and traffic optimization for your TCP and UDP applications. 
              Unlike traditional Layer 7 proxies that work with HTTP traffic, Layer 4 protection handles raw network packets, making it ideal for gaming servers, 
              databases, SSH connections, RDP sessions, and any custom TCP/UDP applications. The service acts as an intelligent gateway that filters malicious 
              traffic while ensuring legitimate connections reach your origin servers with minimal latency.
            </p>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-neutral-500">Protected Apps</p>
                <p className="text-2xl font-semibold text-white mt-1">{stats.totalApplications}</p>
              </div>
              <div className="p-2 bg-neutral-800 rounded-lg">
                <Network className="h-5 w-5 text-neutral-400" />
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-neutral-500">Active Connections</p>
                <p className="text-2xl font-semibold text-white mt-1">{stats.activeConnections}</p>
              </div>
              <div className="p-2 bg-neutral-800 rounded-lg">
                <Activity className="h-5 w-5 text-neutral-400" />
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-neutral-500">Data Protected</p>
                <p className="text-2xl font-semibold text-white mt-1">{stats.dataTransferred}</p>
              </div>
              <div className="p-2 bg-neutral-800 rounded-lg">
                <Shield className="h-5 w-5 text-neutral-400" />
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-neutral-500">Service Uptime</p>
                <p className="text-2xl font-semibold text-white mt-1">{stats.uptime}</p>
              </div>
              <div className="p-2 bg-neutral-800 rounded-lg">
                <CheckCircle className="h-5 w-5 text-neutral-400" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Protection Applications Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <SpectrumAppsTable spectrumApps={spectrumApps} userId={userId} />
        </motion.div>

        {/* Protection Features */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Layer 4 Protection Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-neutral-800 rounded">
                  <Shield className="h-4 w-4 text-neutral-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">Advanced DDoS Mitigation</h3>
              </div>
              <p className="text-xs text-neutral-400 mb-3">
                Comprehensive protection against volumetric, protocol, and application-layer attacks.
              </p>
              <ul className="space-y-1.5 text-xs text-neutral-500">
                <li>• TCP SYN flood protection</li>
                <li>• UDP amplification mitigation</li>
                <li>• Connection rate limiting</li>
                <li>• Packet inspection and filtering</li>
              </ul>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-neutral-800 rounded">
                  <Globe className="h-4 w-4 text-neutral-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">Global Anycast Network</h3>
              </div>
              <p className="text-xs text-neutral-400 mb-3">
                Distributed network infrastructure for optimal performance and reliability worldwide.
              </p>
              <ul className="space-y-1.5 text-xs text-neutral-500">
                <li>• 100+ global edge locations</li>
                <li>• Automatic failover</li>
                <li>• Reduced latency routing</li>
                <li>• Geographic load balancing</li>
              </ul>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-neutral-800 rounded">
                  <Network className="h-4 w-4 text-neutral-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">Protocol Optimization</h3>
              </div>
              <p className="text-xs text-neutral-400 mb-3">
                Intelligent traffic optimization for various protocols and application types.
              </p>
              <ul className="space-y-1.5 text-xs text-neutral-500">
                <li>• TCP connection optimization</li>
                <li>• UDP packet prioritization</li>
                <li>• Custom port configurations</li>
                <li>• Application-aware routing</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Protection Plans */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Protection Plans</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-white mb-1">Standard Protection</h3>
                <p className="text-xs text-neutral-400">
                  Essential Layer 4 DDoS protection for most applications
                </p>
              </div>
              <div className="mb-5">
                <span className="text-3xl font-bold text-white">$100</span>
                <span className="text-sm text-neutral-500">/month</span>
              </div>
              <ul className="space-y-2 text-xs text-neutral-400 mb-6">
                <li>• Up to 2 protected applications</li>
                <li>• 200 Tbps DDoS protection</li>
                <li>• 100+ global edge locations</li>
                <li>• TCP/UDP protocol support</li>
                <li>• Basic traffic analytics</li>
                <li>• 24/7 monitoring</li>
                <li>• Email alerts</li>
                <li>• Standard support</li>
              </ul>
              <Button className="w-full bg-neutral-800 hover:bg-neutral-700 text-white border-0">
                Get Started
              </Button>
            </div>

            <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 relative">
              <div className="absolute -top-2.5 left-1/2 transform -translate-x-1/2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-700 text-neutral-200 border border-neutral-600">
                  Enterprise
                </span>
              </div>
              <div className="mb-5 pt-2">
                <h3 className="text-base font-semibold text-white mb-1">Enterprise Protection</h3>
                <p className="text-xs text-neutral-400">
                  Advanced protection with global coverage and premium features
                </p>
              </div>
              <div className="mb-5">
                <span className="text-3xl font-bold text-white">$299</span>
                <span className="text-sm text-neutral-500">/month</span>
              </div>
              <ul className="space-y-2 text-xs text-neutral-400 mb-6">
                <li>• Unlimited protected applications</li>
                <li>• 200 Tbps DDoS protection</li>
                <li>• 250+ premium datacenters</li>
                <li>• Geographic blocking (Geo-block)</li>
                <li>• Application-specific filters:</li>
                <li className="ml-4">→ SSH brute-force protection</li>
                <li className="ml-4">→ RDP attack mitigation</li>
                <li className="ml-4">→ API rate limiting</li>
                <li className="ml-4">→ Game server optimization</li>
                <li className="ml-4">→ Database connection filtering</li>
                <li>• Advanced threat intelligence</li>
                <li>• Custom security rules</li>
                <li>• Real-time analytics dashboard</li>
                <li>• Priority support & SLA</li>
              </ul>
              <Button className="w-full bg-neutral-800 hover:bg-neutral-700 text-white border-0">
                Contact Sales
              </Button>
            </div>
          </div>
        </motion.div>

        {/* How It Works */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.5 }}
          className="mt-8 mb-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">How Layer 4 Protection Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
              <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-semibold text-neutral-300">1</span>
              </div>
              <h3 className="text-sm font-medium text-white mb-2">Configure Application</h3>
              <p className="text-xs text-neutral-500">
                Set up your TCP/UDP application with origin IP and port ranges
              </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
              <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-semibold text-neutral-300">2</span>
              </div>
              <h3 className="text-sm font-medium text-white mb-2">Route Traffic</h3>
              <p className="text-xs text-neutral-500">
                Direct your clients to our protected anycast IP addresses
              </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
              <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-semibold text-neutral-300">3</span>
              </div>
              <h3 className="text-sm font-medium text-white mb-2">Filter & Protect</h3>
              <p className="text-xs text-neutral-500">
                Malicious traffic is filtered while legitimate connections pass through
              </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
              <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-lg font-semibold text-neutral-300">4</span>
              </div>
              <h3 className="text-sm font-medium text-white mb-2">Monitor & Analyze</h3>
              <p className="text-xs text-neutral-500">
                Real-time monitoring with detailed analytics and threat insights
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default NetworkDDoSMain;
