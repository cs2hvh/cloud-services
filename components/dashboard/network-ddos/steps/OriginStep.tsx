'use client';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronRight, Server } from "lucide-react";
import { StepProps } from "./types";
import { toast } from "sonner";

export const OriginStep = ({ formData, onUpdate, onNext, onBack }: StepProps) => {
  // Check if app type is SSH or RDP for simplified flow
  const isSSHorRDP = formData.appType === 'ssh' || formData.appType === 'rdp';
  
  const handleNext = () => {
    if (!formData.originType) {
      toast.error('Please select an origin type');
      return;
    }
    
    if (formData.originType === 'ip-dns') {
      if (!formData.originIP.trim()) {
        toast.error('Please enter an origin IP address');
        return;
      }
      
      // Basic IP validation
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
      if (!ipRegex.test(formData.originIP)) {
        toast.error('Please enter a valid IP address or DNS record');
        return;
      }
    }
    
    onNext();
  };

  const handleOriginTypeChange = (value: 'ip-dns' | 'load-balancer') => {
    onUpdate({ 
      originType: value,
     // originPort: formData.edgePort // Set origin port to edge port
    });
  };

  const handleIPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ originIP: e.target.value });
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ originPort: Number(e.target.value) });
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-white">Origin Configuration</CardTitle>
        <p className="text-sm text-white/60">
          Configure where your traffic should be routed
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={formData.originType}
          onValueChange={handleOriginTypeChange}
          className="space-y-4"
        >
          {/* IP/DNS Option */}
          <div>
            <RadioGroupItem
              value="ip-dns"
              id="ip-dns"
              className="peer sr-only"
            />
            <Label
              htmlFor="ip-dns"
              className="block bg-white/10 rounded-lg border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
            >
              <div className="flex items-start gap-3">
                <Server className="w-5 h-5 text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-white mb-1">
                    Origin IP or DNS Record
                  </div>
                  <p className="text-sm text-white/60">
                    You can designate an IP , DNS as your origin.
                  </p>
                </div>
              </div>
            </Label>

            {formData.originType === "ip-dns" && (
              <div className="mt-6 ml-8 space-y-6">
                {/* IP Address Field */}
                <div className="space-y-3">
                  <Label
                    htmlFor="origin-ip"
                    className="text-white font-medium text-sm"
                  >
                    IP Address or DNS Record
                  </Label>
                  <div className="space-y-1.5">
                    <Input
                      id="origin-ip"
                      value={formData.originIP}
                      onChange={handleIPChange}
                      type="text"
                      placeholder="192.168.1.100 or server.example.com"
                      className="bg-white/10 border-white/25 rounded-lg text-white placeholder:text-white/40 h-11 px-4 transition-colors duration-200 focus:bg-white/15 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 hover:bg-white/12"
                    />
                    <p className="text-xs text-white/50 mt-1">
                      Enter the IP address or DNS hostname of your origin server. Your service must be same transport protocol as the edge port.
                    </p>
                  </div>
                </div>

                {/* Port Field */}
                <div className="space-y-3">
                  <Label
                    htmlFor="origin-port"
                    className="text-white font-medium text-sm"
                  >
                    Port
                  </Label>
                  <div className="space-y-1.5">
                    <Input
                      id="origin-port"
                      value={formData.originPort||''}
                      onChange={handlePortChange}
                      min={1}
                      max={65535}
                      type="number"
                      disabled={isSSHorRDP}
                      className={`border-white/20 rounded-md text-white placeholder:text-white/50 ${
                        isSSHorRDP 
                          ? 'bg-white/5 cursor-not-allowed opacity-70' 
                          : 'bg-white/10'
                      }`}
                    />
                    <div className="flex items-center gap-2 text-xs text-white/50 mt-1">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      <span>
                        {isSSHorRDP
                          ? `Port is fixed to ${formData.originPort} for ${formData.appType?.toUpperCase()} and matches the edge port`
                          : `Enter the port number on your origin server (1-65535)`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Load Balancer Option */}
          {/* <div>
            <RadioGroupItem
              value="load-balancer"
              id="load-balancer"
              className="peer sr-only"
            />
            <Label
              htmlFor="load-balancer"
              className="block bg-white/10 rounded-lg border-2 border-transparent cursor-pointer p-4 transition-all peer-data-[state=checked]:border-blue-500 hover:bg-white/15"
            >
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-purple-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-white mb-1 flex items-center gap-2">
                    Load Balancer
                    <span className="text-xs text-white/50">
                      (None Configured)
                    </span>
                  </div>
                  <p className="text-sm text-white/60">
                    Distribute traffic across multiple origin servers
                  </p>
                </div>
              </div>
            </Label>

            {formData.originType === "load-balancer" && (
              <div className="mt-4 ml-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-400 mb-2">
                  <Cloud className="w-4 h-4" />
                  <span className="font-medium">Coming Soon</span>
                </div>
                <p className="text-sm text-white/60">
                  Load balancer integration is currently under development.
                  Please use IP/DNS origin for now.
                </p>
              </div>
            )}
          </div> */}
        </RadioGroup>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={formData.originType === "load-balancer"}
          className="cursor-pointer bg-white text-black rounded-md hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next <ChevronRight size={16} className="ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
};
