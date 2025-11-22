"use client";

import { useState, useEffect, useRef } from "react";
import {
  Lock,
  Network,
  Edit2,
  Save,
  X,
  Loader2,
  Server,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axios from "axios";
import { Input } from "@/components/ui/input";

interface SpectrumAppSettingsProps {
  spectrumApp: Tables<"spectrum_apps">;
  onUpdate?: () => void;
}

const SpectrumAppSettings = ({ spectrumApp}: SpectrumAppSettingsProps) => {
 

  let x:string="";
  const [isLoading, setIsLoading] = useState<{ [key: string]: boolean }>({});
  const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({});
  
  // Keep track of the last spectrum_id to detect when it actually changes
  const lastSpectrumIdRef = useRef(spectrumApp.spectrum_id);

  // Parse DNS data
  const dns = spectrumApp.dns as { name: unknown; type: string; decrypted_name?: string } | null;
  const edgeIps = spectrumApp.edge_ips as
    | { type: string; connectivity: string }
    | null;

  // Local state for settings
  const [settings, setSettings] = useState({
    dnsType: dns?.type || "CNAME",
    protocol: spectrumApp.protocol || "",
    tls: spectrumApp.tls || "off",
    ipFirewall: spectrumApp.ip_firewall || false,
    trafficType: spectrumApp.traffic_type || "direct",
    proxyProtocol: spectrumApp.proxy_protocol || "off",
    origins: spectrumApp.origin_direct || [],
    edgeIpType: edgeIps?.type || "dynamic",
    edgeIpConnectivity: edgeIps?.connectivity || "all",
  });

  // Origin input state
  const [newOriginIp, setNewOriginIp] = useState("");
  const [newOriginPort, setNewOriginPort] = useState("");

  // Only update settings when spectrumApp actually changes (different app)
  // NOT when it's just refreshed with the same data


  const handleSave = async (setting: string) => {
    setIsLoading((prev) => ({ ...prev, [setting]: true }));

    try {
      const dns = spectrumApp.dns as { name: unknown; type: string; decrypted_name?: string } | null;
      let payload:any= { app_id: spectrumApp.spectrum_id };

      switch (setting) {
        case "dns":
          payload.dns = {
            name: (dns && typeof dns.name === "string" ? dns.name : "").replace(
              ".hostguardian.net",
              ""
            ),
            type: settings.dnsType,
          };
          break;
        case "protocol":
          // Validate protocol format: tcp/22 or tcp/8000-9000 or udp/53
          const protocolRegex = /^(tcp|udp)\/(\d+|\d+-\d+)$/i;
          if (!settings.protocol || !protocolRegex.test(settings.protocol.trim())) {
            toast.error("Invalid protocol format. Use format like: tcp/22 or tcp/8000-9000");
            setIsLoading((prev) => ({ ...prev, [setting]: false }));
            return;
          }
          payload.protocol = settings.protocol;
          break;
        case "tls":
          payload.tls = settings.tls;
          break;
        case "ipFirewall":
          payload.ip_firewall = settings.ipFirewall;
          break;
        case "trafficType":
          payload.traffic_type = settings.trafficType;
          break;
        case "proxyProtocol":
          payload.proxy_protocol = settings.proxyProtocol;
          break;
        case "origins":
          if (settings.origins.length === 0) {
            toast.error("At least one origin is required");
            setIsLoading((prev) => ({ ...prev, [setting]: false }));
            return;
          }
          
          // Validate each origin format and construct full origin with protocol
          const formattedOrigins: string[] = [];
          const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
          const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
          const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
          const portRegex = /^\d+$/;
          
          for (const origin of settings.origins) {
            // Parse the stored origin (format: "ip:port")
            const parts = origin.split(':');
            if (parts.length !== 2) {
              toast.error(`Invalid origin format: ${origin}`);
              setIsLoading((prev) => ({ ...prev, [setting]: false }));
              return;
            }
            
            const [ip, port] = parts;
            
            // Validate IP/hostname
            const isValidIp = ipv4Regex.test(ip) || ipv6Regex.test(ip) || hostnameRegex.test(ip);
            if (!isValidIp) {
              toast.error(`Invalid IP address or hostname: ${ip}`);
              setIsLoading((prev) => ({ ...prev, [setting]: false }));
              return;
            }
            
            // Validate port
            if (!portRegex.test(port)) {
              toast.error(`Invalid port number: ${port}`);
              setIsLoading((prev) => ({ ...prev, [setting]: false }));
              return;
            }
            
            const portNum = parseInt(port, 10);
            if (portNum < 1 || portNum > 65535) {
              toast.error(`Port number must be between 1 and 65535: ${port}`);
              setIsLoading((prev) => ({ ...prev, [setting]: false }));
              return;
            }
            
            // Extract protocol from settings.protocol (e.g., "tcp/22" -> "tcp")
            const protocolMatch = settings.protocol.match(/^(tcp|udp)/i);
            const protocol = protocolMatch ? protocolMatch[1].toLowerCase() : 'tcp';
            
            // Format as protocol://ip:port
            formattedOrigins.push(`${protocol}://${ip}:${port}`);
          }
          
          payload.origin_direct = formattedOrigins;
          break;
        case "edgeIps":
          payload.edge_ips = {
            type: settings.edgeIpType,
            connectivity: settings.edgeIpConnectivity,
          };
          break;
        default:
          throw new Error("Unknown setting");
      }

      const response = await axios.put(
        "/api/services/spectrum/apps/update",
        payload
      );

      if (response.data) {
        toast.success(
          `${setting.charAt(0).toUpperCase() + setting.slice(1)} updated successfully`
        );
        setEditMode((prev) => ({ ...prev, [setting]: false }));
        
        // Don't refresh immediately to avoid losing input focus
        // The data will be refreshed when user navigates away or refreshes page
        // if (onUpdate) {
        //   await onUpdate();
        // }
      } else {
        throw new Error("Update failed");
      }
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.message ||
        `Failed to update ${setting}`;
      toast.error(errorMsg);
      console.error("Update error:", error);
    } finally {
      setIsLoading((prev) => ({ ...prev, [setting]: false }));
    }
  };

  const handleCancel = (setting: string) => {
    setEditMode((prev) => ({ ...prev, [setting]: false }));
    // Reset to original values
    switch (setting) {
      case "dns":
        setSettings((prev) => ({ ...prev, dnsType: dns?.type || "CNAME" }));
        break;
      case "protocol":
        setSettings((prev) => ({ ...prev, protocol: spectrumApp.protocol }));
        break;
      case "tls":
        setSettings((prev) => ({ ...prev, tls: spectrumApp.tls }));
        break;
      case "ipFirewall":
        setSettings((prev) => ({
          ...prev,
          ipFirewall: spectrumApp.ip_firewall,
        }));
        break;
      case "trafficType":
        setSettings((prev) => ({
          ...prev,
          trafficType: spectrumApp.traffic_type,
        }));
        break;
      case "proxyProtocol":
        setSettings((prev) => ({
          ...prev,
          proxyProtocol: spectrumApp.proxy_protocol,
        }));
        break;
      case "origins":
        setSettings((prev) => ({
          ...prev,
          origins: spectrumApp.origin_direct || [],
        }));
        setNewOriginIp("");
        setNewOriginPort("");
        break;
      case "edgeIps":
        setSettings((prev) => ({
          ...prev,
          edgeIpType: edgeIps?.type || "dynamic",
          edgeIpConnectivity: edgeIps?.connectivity || "all",
        }));
        break;
    }
  };

  const addOrigin = () => {
    if (!newOriginIp.trim() || !newOriginPort.trim()) {
      toast.error("Both IP/hostname and port are required");
      return;
    }
    
    // Validate IP address or hostname
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    const trimmedIp = newOriginIp.trim();
    if (!ipv4Regex.test(trimmedIp) && !ipv6Regex.test(trimmedIp) && !hostnameRegex.test(trimmedIp)) {
      toast.error("Invalid IP address or hostname format");
      return;
    }
    
    // Validate port
    const portRegex = /^\d+$/;
    const trimmedPort = newOriginPort.trim();
    if (!portRegex.test(trimmedPort)) {
      toast.error("Port must be a number");
      return;
    }
    
    const portNum = parseInt(trimmedPort, 10);
    if (portNum < 1 || portNum > 65535) {
      toast.error("Port number must be between 1 and 65535");
      return;
    }
    
    // Store as "ip:port" format (without protocol)
    const newOrigin = `${trimmedIp}:${trimmedPort}`;
    
    if (settings.origins.includes(newOrigin)) {
      toast.error("Origin already exists");
      return;
    }
    
    setSettings((prev) => ({
      ...prev,
      origins: [...prev.origins, newOrigin],
    }));
    setNewOriginIp("");
    setNewOriginPort("");
  };



  const removeOrigin = (origin: string) => {
    if (settings.origins.length <= 1) {
      toast.error("At least one origin is required");
      return;
    }
    setSettings((prev) => ({
      ...prev,
      origins: prev.origins.filter((o) => o !== origin),
    }));
  };


    

  const SettingCard = ({
    icon: Icon,
    title,
    settingKey,
    children,
    description,
  }: {
    icon: React.ElementType;
    title: string;
    settingKey: string;
    children: React.ReactNode;
    description?: string;
  }) => (
    <div className="h-full">
      <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-all h-full">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm flex items-center gap-2 text-white">
                <Icon className="h-4 w-4 text-white/70 flex-shrink-0" />
                {title}
              </CardTitle>
              {description && (
                <p className="text-xs text-white/50 mt-1">{description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 justify-end">
              {editMode[settingKey] ? (
                <div className="flex items-center gap-2 w-[175px] justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCancel(settingKey)}
                    disabled={isLoading[settingKey]}
                    className="cursor-pointer h-8 px-3 hover:bg-white/10 text-white/60 hover:text-white"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(settingKey)}
                    disabled={isLoading[settingKey]}
                    className="cursor-pointer h-8 px-3 bg-white/10 hover:bg-white/60 text-white"
                  >
                    {isLoading[settingKey] ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="w-[175px] flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditMode((prev) => ({ ...prev, [settingKey]: true }))
                    }
                    className="cursor-pointer h-8 px-3 hover:bg-white/10 text-white/60 hover:text-white"
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );


  useEffect(() => {
      //debugger
    if (lastSpectrumIdRef.current !== spectrumApp.spectrum_id) {
      // Different app, update everything
      lastSpectrumIdRef.current = spectrumApp.spectrum_id;
      const dns = spectrumApp.dns as { name: unknown; type: string; decrypted_name?: string } | null;
      const edgeIps = spectrumApp.edge_ips as { type: string; connectivity: string } | null;
      
      setSettings({
        dnsType: dns?.type || "CNAME",
        protocol: spectrumApp.protocol || "",
        tls: spectrumApp.tls || "off",
        ipFirewall: spectrumApp.ip_firewall || false,
        trafficType: spectrumApp.traffic_type || "direct",
        proxyProtocol: spectrumApp.proxy_protocol || "off",
        origins: spectrumApp.origin_direct || [],
        edgeIpType: edgeIps?.type || "dynamic",
        edgeIpConnectivity: edgeIps?.connectivity || "all",
      });
      setEditMode({});
      setNewOriginIp("");
      setNewOriginPort("");
    }
  }, [spectrumApp]);

  return (
    <div className="space-y-4">
    

      {/* Grid Layout for Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">


        {/* Protocol Configuration */}
        <SettingCard
          icon={Network}
          title="Protocol Configuration"
          settingKey="protocol"
          description="Define protocol and port"
        >
          <div className="space-y-2">
            <Label htmlFor="protocol" className="text-xs text-white/80">
              Protocol
            </Label>
            <Input
              autoFocus={editMode.protocol}
              id="protocol"
              value={settings.protocol}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, protocol: e.target.value }))
              }
              disabled={!editMode.protocol}
              placeholder="tcp/22"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-9"
            />
            <p className="text-xs text-white/50">
              Format: tcp/22 or tcp/8000-9000
            </p>
          </div>
        </SettingCard>

        {/* TLS Configuration */}
        <SettingCard
          icon={Lock}
          title="TLS Configuration"
          settingKey="tls"
          description="Configure TLS encryption"
        >
          <div className="space-y-2">
            <Label htmlFor="tls" className="text-xs text-white/80">
              TLS Mode
            </Label>
            <Select
              value={settings.tls}
              onValueChange={(value) =>
                setSettings((prev) => ({ ...prev, tls: value as "off" | "full" }))
              }
              disabled={!editMode.tls}
            >
              <SelectTrigger
                id="tls"
                className="bg-white/5 border-white/10 text-white h-9"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10">
                <SelectItem value="off" className="text-white">
                  Off
                </SelectItem>
                <SelectItem value="full" className="text-white">
                  Full
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-white/50">
              {settings.tls === "full"
                ? "TLS encryption enabled"
                : "TLS encryption disabled"}
            </p>
          </div>
        </SettingCard>

        {/* IP Firewall */}
        {/* <SettingCard
          icon={Shield}
          title="IP Firewall"
          settingKey="ipFirewall"
          description="Enable/disable IP firewall"
        >
          <div className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Label htmlFor="ip-firewall" className="text-xs text-white/80">
                IP Firewall Status
              </Label>
              <p className="text-xs text-white/50">
                {settings.ipFirewall ? "Firewall enabled" : "Firewall disabled"}
              </p>
            </div>
            <Switch
              id="ip-firewall"
              checked={settings.ipFirewall}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, ipFirewall: checked }))
              }
              disabled={!editMode.ipFirewall}
              className="data-[state=checked]:bg-green-500"
            />
          </div>
        </SettingCard> */}

        {/* Traffic Type */}
        <SettingCard
          icon={Network}
          title="Traffic Type"
          settingKey="trafficType"
          description="Configure traffic routing"
        >
          <div className="space-y-2">
            <Label htmlFor="traffic-type" className="text-xs text-white/80">
              Traffic Type
            </Label>
            <Select
              value={settings.trafficType}
              onValueChange={(value) =>
                setSettings((prev) => ({ ...prev, trafficType: value }))
              }
              disabled={!editMode.trafficType}
            >
              <SelectTrigger
                id="traffic-type"
                className="bg-white/5 border-white/10 text-white h-9"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10">
                <SelectItem value="direct" className="text-white">
                  Direct
                </SelectItem>
                <SelectItem value="http" className="text-white">
                  HTTP
                </SelectItem>
                <SelectItem value="https" className="text-white">
                  HTTPS
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingCard>

        {/* Proxy Protocol */}
        <SettingCard
          icon={Network}
          title="Proxy Protocol"
          settingKey="proxyProtocol"
          description="Configure proxy protocol"
        >
          <div className="space-y-2">
            <Label htmlFor="proxy-protocol" className="text-xs text-white/80">
              Proxy Protocol
            </Label>
            <Select
              value={settings.proxyProtocol}
              onValueChange={(value) =>
                setSettings((prev) => ({ ...prev, proxyProtocol: value }))
              }
              disabled={!editMode.proxyProtocol}
            >
              <SelectTrigger
                id="proxy-protocol"
                className="bg-white/5 border-white/10 text-white h-9"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10">
                <SelectItem value="off" className="text-white">
                  Off
                </SelectItem>
                <SelectItem value="v1" className="text-white">
                  Version 1
                </SelectItem>
                <SelectItem value="v2" className="text-white">
                  Version 2
                </SelectItem>
                <SelectItem value="simple" className="text-white">
                  Simple
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingCard>
          <SettingCard
          icon={Server}
          title="Origin Servers"
          settingKey="origins"
          description="Configure origin servers"
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-white/80">Current Origins</Label>
              <div className="space-y-2">
                {settings.origins.map((origin, index) => {
                  // Extract IP:port from format like "tcp://192.168.1.1:8080" or just "192.168.1.1:8080"
                  const displayOrigin = origin.includes('://') 
                    ? origin.split('://')[1] 
                    : origin;
                  return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-white/5 rounded border border-white/10"
                  >
                    <span className="text-xs text-white font-mono">{displayOrigin}</span>
                    {editMode.origins && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeOrigin(origin)}
                        className="h-6 w-6 p-0 hover:bg-red-500/20 hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

            {editMode.origins && (
              <div className="space-y-2">
                <Label className="text-xs text-white/80">
                  Add New Origin
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                     onClick={() => { x="ip"; }}
                      autoFocus
                      id="new-origin-ip"
                      value={newOriginIp}
                      onChange={(e) => setNewOriginIp(e.target.value)}
                      placeholder="IP or hostname"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-9"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addOrigin();
                        }
                      }}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Input
                     onClick={() => { x="port"; }}
                     autoFocus={x ==="port"}
                      id="new-origin-port"
                      value={newOriginPort}
                      onChange={(e) => setNewOriginPort(e.target.value)}
                      placeholder="Port"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-9"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addOrigin();
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={addOrigin}
                    className="bg-white/10 hover:bg-white/20 text-white h-9"
                  >
                    Add
                  </Button>
                </div>
                <p className="text-xs text-white/50">
                  Enter IP address or hostname and port separately
                </p>
              </div>
            )}
          </div>
        </SettingCard>

        {/* Edge IPs */}
        <SettingCard
          icon={Network}
          title="Edge IP Configuration"
          settingKey="edgeIps"
          description="Configure edge IP settings"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edge-ip-type" className="text-xs text-white/80">
                Edge IP Type
              </Label>
              <Select
                value={settings.edgeIpType}
                onValueChange={(value) =>
                  setSettings((prev) => ({ ...prev, edgeIpType: value }))
                }
                disabled={!editMode.edgeIps}
              >
                <SelectTrigger
                  id="edge-ip-type"
                  className="bg-white/5 border-white/10 text-white h-9"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  <SelectItem value="dynamic" className="text-white">
                    Dynamic
                  </SelectItem>
                  <SelectItem value="static" className="text-white">
                    Static
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edge-ip-connectivity" className="text-xs text-white/80">
                Connectivity
              </Label>
              <Select
                value={settings.edgeIpConnectivity}
                onValueChange={(value) =>
                  setSettings((prev) => ({ ...prev, edgeIpConnectivity: value }))
                }
                disabled={!editMode.edgeIps}
              >
                <SelectTrigger
                  id="edge-ip-connectivity"
                  className="bg-white/5 border-white/10 text-white h-9"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  <SelectItem value="all" className="text-white">
                    All
                  </SelectItem>
                  <SelectItem value="ipv4" className="text-white">
                    IPv4 Only
                  </SelectItem>
                  <SelectItem value="ipv6" className="text-white">
                    IPv6 Only
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SettingCard>
      </div>
    </div>
  );
};

export default SpectrumAppSettings;
