'use client';

import { motion } from "motion/react";
import { Shield, Plus, Search, Lock, Activity, CheckCircle, Server } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FirewallPage = () => {
  // No dummy data - will be replaced with actual firewall rules from backend
  const firewallRules: any[] = [];

  // Mock stats for demonstration
  const stats = {
    activeRules: 0,
    openPorts: 0,
    blockedIPs: 0,
    protectedServers: 0
  };

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Server Firewall Management</h1>
          <p className="text-white/60">Manage IP-based firewall rules for your virtual machines and dedicated servers.</p>
        </div>
        <Link
          href="/dashboard/services/firewall/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          Add Firewall Rule
        </Link>
      </motion.div>

      {/* About Server Firewall */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.05 }}
        className="mb-8"
      >
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-3">What is Server Firewall Management?</h2>
            <p className="text-white/70 leading-relaxed">
              Server Firewall Management allows you to control network access to your virtual machines and dedicated servers by configuring 
              IP-based firewall rules. You can open or close specific ports for particular IP addresses or IP ranges, ensuring only authorized 
              traffic reaches your servers. This includes managing SSH access (port 22), web traffic (ports 80/443), database connections, 
              and any custom application ports. The firewall acts as a network-level security barrier, filtering incoming and outgoing traffic 
              based on your configured rules.
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
                <p className="text-sm font-medium text-white/60">Active Rules</p>
                <p className="text-2xl font-bold text-white">{stats.activeRules}</p>
              </div>
              <Shield className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60">Open Ports</p>
                <p className="text-2xl font-bold text-white">{stats.openPorts}</p>
              </div>
              <Activity className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60">Blocked IPs</p>
                <p className="text-2xl font-bold text-white">{stats.blockedIPs}</p>
              </div>
              <Lock className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60">Protected Servers</p>
                <p className="text-2xl font-bold text-white">{stats.protectedServers}</p>
              </div>
              <Server className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Firewall Rules */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        {firewallRules.length > 0 ? (
          <div>
            {/* Search bar */}
            <div className="bg-white/5 p-4 rounded-lg mb-6 flex items-center justify-between">
              <div className="flex items-center w-full max-w-md">
                <Search className="w-5 h-5 text-white/50 mr-3"/>
                <input 
                  type="text" 
                  placeholder="Search firewall rules..." 
                  className="w-full bg-transparent focus:outline-none text-white placeholder-white/50"
                />
              </div>
            </div>
            
            {/* Firewall rules will be mapped here */}
            <div className="grid grid-cols-1 gap-4">
              {/* Firewall rules will be rendered here */}
            </div>
          </div>
        ) : (
          <Card className="bg-white/5 border-white/10 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="h-12 w-12 text-white/30 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Firewall Rules Configured</h3>
              <p className="text-white/60 text-center mb-4 max-w-md">
                Create your first firewall rule to control network access to your servers.
              </p>
              <Button asChild>
                <Link href="/dashboard/services/firewall/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Firewall Rule
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Firewall Features */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.3 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Firewall Management Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Shield className="h-5 w-5 mr-2 text-blue-400" />
                Port Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Open or close specific ports for your servers with granular control over network access.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• SSH access control (port 22)</li>
                <li>• Web traffic management (80/443)</li>
                <li>• Database port configuration</li>
                <li>• Custom application ports</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Activity className="h-5 w-5 mr-2 text-green-400" />
                IP-based Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Configure access rules for specific IP addresses or IP ranges with allow/deny policies.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• Single IP address rules</li>
                <li>• IP range (CIDR) support</li>
                <li>• Whitelist/blacklist management</li>
                <li>• Geographic IP blocking</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Server className="h-5 w-5 mr-2 text-purple-400" />
                Server Protection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">
                Protect both virtual machines and dedicated servers with unified firewall management.
              </CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                <li>• VPS firewall rules</li>
                <li>• Dedicated server protection</li>
                <li>• Real-time rule application</li>
                <li>• Rule templates for common setups</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Common Firewall Rules */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.4 }}
        className="mt-12"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Common Firewall Rules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">SSH Access</CardTitle>
              <CardDescription className="text-white/60">
                Secure shell access for server management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-white/70">
                <div><strong>Port:</strong> 22 (TCP)</div>
                <div><strong>Protocol:</strong> SSH</div>
                <div><strong>Common Use:</strong> Server administration</div>
                <div><strong>Security:</strong> Restrict to specific IPs</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Web Traffic</CardTitle>
              <CardDescription className="text-white/60">
                HTTP and HTTPS web server access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-white/70">
                <div><strong>Ports:</strong> 80 (HTTP), 443 (HTTPS)</div>
                <div><strong>Protocol:</strong> TCP</div>
                <div><strong>Common Use:</strong> Website hosting</div>
                <div><strong>Security:</strong> Usually open to all</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Database Access</CardTitle>
              <CardDescription className="text-white/60">
                Database server connections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-white/70">
                <div><strong>Ports:</strong> 3306 (MySQL), 5432 (PostgreSQL)</div>
                <div><strong>Protocol:</strong> TCP</div>
                <div><strong>Common Use:</strong> Database connections</div>
                <div><strong>Security:</strong> Restrict to application servers</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">FTP/SFTP</CardTitle>
              <CardDescription className="text-white/60">
                File transfer protocol access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-white/70">
                <div><strong>Ports:</strong> 21 (FTP), 22 (SFTP)</div>
                <div><strong>Protocol:</strong> TCP</div>
                <div><strong>Common Use:</strong> File uploads/downloads</div>
                <div><strong>Security:</strong> Use SFTP when possible</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Email Services</CardTitle>
              <CardDescription className="text-white/60">
                SMTP, POP3, and IMAP access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-white/70">
                <div><strong>Ports:</strong> 25, 587 (SMTP), 993 (IMAPS)</div>
                <div><strong>Protocol:</strong> TCP</div>
                <div><strong>Common Use:</strong> Email server</div>
                <div><strong>Security:</strong> Use encrypted versions</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Custom Applications</CardTitle>
              <CardDescription className="text-white/60">
                Application-specific port configurations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-white/70">
                <div><strong>Ports:</strong> Custom (e.g., 8080, 3000)</div>
                <div><strong>Protocol:</strong> TCP/UDP</div>
                <div><strong>Common Use:</strong> Web apps, APIs, games</div>
                <div><strong>Security:</strong> Configure as needed</div>
              </div>
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
        <h2 className="text-2xl font-bold text-white mb-6">How Server Firewall Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-400">1</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Select Server</h3>
              <p className="text-sm text-white/60">
                Choose the virtual machine or dedicated server to configure
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-green-400">2</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Configure Rules</h3>
              <p className="text-sm text-white/60">
                Set up port and IP-based access rules for your server
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-purple-400">3</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Apply Rules</h3>
              <p className="text-sm text-white/60">
                Rules are instantly applied to your server&apos;s network interface
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-orange-400">4</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Monitor Access</h3>
              <p className="text-sm text-white/60">
                Monitor and manage your firewall rules as needed
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
};

export default FirewallPage;
