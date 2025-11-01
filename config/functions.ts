import * as crypto from "crypto";
// import { lookup, resolve4, resolve6, resolveCname, resolveMx } from "dns/promises";
import type { MxRecord } from "dns";

export const generateStrongPassword = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";

  for (let i = 0; i < 12; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
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
    return parseFloat((parseFloat(value) / 1024).toFixed(2));
  });

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
    return parseFloat((parseFloat(value) / 1024).toFixed(2)); // Convert to GB
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