"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Copy,
  Check,
  Shield,
  Server,
  Globe,
  Lock,
  Network,
  AlertCircle,
  Trash2,
  Loader2,
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface SpectrumAppInfoProps {
  spectrumApp: Tables<"spectrum_apps">;
  isRefreshing?: boolean;
}

const SpectrumAppInfo = ({ spectrumApp, isRefreshing }: SpectrumAppInfoProps) => {
  const router = useRouter();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const toastId = toast.loading("Deleting Spectrum app...");

      await axios.post("/api/services/spectrum/apps/delete", {
        app_id: spectrumApp.spectrum_id,
      });

      toast.success("Spectrum app deleted successfully", { id: toastId });
      router.push("/dashboard/services/network-ddos");
      router.refresh();
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error || "Failed to delete Spectrum app";
      toast.error(errorMsg);
      console.error("Delete error:", error);
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  // Parse DNS data
  const dns = spectrumApp.dns as { name: unknown; type: string; decrypted_name?: string } | null;
  const dnsName =
    dns && dns.decrypted_name ? dns.decrypted_name :
    dns && typeof dns.name === "string" ? dns.name : "Not available";
  const dnsType = dns?.type || "Unknown";

  // Parse edge IPs
  const edgeIps = spectrumApp.edge_ips as
    | { type: string; connectivity: string }
    | null;

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const InfoCard = ({
    icon: Icon,
    title,
    children,
  }: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-all h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-white">
            <Icon className="h-4 w-4 text-white/70" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">{children}</CardContent>
      </Card>
    </motion.div>
  );

  const InfoRow = ({
    label,
    value,
    copyable,
  }: {
    label: string;
    value: string | React.ReactNode;
    copyable?: boolean;
  }) => (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/60 font-medium flex-shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-white font-mono break-all text-right">
          {value}
        </span>
        {copyable && typeof value === "string" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 hover:bg-white/10 flex-shrink-0"
            onClick={() => copyToClipboard(value, label)}
          >
            {copiedItem === label ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Copy className="h-3 w-3 text-white/60" />
            )}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Alert Message */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
      >
        <AlertCircle className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-100">
          This page displays your Cloudflare Spectrum application
          configuration. Use the Settings tab to modify editable properties.
        </p>
      </motion.div>

      {/* Grid Layout for Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Basic Information */}
        <InfoCard icon={Shield} title="Application Details">
          <InfoRow
            label="Spectrum ID"
            value={spectrumApp.spectrum_id}
            copyable
          />
          <InfoRow label="Protocol" value={spectrumApp.protocol} copyable />
          <InfoRow label="Status" value={
            <Badge
              variant="outline"
              className={`capitalize text-xs ${
                spectrumApp.status === "created" || spectrumApp.status === "updated"
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
              }`}
            >
              {spectrumApp.status || "active"}
            </Badge>
          } />
           <InfoRow label="DNS Type" value={dnsType} />
          <InfoRow
            label="Hostname"
            value={
              dnsName === "Not available"
                ? "Encrypted"
                : `${dnsName}.hostguardian.net`
            }
            copyable={dnsName !== "Not available"}
          />
          <InfoRow label="Created" value={formatDate(spectrumApp.created_at)} />
          <InfoRow label="Updated" value={formatDate(spectrumApp.updated_at)} />
        </InfoCard>


        {/* Security & Network */}
        <InfoCard icon={Lock} title="Security & Network">
          <InfoRow
            label="TLS Mode"
            value={
              <Badge
                variant="outline"
                className={`uppercase text-xs ${
                  spectrumApp.tls === "full"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                }`}
              >
                {spectrumApp.tls}
              </Badge>
            }
          />
          <InfoRow
            label="IP Firewall"
            value={
              <Badge
                variant="outline"
                className={`text-xs ${
                  spectrumApp.ip_firewall
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                }`}
              >
                {spectrumApp.ip_firewall ? "Enabled" : "Disabled"}
              </Badge>
            }
          />
           <InfoRow label="Type" value={edgeIps?.type || "Not configured"} />
          <InfoRow
            label="Connectivity"
            value={edgeIps?.connectivity || "Not configured"}
          />
          <InfoRow label="Traffic Type" value={spectrumApp.traffic_type} />
          <InfoRow label="Proxy Protocol" value={spectrumApp.proxy_protocol} />
           {spectrumApp.origin_direct && spectrumApp.origin_direct.length > 0 ? (
          spectrumApp.origin_direct.map((origin, index) => (
            <InfoRow
              key={index}
              label={`Origin ${index + 1}`}
              value={origin}
              copyable
            />
          ))
        ) : (
          <p className="text-xs text-white/40 italic py-2">No origins configured</p>
        )}
        </InfoCard>

       
       
      </div>

     
    </div>
  );
};

export default SpectrumAppInfo;
