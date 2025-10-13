'use client';

import { motion } from "motion/react";
import { Shield, Plus, Search, Network, Globe, CheckCircle } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const NetworkDDoSPage = () => {
  // No dummy data - will be replaced with actual protection applications from backend
  const protectionApplications = [];

  // Mock stats for demonstration
  const stats = {
    totalApplications: 0,
    activeConnections: 0,
    dataTransferred: "0 GB",
    uptime: "99.9%"
  };

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Network DDoS Protection</h1>
          <p className="text-white/60">Layer 4 reverse proxy with advanced DDoS protection for your TCP/UDP applications.</p>
        </div>
        <Link
          href="/dashboard/services/network-ddos/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          Enable Protection
        </Link>
      </motion.div>

      {/* About Layer 4 Reverse Proxy */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.05 }}
        className="mb-8"
      >
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-3">What is Layer 4 Reverse Proxy?</h2>
            <p className="text-white/70 leading-relaxed">
              Our Layer 4 reverse proxy operates at the transport layer, providing advanced DDoS protection and traffic optimization for your TCP and UDP applications. 
              Unlike traditional Layer 7 proxies that work with HTTP traffic, Layer 4 protection handles raw network packets, making it ideal for gaming servers, 
              databases, SSH connections, RDP sessions, and any custom TCP/UDP applications. The service acts as an intelligent gateway that filters malicious 
              traffic while ensuring legitimate connections reach your origin servers with minimal latency.
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
                <p className="text-sm font-medium text-white/60">Protected Applications</p>
                <p className="text-2xl font-bold text-white">{stats.totalApplications}</p>
              </div>
              <Network className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60">Active Connections</p>
                <p className="text-2xl font-bold text-white">{stats.activeConnections}</p>
              </div>
              <Globe className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60">Data Protected</p>
                <p className="text-2xl font-bold text-white">{stats.dataTransferred}</p>
              </div>
              <Shield className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60">Service Uptime</p>
                <p className="text-2xl font-bold text-white">{stats.uptime}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Protection Applications */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        {protectionApplications.length > 0 ? (
          <div>
            {/* Search bar */}
            <div className="bg-white/5 p-4 rounded-lg mb-6 flex items-center justify-between">
              <div className="flex items-center w-full max-w-md">
                <Search className="w-5 h-5 text-white/50 mr-3"/>
                <input 
                  type="text" 
                  placeholder="Search protected applications..." 
                  className="w-full bg-transparent focus:outline-none text-white placeholder-white/50"
                />
              </div>
            </div>
            
            {/* Protection applications will be mapped here */}
            <div className="grid grid-cols-1 gap-4">
              {/* Protection applications will be rendered here */}
            </div>
          </div>
        ) : (
          <Card className="bg-white/5 border-white/10 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Network className="h-12 w-12 text-white/30 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Protected Applications</h3>
              <p className="text-white/60 text-center mb-4 max-w-md">
                Configure your first Layer 4 reverse proxy to protect and optimize your TCP/UDP applications.
              </p>
              <Button asChild>
                <Link href="/dashboard/services/network-ddos/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Enable Protection
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Protection Features */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.3 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Layer 4 Protection Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Shield className="h-5 w-5 mr-2 text-blue-400" />
                Advanced DDoS Mitigation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Comprehensive protection against volumetric, protocol, and application-layer attacks.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• TCP SYN flood protection</li>
                <li>• UDP amplification mitigation</li>
                <li>• Connection rate limiting</li>
                <li>• Packet inspection and filtering</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Globe className="h-5 w-5 mr-2 text-green-400" />
                Global Anycast Network
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Distributed network infrastructure for optimal performance and reliability worldwide.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• 100+ global edge locations</li>
                <li>• Automatic failover</li>
                <li>• Reduced latency routing</li>
                <li>• Geographic load balancing</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Network className="h-5 w-5 mr-2 text-purple-400" />
                Protocol Optimization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Intelligent traffic optimization for various protocols and application types.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• TCP connection optimization</li>
                <li>• UDP packet prioritization</li>
                <li>• Custom port configurations</li>
                <li>• Application-aware routing</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Protection Plans */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.4 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Protection Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Standard Protection</CardTitle>
              <CardDescription className="text-white/60">
                Essential Layer 4 DDoS protection for most applications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-white mb-6">
                $100<span className="text-lg font-normal text-white/60">/month</span>
              </div>
              <ul className="space-y-3 text-sm text-white/70">
                <li>• Up to 2 protected applications</li>
                <li>• 200 Tbps DDoS protection</li>
                <li>• 100+ global edge locations</li>
                <li>• TCP/UDP protocol support</li>
                <li>• Basic traffic analytics</li>
                <li>• 24/7 monitoring</li>
                <li>• Email alerts</li>
                <li>• Standard support</li>
              </ul>
              <Button className="w-full mt-8 bg-white text-black hover:bg-gray-200">
                Get Started
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 relative">
            <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white">
              Enterprise
            </Badge>
            <CardHeader>
              <CardTitle className="text-white">Enterprise Protection</CardTitle>
              <CardDescription className="text-white/60">
                Advanced protection with global coverage and premium features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-white mb-6">
                $299<span className="text-lg font-normal text-white/60">/month</span>
              </div>
              <ul className="space-y-3 text-sm text-white/70">
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
              <Button className="w-full mt-8 bg-white text-black hover:bg-gray-200">
                Contact Sales
              </Button>
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
        <h2 className="text-2xl font-bold text-white mb-6">How Layer 4 Protection Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-400">1</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Configure Application</h3>
              <p className="text-sm text-white/60">
                Set up your TCP/UDP application with origin IP and port ranges
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-green-400">2</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Route Traffic</h3>
              <p className="text-sm text-white/60">
                Direct your clients to our protected anycast IP addresses
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-purple-400">3</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Filter & Protect</h3>
              <p className="text-sm text-white/60">
                Malicious traffic is filtered while legitimate connections pass through
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-orange-400">4</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Monitor & Analyze</h3>
              <p className="text-sm text-white/60">
                Real-time monitoring with detailed analytics and threat insights
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
};

export default NetworkDDoSPage;
