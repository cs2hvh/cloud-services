/**
 * TLS-socket implementation of SslProbePort.
 *
 * Uses Node.js `tls.connect` to inspect the certificate a hostname presents
 * without validating its chain.  This is intentionally a Node.js-only adapter
 * — other runtimes or environments can supply a different SslProbePort
 * implementation (e.g. HTTP-based checker, external API) without touching the
 * domain service or its ports.
 */
import * as tls from "tls";
import type { SslProbePort, TlsCertInfo } from "@/lib/domain-service/core/ports";

export class TlsSocketSslProbeAdapter implements SslProbePort {
  constructor(private readonly timeoutMs: number = 8_000) {}

  probe(hostname: string): Promise<TlsCertInfo | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: TlsCertInfo | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      try {
        const socket = tls.connect(
          { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false },
          () => {
            try {
              const cert = socket.getPeerCertificate();
              socket.destroy();
              if (cert && Object.keys(cert).length > 0) {
                const commonName =
                  typeof cert.subject?.CN === "string"
                    ? normalizeCertName(cert.subject.CN)
                    : undefined;
                const sans = parseDnsSans(cert.subjectaltname);
                finish({
                  issuer: JSON.stringify(cert.issuer ?? {}).toLowerCase(),
                  ...(commonName ? { common_name: commonName } : {}),
                  ...(sans.length > 0 ? { sans } : {}),
                });
              } else {
                finish(null);
              }
            } catch {
              socket.destroy();
              finish(null);
            }
          }
        );
        socket.setTimeout(this.timeoutMs, () => { socket.destroy(); finish(null); });
        socket.on("error", () => finish(null));
      } catch {
        finish(null);
      }
    });
  }
}

function normalizeCertName(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function parseDnsSans(subjectAltName?: string): string[] {
  if (!subjectAltName || typeof subjectAltName !== "string") return [];
  return subjectAltName
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.toLowerCase().startsWith("dns:"))
    .map((part) => normalizeCertName(part.slice(4)))
    .filter(Boolean);
}
