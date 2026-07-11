// Automated game-host onboarding — the code version of the manual dallas1
// bring-up. Given a machine's IP + root SSH, it: installs Docker + Wings,
// registers a Pterodactyl Location + Node, writes the Wings config, opens the
// firewall, creates port allocations, issues a TLS cert (when DNS resolves),
// starts Wings, and flips the game_hosts row to 'online'. Idempotent and
// resumable — every stage checks before doing.
//
// DNS: node FQDNs need a real A record for the cert + browser console. If the
// FQDN's zone is in our Cloudflare account we create it automatically; otherwise
// the pipeline surfaces the exact record to add and marks the host awaiting_dns
// (re-run once it resolves). Root password is used only during bootstrap and is
// never stored.

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error ssh2 has no type declarations
import { Client as SSHClient } from "ssh2";
import { promises as dns } from "node:dns";

import { createServiceClient } from "@/lib/supabase/server";
import { pterodactyl } from "@/lib/pterodactyl/client";
import { ensureNodeDnsRecord } from "@/lib/services/game/host-dns";

export interface OnboardParams {
  id: string; // game_hosts.id, e.g. 'dallas2'
  name: string;
  region: string; // slug, e.g. 'us-dallas'
  displayRegion: string; // 'Dallas, US'
  fqdn: string; // node hostname
  ip: string;
  sshPassword?: string;
  sshKey?: string;
  memoryMB: number; // allocatable to the panel node
  diskGB: number;
  memoryOverallocatePct?: number;
  cpuOversubscriptionRatio?: number;
  allowedGames?: string[] | null;
  adminEmail: string;
  /** Port ranges to register as allocations, "start-end". */
  portRanges?: string[];
}

const DEFAULT_PORT_RANGES = ["25565-25700", "28015-28215", "27015-27100", "30120-30320"];

async function setStage(hostId: string, stage: string, progress: number, message: string, status?: string) {
  const supabase = await createServiceClient();
  const patch: Record<string, unknown> = {
    provision: { stage, progress, message, updated_at: new Date().toISOString() },
  };
  if (status) patch.status = status;
  await supabase.from("game_hosts").update(patch).eq("id", hostId);
}

function ssh(params: OnboardParams, command: string, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("SSH command timed out"));
    }, timeoutMs);
    conn.on("ready", () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }
        let out = "";
        stream.on("data", (d: Buffer) => (out += d.toString()));
        stream.stderr.on("data", (d: Buffer) => (out += d.toString()));
        stream.on("close", () => {
          clearTimeout(timer);
          conn.end();
          resolve(out.trim());
        });
      });
    });
    conn.on("error", (err: any) => {
      clearTimeout(timer);
      reject(err);
    });
    conn.connect({
      host: params.ip,
      port: 22,
      username: "root",
      ...(params.sshKey ? { privateKey: params.sshKey } : { password: params.sshPassword }),
      readyTimeout: 20_000,
    });
  });
}

function expandPorts(ranges: string[]): string[] {
  const ports: string[] = [];
  for (const r of ranges) {
    const [a, b] = r.split("-").map((n) => parseInt(n, 10));
    if (!Number.isFinite(a)) continue;
    for (let p = a; p <= (Number.isFinite(b) ? b : a); p++) ports.push(String(p));
  }
  return ports;
}

async function resolvesTo(fqdn: string, ip: string): Promise<boolean> {
  try {
    const addrs = await dns.resolve4(fqdn);
    return addrs.includes(ip);
  } catch {
    return false;
  }
}

/**
 * Run (or resume) the onboarding pipeline. Safe to call repeatedly — each stage
 * is a no-op if already done. Returns the terminal status.
 */
export async function onboardGameHost(params: OnboardParams): Promise<{ status: string; message: string }> {
  const supabase = await createServiceClient();
  const portRanges = params.portRanges?.length ? params.portRanges : DEFAULT_PORT_RANGES;

  try {
    if (!pterodactyl.isConfigured()) throw new Error("Pterodactyl panel is not configured (PTERO_DOMAIN/PTERO_API_KEY)");

    // 1 · DNS ---------------------------------------------------------------
    await setStage(params.id, "dns", 10, "Ensuring DNS record", "provisioning");
    const dnsResult = await ensureNodeDnsRecord(params.fqdn, params.ip);
    if (!dnsResult.resolvable && !(await resolvesTo(params.fqdn, params.ip))) {
      await setStage(
        params.id,
        "awaiting_dns",
        15,
        `Add DNS A record: ${params.fqdn} → ${params.ip} (proxy OFF), then retry onboarding.`,
        "provisioning",
      );
      return { status: "awaiting_dns", message: `Add A record ${params.fqdn} → ${params.ip} (DNS-only), then re-run.` };
    }

    // 2 · SSH bootstrap (Docker + Wings + firewall) -------------------------
    await setStage(params.id, "bootstrap", 30, "Installing Docker, Wings, firewall");
    const firewallPorts = portRanges.map((r) => `ufw allow ${r}/tcp >/dev/null 2>&1; ufw allow ${r}/udp >/dev/null 2>&1`).join("; ");
    // No `set -e` + silent redirects (that swallowed real errors). Each step is
    // checked explicitly and, on failure, emits BOOTSTRAP_FAILED::<what> with the
    // captured stderr so the exact cause surfaces in the admin UI.
    const bootstrap = `export DEBIAN_FRONTEND=noninteractive
fail() { echo "BOOTSTRAP_FAILED::$1"; exit 1; }
# wait up to 90s for any first-boot apt lock (unattended-upgrades) to clear
for i in $(seq 1 45); do (fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1) && sleep 2 || break; done
# Docker
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh 2>/tmp/e || fail "download docker installer: $(cat /tmp/e)"
  sh /tmp/get-docker.sh >/tmp/docker.log 2>&1 || fail "docker install: $(tail -c 400 /tmp/docker.log)"
fi
systemctl enable --now docker >/tmp/e 2>&1 || fail "start docker: $(cat /tmp/e)"
# Wings (-f so an HTTP error is a failure, not a saved error page)
if [ ! -x /usr/local/bin/wings ] || ! /usr/local/bin/wings version >/dev/null 2>&1; then
  curl -fSL -o /usr/local/bin/wings "https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64" 2>/tmp/e || fail "download wings: $(cat /tmp/e)"
  chmod u+x /usr/local/bin/wings
fi
/usr/local/bin/wings version >/dev/null 2>/tmp/e || fail "wings binary not runnable (arch mismatch? $(uname -m)): $(cat /tmp/e)"
mkdir -p /etc/pterodactyl /var/lib/pterodactyl /var/log/pterodactyl /run/wings || fail "mkdir dirs"
cat > /etc/systemd/system/wings.service <<'UNIT'
[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service
Requires=docker.service
PartOf=docker.service
[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
PIDFile=/run/wings/daemon.pid
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload 2>/tmp/e || fail "daemon-reload: $(cat /tmp/e)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 8080/tcp >/dev/null 2>&1; ufw allow 2022/tcp >/dev/null 2>&1; ufw allow 80/tcp >/dev/null 2>&1; ufw allow 443/tcp >/dev/null 2>&1; ${firewallPorts}
fi
echo BOOTSTRAP_OK`;
    const bootOut = await ssh(params, bootstrap, 300_000);
    if (!bootOut.includes("BOOTSTRAP_OK")) {
      const m = /BOOTSTRAP_FAILED::([\s\S]+)/.exec(bootOut);
      const detail = m ? m[1].trim() : bootOut.trim().slice(-400) || "no output from node (SSH ran but returned nothing)";
      throw new Error(`Bootstrap failed — ${detail}`);
    }

    // 3 · Panel location + node --------------------------------------------
    await setStage(params.id, "panel-node", 50, "Registering node on the panel");
    const location =
      (await pterodactyl.findLocationByShort(params.region)) ??
      (await pterodactyl.createLocation(params.region, params.displayRegion));
    let node = await pterodactyl.findNodeByFqdn(params.fqdn);
    if (!node) {
      node = await pterodactyl.createNode({
        name: params.id,
        location_id: location.id,
        fqdn: params.fqdn,
        scheme: "https",
        memory: params.memoryMB,
        memory_overallocate: params.memoryOverallocatePct ?? 0,
        disk: params.diskGB * 1024,
        disk_overallocate: 0,
        upload_size: 100,
        daemon_sftp: 2022,
        daemon_listen: 8080,
      });
    }

    // 4 · Wings config ------------------------------------------------------
    await setStage(params.id, "wings-config", 65, "Writing Wings configuration");
    const config = await pterodactyl.getNodeConfiguration(node.id);
    // JSON is valid YAML except for the escaped forward slashes the panel emits.
    const configYaml = JSON.stringify(config).replace(/\\\//g, "/");
    const writeConfig = `cat > /etc/pterodactyl/config.yml <<'EOF'
${configYaml}
EOF
chmod 600 /etc/pterodactyl/config.yml && echo CONFIG_OK`;
    const cfgOut = await ssh(params, writeConfig, 60_000);
    if (!cfgOut.includes("CONFIG_OK")) throw new Error("Failed to write Wings config");

    // 5 · TLS cert ----------------------------------------------------------
    await setStage(params.id, "tls", 80, "Issuing TLS certificate");
    const certCmd = `export DEBIAN_FRONTEND=noninteractive
command -v certbot >/dev/null || apt-get install -y -qq certbot >/dev/null 2>&1
if [ ! -f /etc/letsencrypt/live/${params.fqdn}/fullchain.pem ]; then
  certbot certonly --standalone -d ${params.fqdn} --non-interactive --agree-tos -m ${params.adminEmail} >/dev/null 2>&1 || true
fi
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
echo '#!/bin/bash' > /etc/letsencrypt/renewal-hooks/deploy/restart-wings.sh
echo 'systemctl restart wings' >> /etc/letsencrypt/renewal-hooks/deploy/restart-wings.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-wings.sh
[ -f /etc/letsencrypt/live/${params.fqdn}/fullchain.pem ] && echo CERT_OK || echo CERT_MISSING`;
    const certOut = await ssh(params, certCmd, 180_000);
    if (!certOut.includes("CERT_OK")) {
      await setStage(params.id, "tls_failed", 82, `TLS issuance failed — check port 80 is reachable and ${params.fqdn} resolves to ${params.ip}.`);
      throw new Error("Certificate issuance failed (port 80 reachable? DNS correct?)");
    }

    // 6 · Allocations -------------------------------------------------------
    await setStage(params.id, "allocations", 90, "Creating port allocations");
    const created = await pterodactyl.createAllocations(node.id, params.ip, expandPorts(portRanges));

    // 7 · Start Wings + health check ---------------------------------------
    await setStage(params.id, "starting", 95, "Starting Wings");
    await ssh(params, "systemctl enable --now wings >/dev/null 2>&1; sleep 4; systemctl is-active wings", 60_000);
    let online = false;
    for (let i = 0; i < 6; i++) {
      const cfgToken = (config as { token?: string }).token;
      try {
        const health = await ssh(
          params,
          `curl -skS -o /dev/null -w '%{http_code}' https://${params.fqdn}:8080/api/system -H 'Authorization: Bearer ${cfgToken}'`,
          30_000,
        );
        if (health.trim() === "200") {
          online = true;
          break;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    if (!online) throw new Error("Wings started but the daemon health check did not pass");

    // 8 · finalize ----------------------------------------------------------
    await supabase
      .from("game_hosts")
      .update({
        status: "online",
        ptero_location_id: location.id,
        ptero_node_id: node.id,
        last_heartbeat_at: new Date().toISOString(),
        provision: { stage: "complete", progress: 100, message: `Online — ${created} allocations`, updated_at: new Date().toISOString() },
      })
      .eq("id", params.id);

    return { status: "online", message: `Node online with ${created} allocations` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[game-onboarding] ${params.id} failed:`, message);
    await supabase
      .from("game_hosts")
      .update({
        status: "failed",
        provision: { stage: "failed", progress: 100, message, updated_at: new Date().toISOString() },
      })
      .eq("id", params.id);
    return { status: "failed", message };
  }
}
