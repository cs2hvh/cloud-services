import { Card, CardContent } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
import { HardDrive } from "lucide-react";

export default function BareMetalPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Bare Metal Servers</h1>
          <p className="text-slate-400 mt-2">
            High-performance dedicated servers with full hardware control
          </p>
        </div>
      </div>

      {/* Coming Soon */}
      <Card className="bg-slate-900/30 border-slate-800 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <HardDrive className="h-12 w-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Coming Soon</h3>
          <p className="text-slate-400 text-center mb-4">
            Bare metal server provisioning will be available soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
