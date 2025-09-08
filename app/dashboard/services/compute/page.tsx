import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HardDrive, Server, Plus } from "lucide-react";

export default function ComputePage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Compute Services</h1>
          <p className="text-slate-400 mt-2">
            Deploy and manage your compute infrastructure
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bare Metal Servers */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <HardDrive className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-white">Bare Metal Servers</CardTitle>
                <CardDescription>
                  High-performance dedicated servers with full hardware control
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-300">
              <ul className="space-y-1">
                <li>• Dedicated hardware resources</li>
                <li>• No virtualization overhead</li>
                <li>• Full root access</li>
                <li>• Custom OS installation</li>
              </ul>
            </div>
            <div className="flex space-x-2">
              <Button asChild className="flex-1">
                <Link href="/dashboard/services/compute/bare-metal">
                  <Plus className="h-4 w-4 mr-2" />
                  Deploy Bare Metal
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Virtual Private Servers */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Server className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <CardTitle className="text-white">Virtual Private Servers</CardTitle>
                <CardDescription>
                  Scalable virtualized servers with flexible resource allocation
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-300">
              <ul className="space-y-1">
                <li>• Instant deployment</li>
                <li>• Scalable resources</li>
                <li>• Multiple OS options</li>
                <li>• Cost-effective solution</li>
              </ul>
            </div>
            <div className="flex space-x-2">
              <Button asChild className="flex-1">
                <Link href="/dashboard/services/compute/vps">
                  <Plus className="h-4 w-4 mr-2" />
                  Deploy VPS
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/30 border-slate-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-sm text-slate-400">Active Servers</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/30 border-slate-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-sm text-slate-400">Total CPU Cores</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/30 border-slate-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">0 GB</div>
            <div className="text-sm text-slate-400">Total RAM</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/30 border-slate-800">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">0 TB</div>
            <div className="text-sm text-slate-400">Total Storage</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
