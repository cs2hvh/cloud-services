import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, Plus, Search } from "lucide-react";
import Link from "next/link";

export default function VPSPage() {
  // No dummy data - will be replaced with actual VPS instances from backend
  const vpsInstances: any[] = [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Virtual Private Servers</h1>
          <p className="text-slate-400 mt-2">
            Scalable virtualized servers with flexible resource allocation
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/services/compute/vps/new">
            <Plus className="h-4 w-4 mr-2" />
            Create New VPS
          </Link>
        </Button>
      </div>

      {/* VPS Instances */}
      <div className="space-y-4">
        {vpsInstances.length > 0 ? (
          <div>
            {/* Search bar */}
            <div className="bg-slate-900/50 p-4 rounded-lg mb-6 flex items-center justify-between">
              <div className="flex items-center w-full max-w-md">
                <Search className="w-5 h-5 text-slate-400 mr-3" />
                <input
                  type="text"
                  placeholder="Search VPS instances..."
                  className="w-full bg-transparent focus:outline-none text-white placeholder-slate-400"
                />
              </div>
            </div>

            {/* VPS instances will be mapped here */}
            <div className="grid grid-cols-1 gap-4">
              {/* VPS instances will be rendered here */}
            </div>
          </div>
        ) : (
          <Card className="bg-slate-900/30 border-slate-800 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Server className="h-12 w-12 text-slate-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No VPS Instances</h3>
              <p className="text-slate-400 text-center mb-4">
                Create your first VPS instance to get started with scalable virtual servers.
              </p>
              <Button asChild>
                <Link href="/dashboard/services/compute/vps/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First VPS
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
