"use client";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shield, Network, Key, ChevronRight } from "lucide-react";
import { StepProps } from "./types";

interface SettingsStepProps extends StepProps {
  onSubmit: () => void;
  isLoading: boolean;
}

export const SettingsStep = ({
  formData,
  onUpdate,
  onBack,
  onNext,
  isLoading,
}: SettingsStepProps) => {
  const [paidFeatureDialogOpen, setPaidFeatureDialogOpen] = useState(false);

  const handleIPAccessRuleClick = (checked: boolean) => {
    if (checked) {
      setPaidFeatureDialogOpen(true);
      return;
    }

    onUpdate({ ipAccessRule: false });
  };

  const proxyOptions =
    formData.appType === "udp"
      ? [
          { value: "off", label: "Off" },
          { value: "simple", label: "Simple" },
          { value: "v2", label: "V2" },
        ]
      : [
          { value: "off", label: "Off" },
          { value: "v1", label: "V1" },
          { value: "v2", label: "V2" },
        ];

  return (
    <>
      <Card className="glass-panel overflow-hidden">
        <CardHeader className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">
                Security Controls
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <Key className="h-4.5 w-4.5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold tracking-tight text-white">
                    Advanced Settings
                  </CardTitle>
                  <p className="mt-1 text-sm leading-6 text-white/55">
                    Configure optional connection controls and edge-to-origin metadata handling for this Spectrum application.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Access Rules
                </div>
                <div className="mt-1.5 text-base font-semibold text-white">
                  {formData.ipAccessRule ? "Enabled" : "Standard access"}
                </div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Proxy Protocol
                </div>
                <div className="mt-1.5 text-base font-semibold uppercase text-white">
                  {formData.proxyProtocol || "Off"}
                </div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-3 sm:col-span-2 xl:col-span-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Supported Modes
                </div>
                <div className="mt-1.5 text-sm font-medium text-white/78">
                  {formData.appType === "udp" ? "UDP supports Off, Simple, and V2." : "TCP supports Off, V1, and V2."}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <div className="border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <Shield className="h-4.5 w-4.5" />
                </div>
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="ip-access-rule" className="cursor-pointer text-sm font-semibold text-white">
                      IP Access Rules
                    </Label>
                    <span className="border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-300/85">
                      Paid Feature
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-white/55">
                    Restrict traffic based on source IP policies when you need a stricter ingress posture for protected services.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 lg:pt-1">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-white/40">
                  {formData.ipAccessRule ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  id="ip-access-rule"
                  checked={formData.ipAccessRule}
                  onCheckedChange={handleIPAccessRuleClick}
                />
              </div>
            </div>
          </div>

          <div className="border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 sm:p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center border border-violet-400/20 bg-violet-500/10 text-violet-300">
                    <Network className="h-4.5 w-4.5" />
                  </div>
                  <div className="max-w-2xl">
                    <div className="text-sm font-semibold text-white">Proxy Protocol</div>
                    <p className="mt-1 text-sm leading-6 text-white/55">
                      Forward original client connection metadata to the origin when the upstream service can parse Proxy Protocol headers.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="proxy-protocol" className="text-sm font-medium text-white">
                    Protocol version
                  </Label>
                  <Select
                    value={formData.proxyProtocol}
                    onValueChange={(value: "off" | "v1" | "v2" | "simple") =>
                      onUpdate({ proxyProtocol: value })
                    }
                  >
                    <SelectTrigger
                      id="proxy-protocol"
                      className="h-11 border-white/[0.12] bg-white/[0.04] text-white focus:border-blue-400/40 focus:ring-0"
                    >
                      <SelectValue placeholder="Select proxy protocol" />
                    </SelectTrigger>
                    <SelectContent>
                      {proxyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.proxyProtocol !== "off" && (
                  <div className="border border-violet-400/18 bg-violet-500/8 px-3 py-3 text-xs leading-5 text-violet-200/90">
                    Ensure the origin server accepts Proxy Protocol {formData.proxyProtocol.toUpperCase()} before enabling it in production.
                  </div>
                )}
              </div>

              <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                  Compatibility
                </div>
                <div className="mt-3 space-y-3 text-xs leading-5 text-white/48">
                  <p>This setting relays client connection metadata to the upstream service.</p>
                  <p>
                    {formData.appType === "udp"
                      ? "UDP applications support Simple and V2 modes only."
                      : "TCP applications support V1 and V2 modes."}
                  </p>
                  <p>Leave the protocol off unless the origin stack explicitly expects these headers.</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <Button
            variant="outline"
            onClick={onBack}
            className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
            disabled={isLoading}
          >
            Back
          </Button>
          <Button
            onClick={onNext}
            disabled={isLoading}
            className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
          >
            Next <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={paidFeatureDialogOpen} onOpenChange={setPaidFeatureDialogOpen}>
        <AlertDialogContent className="border-white/10 bg-[#0f0f23]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Paid Feature</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              IP access rules are available as a paid add-on. Contact your administrator to enable it for this account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setPaidFeatureDialogOpen(false)}
              className="border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
