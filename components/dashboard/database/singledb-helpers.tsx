import React from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { UUID } from "crypto";
import { EncryptedData } from "@/lib/supabase/types";
import { dbLocations } from "@/config/locations";

// Helper Components

interface ConnectionFieldProps {
  label: string;
  value: string;
  isPassword?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  onCopy?: () => void;
  multiline?: boolean;
}

export const ConnectionField = ({
  label,
  value,
  isPassword,
  showPassword,
  onTogglePassword,
  onCopy,
  multiline,
}: ConnectionFieldProps) => {
  return (
    <div className="border border-white/[0.08] bg-white/[0.03] p-4">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type={isPassword && !showPassword ? "password" : "text"}
          value={value}
          readOnly
          className={`flex-1 border-0 bg-transparent font-mono text-sm text-white outline-none ${
            multiline ? "overflow-x-auto" : ""
          }`}
        />
        <div className="flex items-center gap-2">
          {isPassword && onTogglePassword && (
            <button
              onClick={onTogglePassword}
              className="border border-white/[0.08] bg-white/[0.03] p-2 transition-colors hover:bg-white/[0.08]"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-white/55" />
              ) : (
                <Eye className="h-4 w-4 text-white/55" />
              )}
            </button>
          )}
          {onCopy && (
            <button
              onClick={onCopy}
              className="border border-white/[0.08] bg-white/[0.03] p-2 transition-colors hover:bg-white/[0.08]"
            >
              <Copy className="h-4 w-4 text-white/55" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ConfigCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}

export const ConfigCard = ({ icon: Icon, label, value, color }: ConfigCardProps) => {
  return (
    <div className="border border-white/[0.08] bg-white/[0.03] p-4 text-center">
      <Icon className={`h-6 w-6 ${color} mx-auto mb-2`} />
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
};

// Helper Functions

export const safeStringValue = (
  value: string | number | { address: string; family: string } | EncryptedData | undefined
): string => {
  if (!value) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  // Handle objects with address or family properties
  if (typeof value === "object") {
    // Handle EncryptedData type
    if ("encrypted" in value) {
      return value.encrypted || "N/A";
    }
    // Handle address/family object
    if ("address" in value || "family" in value) {
      return value.address || value.family || JSON.stringify(value);
    }
    return JSON.stringify(value);
  }
  return String(value);
};

export const extractCpu = (size: string): string => {
  const match = size.match(/(\d+)vcpu/);
  return match ? `${match[1]} vCPU` : "N/A";
};

export const extractRam = (size: string): string => {
  const match = size.match(/(\d+)gb/);
  return match ? `${match[1]} GB` : "N/A";
};

export const extractDisk = (size: string): string => {
  // DigitalOcean doesn't include disk in size string, use lookup table
  const diskMap: Record<string, string> = {
    "db-s-1vcpu-1gb": "10 GB",
    "db-s-1vcpu-2gb": "34 GB",
    "db-s-2vcpu-4gb": "38 GB",
    "db-s-4vcpu-8gb": "115 GB",
    "db-s-6vcpu-16gb": "270 GB",
    "db-s-8vcpu-32gb": "580 GB",
  };
  return diskMap[size] || "N/A";
};

export const extractRegion = (region: string | undefined): string => {
  if (!region) return "N/A";

  // If region is already a string, return it
  if (typeof region === "string") {
    // Check if it's a JSON string
    try {
      const parsed = JSON.parse(region);
      return parsed?.address || parsed?.family || region;
    } catch {
      // Not JSON, return as is
      return dbLocations.find((loc) => loc.short === region)?.city || "N/A";
    }
  }

  // If it's an object (shouldn't happen based on types, but handle it)
  return (region as {address:string,family:string})?.address  || "N/A";
};

export const calculateMonthlyCost = (size: string): string => {
  // Pricing based on DigitalOcean's managed database pricing
  const priceMap: Record<string, number> = {
    "db-s-1vcpu-1gb": 15,
    "db-s-1vcpu-2gb": 30,
    "db-s-2vcpu-4gb": 60,
    "db-s-4vcpu-8gb": 120,
    "db-s-6vcpu-16gb": 240,
    "db-s-8vcpu-32gb": 480,
  };
  return (priceMap[size] || 0).toFixed(2);
};

export const downloadCACertificate = async (databaseId: UUID | undefined, ca_certificate: string | EncryptedData | undefined) => {
  try {
    if (!ca_certificate) {
      toast.error("CA Certificate not available");
      return;
    }

    // console.log("=== CA Certificate Download Debug ===");
    // console.log("Certificate type:", typeof ca_certificate);
    
    // Convert to string if it's an encrypted object
    const certString = typeof ca_certificate === 'string' ? ca_certificate : String(ca_certificate);
    
    // console.log("Certificate length:", certString?.length);
    
    // console.log("Original certificate (first 100 chars):", certString.substring(0, 100));
    
    let formattedCert = certString;
    
    // Check if the certificate is Base64 encoded (no PEM headers, only base64 characters)
    const isBase64Only = !certString.includes('-----BEGIN CERTIFICATE-----') && 
                         /^[A-Za-z0-9+/=\s]+$/.test(certString.trim());
    
    if (isBase64Only) {
      // console.log("✓ Detected Base64-encoded certificate, decoding...");
      try {
        // Decode Base64 to get the actual PEM certificate
        const decodedCert = atob(certString.trim());
        formattedCert = decodedCert;
        // console.log("✓ Successfully decoded Base64 certificate");
        // console.log("Decoded certificate (first 200 chars):", decodedCert.substring(0, 200));
      } catch (decodeError) {
        console.error("❌ Failed to decode Base64:", decodeError);
        toast.error("Failed to decode certificate");
        return;
      }
    } else {
      // console.log("Certificate is not Base64-only, checking for other encodings...");
      
      // Handle escaped newlines
      if (certString.includes('\\n')) {
        formattedCert = certString.replace(/\\n/g, '\n');
        // console.log("✓ Replaced escaped \\n with actual newlines");
      }
      
      // Handle double-escaped newlines
      if (certString.includes('\\\\n')) {
        formattedCert = formattedCert.replace(/\\\\n/g, '\n');
        // console.log("✓ Replaced double-escaped \\\\n with actual newlines");
      }
      
      // Handle URL-encoded newlines
      if (certString.includes('%0A')) {
        formattedCert = formattedCert.replace(/%0A/g, '\n');
        // console.log("✓ Replaced URL-encoded newlines");
      }
    }
    
    // Verify certificate has proper PEM format
    const hasPEMHeaders = formattedCert.includes('-----BEGIN CERTIFICATE-----') && 
                          formattedCert.includes('-----END CERTIFICATE-----');
    
    if (!hasPEMHeaders) {
      console.error("❌ Certificate does not have proper PEM format headers");
      // console.log("Certificate content (first 500 chars):", formattedCert.substring(0, 500));
      toast.error("Invalid certificate format - missing PEM headers");
      return;
    }
    
    // console.log("✓ Certificate has valid PEM headers");
    // console.log("Final certificate length:", formattedCert.length);
    // console.log("Has actual newlines:", formattedCert.includes('\n'));
    // console.log("Number of newlines:", (formattedCert.match(/\n/g) || []).length);
    
    // Ensure the certificate ends with a newline (PEM standard)
    if (!formattedCert.endsWith('\n')) {
      formattedCert += '\n';
      // console.log("✓ Added trailing newline");
    }
    
    // Create blob with UTF-8 encoding for proper text handling
    const blob = new Blob([formattedCert], { type: 'application/x-pem-file' });
    // console.log("✓ Blob created, size:", blob.size, "bytes");
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ca-certificate-${databaseId}.crt`;
    document.body.appendChild(link);
    link.click();
    
    // Clean up after a small delay to ensure download starts
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      // console.log("✓ Download cleanup completed");
    }, 100);

    toast.success("CA Certificate downloaded successfully!");
    // console.log("=== Download Complete ===");
  } catch (error) {
    console.error("[downloadCACertificate] Error:", error);
    toast.error("Failed to download CA certificate");
  }
};
