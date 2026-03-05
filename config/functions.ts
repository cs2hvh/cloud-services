import { AxiosError } from "axios";
import * as crypto from "crypto";
// import { lookup, resolve4, resolve6, resolveCname, resolveMx } from "dns/promises";
import type { MxRecord } from "dns";
import { Products } from "@/lib/supabase/queries/products";
import type { Plan } from "@/types/pricing";

const FALLBACK_PLANS: Plan[] = [
  {
    name: "Starter",
    description: "For dev environments and side projects.",
    monthly: 0,
    yearly: 0,
    cta: "Start Free",
    featured: false,
    highlighted:false,
    features: [
      "1 database",
      "1 GB storage",
      "Shared CPU",
      "Daily backups (7-day retention)",
      "Community support",
      "Single node",
    ],
  },
  {
    name: "Pro",
    description: "For production apps and growing teams.",
    monthly: 25,
    yearly: 20,
    cta: "Get Started",
    featured: true,
    highlighted:false,
    features: [
      "Unlimited databases",
      "Up to 500 GB storage",
      "Dedicated CPU",
      "Point-in-time recovery (30 days)",
      "Read replicas",
      "Connection pooling",
      "VPC peering",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    description: "For teams that need compliance and scale.",
    monthly: 0,
    yearly: 0,
    cta: "Contact Sales",
    featured: false,
    highlighted:false,
    isCustom: true,
    features: [
      "Everything in Pro",
      "Multi-region replication",
      "SSO / SAML",
      "SOC 2 & HIPAA compliance",
      "99.999% SLA",
      "Dedicated support engineer",
      "Custom retention policies",
      "Audit logs",
    ],
  },
];




// export async function getDatabasePlans(): Promise<Plan[]> {
//   try {
//     // Fetch featured database products
//     const products = await Products.get_featured_by_service_type("database");
    
//     // Map products to plans structure
//     const dynamicPlans = products.map((product) => ({
//       name: product.name || "",
//       description: product.short_description || product.description || "",
//       monthly: product.price || 0,
//       yearly: product.yearly_price || product.price || 0,
//       cta: product.cta_text || "Get Started",
//       featured: product.is_featured || false,
//       highlighted: product.is_highlighted || false,
//       features: product.features || [],
//       isCustom: product.cta_text?.toLowerCase().includes("contact") || false,
//     }));
    
//     // Return dynamic plans if available, otherwise fallback
//     return dynamicPlans.length > 0 ? dynamicPlans : FALLBACK_PLANS;
//   } catch (error) {
//     console.error("Error fetching database plans:", error);
//     return FALLBACK_PLANS;
//   }
// }



export const generateStrongPassword = (length: number = 16) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const randomBytes = crypto.randomBytes(length);
  let password = "";

  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }

  return password;
};


const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}


// Add these types at the top of your file
interface MetricValue {
  timestamp: number;
  value: string | number;
}

interface CpuMetric {
  metric: {
    host_id: string;
    mode: 'idle' | 'iowait' | 'irq' | 'nice' | 'softirq' | 'steal' | 'system' | 'user';
  };
  values: [number, string][]; // [timestamp, value]
}

interface MonitoringResponse {
  data: {
    status: string;
    data: {
      resultType: string;
      result: CpuMetric[];
    };
  };
  matrix: CpuMetric[];
  message: string;
}

interface GraphData {
  labels: string[]; // Timestamps for X-axis
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}





export type DNSRecord =
  | { type: "A" | "AAAA" | "CNAME" | "MX" | "lookup"; records: Array<string | LookupInfo | MxRecord> }
  ;

export type LookupInfo = { address: string; family: number };

export type ResolveResult = {
  host: string;
  records: DNSRecord[];
  error: string | null;
};




export class Encryption {
  private static getKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
  }

  static encrypt(text: string, secretKey: string): EncryptedData {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.getKey(secretKey, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString("hex"),
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
      salt: salt.toString("hex"),
    };
  }

  static decrypt(encryptedData: EncryptedData, secretKey: string): string {
    const { encrypted, iv, tag, salt } = encryptedData;
    const key = this.getKey(secretKey, Buffer.from(salt, "hex"));

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "hex")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}

export function timeRange(hrs: number) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - hrs * 60 * 60;
  return { start, end };
}


export function transformCpuData(metrics: CpuMetric[]): GraphData {
  // Find the idle metric
  const idleMetric = metrics.find(m => m.metric.mode === 'idle');
  const userMetric = metrics.find(m => m.metric.mode === 'user');
  const systemMetric = metrics.find(m => m.metric.mode === 'system');

  console.log(idleMetric, userMetric, systemMetric, "...........metrics...........");
  
  if (!idleMetric || !userMetric || !systemMetric) {
    throw new Error('Missing required CPU metrics');
  }

  // Extract timestamps (convert to readable format)
  const labels = idleMetric.values.map(([timestamp]) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  });

  // Calculate CPU usage percentage
  // CPU Usage = (User + System) / (User + System + Idle) * 100
  const cpuUsageData = idleMetric.values.map(([timestamp, idleValue], index) => {
    const idle = parseFloat(idleValue);
    const user = parseFloat(userMetric.values[index][1]);
    const system = parseFloat(systemMetric.values[index][1]);
    
    const total = idle + user + system;
    const usage = total > 0 ? ((user + system) / total) * 100 : 0;
    
    return parseFloat(usage.toFixed(2));
  });

  return {
    labels,
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: cpuUsageData,
        borderColor: 'rgb(59, 130, 246)', // Blue
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
      },
      {
        label: 'User Mode (%)',
        data: userMetric.values.map(([, value]) => {
          const total = idleMetric.values[0] ? parseFloat(idleMetric.values[0][1]) : 1;
          return parseFloat(((parseFloat(value) / total) * 100).toFixed(2));
        }),
        borderColor: 'rgb(34, 197, 94)', // Green
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
      },
      {
        label: 'System Mode (%)',
        data: systemMetric.values.map(([, value]) => {
          const total = idleMetric.values[0] ? parseFloat(idleMetric.values[0][1]) : 1;
          return parseFloat(((parseFloat(value) / total) * 100).toFixed(2));
        }),
        borderColor: 'rgb(249, 115, 22)', // Orange
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
      }
    ]
  };
}


export function transformMemoryData(metrics: CpuMetric[]): GraphData {
  // Memory metrics would have different structure
  // This is a placeholder - adjust based on actual memory response
  const memoryMetric = metrics[0];
  
  const labels = memoryMetric.values.map(([timestamp]) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  });

  const memoryData = memoryMetric.values.map(([, value]) => {
    // Convert to GB if needed
    return parseFloat((parseFloat(value) / (1024*1024*1024)).toFixed(2));
  });

 // console.log(memoryData, "...........memoryData...........");

  return {
    labels,
    datasets: [
      {
        label: 'Free Memory (GB)',
        data: memoryData,
        borderColor: 'rgb(168, 85, 247)', // Purple
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
      }
    ]
  };
}


export function transformDiskData(metrics: CpuMetric[]): GraphData {
  const diskMetric = metrics[0];
  
  const labels = diskMetric.values.map(([timestamp]) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  });

  const diskData = diskMetric.values.map(([, value]) => {
    return parseFloat((parseFloat(value) / (1024*1024*1024)).toFixed(2)); // Convert to GB
  });

  return {
    labels,
    datasets: [
      {
        label: 'Free Disk Space (GB)',
        data: diskData,
        borderColor: 'rgb(236, 72, 153)', // Pink
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
      }
    ]
  };
}



export const getErrorMessage = (error: unknown, defaultMessage: string): string => {
  if (error instanceof AxiosError) {
    return error.response?.data?.error || defaultMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return defaultMessage;
};













// export function getHostFromUrl(urlOrHost: string): string | null {
//   if (!urlOrHost) return null;
//   const maybe = urlOrHost.trim();
//   const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(maybe) ? maybe : `http://${maybe}`;
//   try {
//     const u = new URL(withScheme);
//     return u.hostname;
//   } catch {
//     return null;
//   }
// }


export function createCertificateFile(certText:string, filename = "certificate.crt") {
  // MIME for x509 certificate (PEM). Some use "application/x-x509-ca-cert".
  const mime = "application/x-x509-ca-cert";
  const blob = new Blob([certText], { type: mime });
  // File constructor is widely supported in browsers
  return new File([blob], filename, { type: mime });
}

/**
 * Utility class to update user passwords in database connection strings.
 * Use-case: When a database user's password is reset (e.g., via DigitalOcean API),
 * the connection URIs (public_connection.uri, private_connection.uri) and password fields
 * need to be updated with the new password.
 * 
 * Supported formats:
 * - MongoDB: mongodb+srv://user:password@host/db
 * - PostgreSQL: postgresql://user:password@host:port/db
 * - MySQL: mysql://user:password@host:port/db
 */
export class ConnectionPasswordUpdater {
  /**
   * Updates the password in a database connection URI.
   * Handles two cases:
   * 1. URI has existing password: mongodb+srv://user:oldPass@host → mongodb+srv://user:newPass@host
   * 2. URI has no password: mongodb+srv://user@host → mongodb+srv://user:newPass@host
   * 
   * @param uri - The connection URI (decrypted)
   * @param username - The username whose password is being updated
   * @param newPassword - The new password (plaintext)
   * @returns The updated URI with the new password
   */
  static updatePasswordInUri(uri: string, username: string, newPassword: string): string {
    // Escape special regex characters in username
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Pattern 1: URI has existing password - ://username:anyPassword@
    const patternWithPassword = new RegExp(`(:\/\/${escapedUsername}:)[^@]*(@)`);
    
    // Pattern 2: URI has no password - ://username@ (no colon after username)
    const patternWithoutPassword = new RegExp(`(:\/\/${escapedUsername})(@)`);
    
    // First, try to replace existing password
    if (patternWithPassword.test(uri)) {
      return uri.replace(patternWithPassword, `$1${newPassword}$2`);
    }
    
    // If no existing password, insert password after username
    if (patternWithoutPassword.test(uri)) {
      return uri.replace(patternWithoutPassword, `$1:${newPassword}$2`);
    }
    
    // URI format doesn't match expected patterns, return original
    console.warn("[ConnectionPasswordUpdater] URI format not recognized, returning original");
    return uri;
  }

  /**
   * Checks if the value is an encrypted data object
   */
  static isEncryptedData(value: unknown): value is EncryptedData {
    return (
      typeof value === 'object' &&
      value !== null &&
      'encrypted' in value &&
      'iv' in value &&
      'tag' in value &&
      'salt' in value
    );
  }

  /**
   * Updates password in a URI (encrypted or plain string) and returns the new encrypted URI.
   * @param uri - The URI (can be EncryptedData object or plain string)
   * @param username - The username whose password is being updated
   * @param newPassword - The new password (plaintext)
   * @param encryptionKey - The encryption key
   * @returns The new encrypted URI object, or null if URI format is invalid
   */
  static updateEncryptedUri(
    uri: EncryptedData | string,
    username: string,
    newPassword: string,
    encryptionKey: string
  ): EncryptedData | null {
    try {
      let decryptedUri: string;

      // Check if URI is already encrypted or is a plain string
      if (this.isEncryptedData(uri)) {
        decryptedUri = Encryption.decrypt(uri, encryptionKey);
      } else if (typeof uri === 'string') {
        // URI is stored as plain string (shouldn't happen but handle gracefully)
        console.log("[ConnectionPasswordUpdater] URI is plain string, not encrypted");
        decryptedUri = uri;
      } else {
        console.error("[ConnectionPasswordUpdater] Invalid URI format:", typeof uri);
        return null;
      }

      const updatedUri = this.updatePasswordInUri(decryptedUri, username, newPassword);
      return Encryption.encrypt(updatedUri, encryptionKey);
    } catch (error) {
      console.error("[ConnectionPasswordUpdater] Error updating URI:", error);
      return null;
    }
  }
}