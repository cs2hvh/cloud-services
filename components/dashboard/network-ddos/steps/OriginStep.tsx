'use client';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronRight, Server, ShieldCheck } from "lucide-react";
import { StepProps } from "./types";
import { toast } from "sonner";

export const OriginStep = ({ formData, onUpdate, onNext, onBack }: StepProps) => {
  const isSSHorRDP = formData.appType === "ssh" || formData.appType === "rdp";

  const handleNext = () => {
    if (!formData.originType) {
      toast.error("Please select an origin type");
      return;
    }

    if (formData.originType === "ip-dns") {
      if (!formData.originIP.trim()) {
        toast.error("Please enter an origin IP address");
        return;
      }

      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
      if (!ipRegex.test(formData.originIP)) {
        toast.error("Please enter a valid IP address or DNS record");
        return;
      }
    }

    onNext();
  };

  const handleOriginTypeChange = (value: "ip-dns" | "load-balancer") => {
    onUpdate({ originType: value });
  };

  const handleIPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ originIP: e.target.value });
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const portValue = parseInt(e.target.value);
    if (isNaN(portValue)) {
      onUpdate({ originPort: 0 });
      return;
    }
    if (portValue < 0 || portValue > 65535) {
      toast.error("Please enter a valid port number (1-65535)");
      return;
    }
    onUpdate({ originPort: Number(e.target.value) });
  };

  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
            Traffic Routing
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight text-white">
            Origin Configuration
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
        <RadioGroup
          value={formData.originType}
          onValueChange={handleOriginTypeChange}
          className="space-y-4"
        >
          <div className="border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))]">
            <RadioGroupItem value="ip-dns" id="ip-dns" className="peer sr-only" />
            <Label
              htmlFor="ip-dns"
              className="block cursor-pointer border border-transparent px-4 py-4 transition-colors peer-data-[state=checked]:border-blue-400/30 peer-data-[state=checked]:bg-blue-500/8 hover:bg-white/[0.03] sm:px-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <Server className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-white">Origin IP or DNS record</div>
                    <span className="border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-white/45">
                      Standard
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/55">
                    Route traffic directly to a single IP address or hostname behind your protected endpoint.
                  </p>
                </div>
              </div>
            </Label>

            {formData.originType === "ip-dns" && (
              <div className="border-t border-white/[0.06] px-4 py-5 sm:px-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-5">
                    <div className="space-y-2.5">
                      <Label htmlFor="origin-ip" className="text-sm font-medium text-white">
                        IP address or DNS record
                      </Label>
                      <Input
                        id="origin-ip"
                        value={formData.originIP}
                        onChange={handleIPChange}
                        type="text"
                        placeholder="192.168.1.100 or server.example.com"
                        className="h-11 border-white/[0.12] bg-white/[0.04] text-white placeholder:text-white/34 focus:border-blue-400/40 focus:ring-0"
                      />
                      <p className="text-xs leading-5 text-white/42">
                        Use a reachable private or public origin hostname. The transport protocol must match the selected edge listener.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="origin-port" className="text-sm font-medium text-white">
                        Origin port
                      </Label>
                      <Input
                        id="origin-port"
                        value={formData.originPort || ""}
                        onChange={handlePortChange}
                        min={1}
                        max={65535}
                        type="number"
                        disabled={isSSHorRDP}
                        placeholder="443"
                        className={`h-11 border-white/[0.12] text-white placeholder:text-white/34 focus:border-blue-400/40 focus:ring-0 ${
                          isSSHorRDP ? "cursor-not-allowed bg-white/[0.025] opacity-75" : "bg-white/[0.04]"
                        }`}
                      />
                      <p className="text-xs leading-5 text-white/42">
                        {isSSHorRDP
                          ? `Locked to ${formData.originPort} so the origin matches the ${formData.appType?.toUpperCase()} service profile.`
                          : "Specify the port exposed by your origin server or upstream listener."}
                      </p>
                    </div>
                  </div>

                  <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <ShieldCheck className="h-4 w-4 text-blue-300" />
                      Routing guidance
                    </div>
                    <div className="mt-3 space-y-3 text-xs leading-5 text-white/46">
                      <p>Point this to the service that should receive production traffic from Spectrum.</p>
                      <p>For hostnames, ensure DNS resolves consistently and accepts connections from Cloudflare edge IPs.</p>
                      <p>Keep the origin port aligned with the application protocol exposed at the edge.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </RadioGroup>
      </CardContent>

      <CardFooter className="flex justify-between border-t border-white/[0.06] px-5 py-4 sm:px-6">
        <Button
          variant="outline"
          onClick={onBack}
          className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={formData.originType === "load-balancer"}
          className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next <ChevronRight size={16} className="ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
};
