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
import {  Shield, Network, Key } from "lucide-react";
import { StepProps } from "./types";
import { Separator } from "@/components/ui/separator";

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
      // Show paid feature dialog
      setPaidFeatureDialogOpen(true);
    } else {
      // Allow disabling
      onUpdate({ ipAccessRule: false });
    }
  };

  return (
    <>
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <div className="flex gap-2">
          <Key className="w-5 h-5 text-blue-400" />
          <CardTitle className="text-white">Advanced Settings</CardTitle>
        </div>
        <p className="text-sm text-white/60">
          Configure optional features for your Spectrum application
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Argo Smart Routing */}
        {/* <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-start gap-3 flex-1">
            <Zap className="w-5 h-5 text-orange-400 mt-0.5" />
            <div className="flex-1">
              <Label htmlFor="argo-smart-routing" className="text-white font-medium cursor-pointer">
                Argo Smart Routing
              </Label>
              <p className="text-sm text-white/60 mt-1">
                Enables Argo Smart Routing to optimize routing and reduce latency.

              </p>
            </div>
          </div>
          <Switch
            id="argo-smart-routing"
            checked={formData.argoSmartRouting}
            onCheckedChange={(checked) => onUpdate({ argoSmartRouting: checked })}
          />
        </div> */}

        {/* TLS */}
        {/* <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-start gap-3 mb-4">
            <Lock className="w-5 h-5 text-green-400 mt-0.5" />
            <div className="flex-1">
              <Label htmlFor="tls" className="text-white font-medium">
                Edge TLS Termination
              </Label>
              <p className="text-sm text-white/60 mt-1">
                Enable TLS encryption between our edge and your origin.TLS may not be used with UDP applications.
              </p>
            </div>
          </div>
          <Select
            value={formData.tls}
            onValueChange={(value: 'off' | 'full') => onUpdate({ tls: value })}
          >
            <SelectTrigger
              id="tls"
              className="bg-white/10 border-white/20 text-white"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off - No encryption</SelectItem>
              <SelectItem value="full">Full - End-to-end encryption</SelectItem>
               <SelectItem value="strict">Strict </SelectItem>
                <SelectItem value="flexible">Flexible</SelectItem>
            </SelectContent>
          </Select>
          {formData.tls === 'full' && (
            <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-md">
              <p className="text-xs text-green-400">
                ✓ Your traffic will be encrypted between Cloudflare and your origin server
              </p>
            </div>
          )}
        </div> */}

        {/* IP Access Rule */}
        <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-start gap-3 flex-1">
            <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
            <div className="flex-1">
              <Label
                htmlFor="ip-access-rule"
                className="text-white font-medium cursor-pointer"
              >
                IP Access Rules
              </Label>
              <p className="text-sm text-white/60 mt-1">
                Enable IP-based access control for your application
              </p>
            </div>
          </div>
          <Switch
            id="ip-access-rule"
            checked={formData.ipAccessRule}
            onCheckedChange={handleIPAccessRuleClick}
          />
        </div>

        {/* Proxy Protocol */}
        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-start gap-3 mb-4">
            <Network className="w-5 h-5 text-purple-400 mt-0.5" />
            <div className="flex-1">
              <Label
                htmlFor="proxy-protocol"
                className="text-white font-medium"
              >
                Proxy Protocol
              </Label>
              <p className="text-sm text-white/60 mt-1">
                Enable the protocol version that your origin supports, if any.
                This relays the client's original connection information. It is
                only supported for TCP and UDP applications.
              </p>
            </div>
          </div>
          <Select
            value={formData.proxyProtocol}
            onValueChange={(value: "off" | "v1" | "v2" | "simple") =>
              onUpdate({ proxyProtocol: value })
            }
          >
            <SelectTrigger
              id="proxy-protocol"
              className="bg-white/10 border-white/20 text-white"
            >
              <SelectValue />
            </SelectTrigger>
            {formData.appType === "udp" ? (
              <>
                <SelectContent>
                  <SelectItem value="off">Off </SelectItem>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="v2">V2 </SelectItem>
                </SelectContent>
              </>
            ) : (
              <>
                <SelectContent>
                  <SelectItem value="off">Off </SelectItem>
                  <SelectItem value="v1">V1</SelectItem>
                  <SelectItem value="v2">V2 </SelectItem>
                </SelectContent>
              </>
            )}
          </Select>
          {formData.proxyProtocol !== "off" && (
            <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-md">
              <p className="text-xs text-purple-400">
                ℹ Ensure your origin server supports Proxy Protocol{" "}
                {formData.proxyProtocol.toUpperCase()}
              </p>
            </div>
          )}
        </div>

        <Separator className="bg-white/10" />

        {/* Configuration Summary */}
        {/* <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h4 className="text-white font-medium mb-3">Configuration Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/60">Application Type:</span>
              <span className="text-white font-medium uppercase">{formData.appType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Domain Name:</span>
              <span className="text-white font-medium">{formData.domain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Edge Port:</span>
              <span className="text-white font-medium">{formData.edgePort}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Origin:</span>
              <span className="text-white font-medium">{formData.originIP}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Origin Port:</span>
              <span className="text-white font-medium">{formData.originPort}</span>
            </div>
            <Separator className="bg-white/10 my-2" />
            <div className="flex justify-between">
              <span className="text-white/60">Argo Smart Routing:</span>
              <span className="text-white font-medium">{formData.argoSmartRouting ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">TLS:</span>
              <span className="text-white font-medium capitalize">{formData.tls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">IP Access Rules:</span>
              <span className="text-white font-medium">{formData.ipAccessRule ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Proxy Protocol:</span>
              <span className="text-white font-medium uppercase">{formData.proxyProtocol}</span>
            </div>
          </div>
        </div> */}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          className="cursor-pointer rounded-md border-white/20 text-white hover:bg-white/10"
          disabled={isLoading}
        >
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={isLoading}
          className="cursor-pointer bg-white text-black rounded-md hover:bg-white/90"
        >
          Next
        </Button>
      </CardFooter>
    </Card>

    <AlertDialog open={paidFeatureDialogOpen} onOpenChange={setPaidFeatureDialogOpen}>
      <AlertDialogContent className="bg-[#0f0f23] border-white/10">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Paid Feature</AlertDialogTitle>
          <AlertDialogDescription className="text-white/60">
            This is a paid feature. Contact Admin to avail it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => setPaidFeatureDialogOpen(false)}
            className="bg-white text-black hover:bg-white/90"
          >
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
};
