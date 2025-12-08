"use client";

import { useState, useRef, useCallback } from "react";
import { Server, Edit2, Save, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import axios from "axios";

interface OriginServersCardProps {
  spectrumId: string;
  initialOrigins: string[];
  protocol?: string | null;
}

const OriginServersCard = ({ spectrumId, initialOrigins, protocol }: OriginServersCardProps) => {
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [origins, setOrigins] = useState<string[]>(initialOrigins);
  const [newOriginIp, setNewOriginIp] = useState("");
  const [newOriginPort, setNewOriginPort] = useState("");
  
  // Refs to maintain input focus
  const ipInputRef = useRef<HTMLInputElement>(null);
  const portInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setIsLoading(true);

    try {
        const requiredProtocol = protocol === 'ssh' || protocol === 'rdp' ? 'tcp' : protocol;
      const payload = {
        app_id: spectrumId,
        origin_direct: [`${requiredProtocol}://${origins[0]}`], // Store with protocol prefix
      };

      const response = await axios.put("/api/services/spectrum/apps/update", payload);

      if (response.data.success) {
        toast.success("Origin servers updated successfully");
        setEditMode(false);
      } else {
        toast.error(response.data.error || "Failed to update origin servers");
      }
    } catch (error) {
      console.error("Error updating origin servers:", error);
      toast.error("Failed to update origin servers");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setOrigins(initialOrigins);
    setNewOriginIp("");
    setNewOriginPort("");
    setEditMode(false);
  };

  const addOrigin = useCallback(() => {
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
    
    if (origins.includes(newOrigin)) {
      toast.error("Origin already exists");
      return;
    }
    
    // Replace the origin instead of adding to array (only one origin allowed)
    setOrigins([newOrigin]);
    setNewOriginIp("");
    setNewOriginPort("");
    //toast.success("Origin updated successfully")
  }, [newOriginIp, newOriginPort, origins]);

  const removeOrigin = (origin: string) => {
    if (origins.length <= 1) {
      toast.error("At least one origin is required");
      return;
    }
    setOrigins((prev) => prev.filter((o) => o !== origin));
  };

  return (
    <div className="h-full">
      <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-all h-full">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm flex items-center gap-2 text-white">
                <Server className="h-4 w-4 text-white/70 flex-shrink-0" />
                Origin Servers
              </CardTitle>
              <p className="text-xs text-white/50 mt-1">Configure backend origin servers</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {editMode ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancel}
                    disabled={isLoading}
                    className="cursor-pointer h-7 text-xs hover:bg-white/10 text-white/70 hover:text-white"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isLoading}
                    className="cursor-pointer h-7 text-xs bg-white/10 hover:bg-white/20 text-white"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditMode(true)}
                  className="cursor-pointer h-7 text-xs hover:bg-white/10 text-white/70 hover:text-white"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <div className="space-y-3">
            <div>
              <Label className="px-2 text-xs text-white/80">Current Origins</Label>
              <div className="space-y-2">
                {origins.map((origin, index) => {
                  // Extract IP:port from format like "tcp://192.168.1.1:8080" or just "192.168.1.1:8080"
                  const displayOrigin = origin.includes('://') 
                    ? origin.split('://')[1] 
                    : origin;
                  return (
                    <div
                      key={index}
                      className="mt-2 flex items-center justify-between p-2 bg-white/5 rounded border border-white/10"
                    >
                      <span className="text-xs text-white font-mono">{displayOrigin}</span>
                      {editMode && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeOrigin(origin)}
                          className="cursor-pointer h-6 w-6 p-0 hover:bg-red-500/20 hover:text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {editMode && (
              <div className="space-y-2">
                <Label className="text-xs text-white/80">
                  {origins.length > 0 ? 'Replace Origin' : 'Add New Origin'}
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      ref={ipInputRef}
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
                      ref={portInputRef}
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
                    className="cursor-pointer bg-white/10 hover:bg-white/20 text-white h-9"
                  >
                    {origins.length > 0 ? 'Replace' : 'Add'}
                  </Button>
                </div>
                <p className="text-xs text-white/50">
                  {origins.length > 0 
                    ? 'Entering a new origin will replace the existing one (only one origin allowed)' 
                    : 'Enter IP address or hostname and port separately'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OriginServersCard;
