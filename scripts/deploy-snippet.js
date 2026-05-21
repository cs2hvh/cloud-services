// Load env vars from project root. Try .env first (what the rest of
// the repo uses) and fall back to .env.local for Next.js-style setups.
const path = require("path");
const fs = require("fs");
const candidates = [
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../.env.local"),
];
for (const p of candidates) {
  if (fs.existsSync(p)) require("dotenv").config({ path: p });
}

const { createClient } = require("@supabase/supabase-js");
const { Client } = require("ssh2");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Get all active hosts
  const { data: hosts } = await sb.from("proxmox_hosts").select("*").eq("is_active", true);

  for (const host of hosts) {
    const sshHost = new URL(host.host_url).hostname;
    const sshUser = (host.username || "root").split("@")[0];
    const sshPass = host.password;

    console.log("Setting up snippet on: " + sshHost);

    const snippet = `#cloud-config
ssh_pwauth: true
write_files:
  - path: /etc/ssh/sshd_config.d/99-cloud-init-pwauth.conf
    content: |
      PasswordAuthentication yes
    owner: root:root
    permissions: '0644'
runcmd:
  - mkdir -p /etc/ssh/sshd_config.d
  - sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
  - systemctl restart ssh 2>/dev/null; systemctl restart sshd 2>/dev/null; true
  - |
    # Fix /32 gateway routing for OVH-style routed IPs
    # Detect gateway and interface
    GW=$(grep -oP 'gateway4: \\K[0-9.]+' /etc/netplan/50-cloud-init.yaml 2>/dev/null)
    [ -z "$GW" ] && GW=$(grep -oP 'via \\K[0-9.]+' /etc/netplan/50-cloud-init.yaml 2>/dev/null | head -1)
    [ -z "$GW" ] && GW=$(grep -oP 'Gateway=\\K[0-9.]+' /run/systemd/network/*.network 2>/dev/null | head -1)
    DEV=$(ip -o link show | awk -F': ' '/ether/{print $2; exit}')
    if [ -n "$GW" ] && [ -n "$DEV" ]; then
      # Immediate fix for current boot
      ip route replace $GW/32 dev $DEV 2>/dev/null
      ip route replace default via $GW dev $DEV onlink 2>/dev/null
    fi
    # Write persistent netplan override for reboots (Ubuntu/Debian)
    # Uses 99-static.yaml so cloud-init's 50-cloud-init.yaml can't overwrite it
    if [ -n "$GW" ] && [ -n "$DEV" ] && [ -d /etc/netplan ]; then
      MYIP=$(ip -4 addr show $DEV | grep -oP 'inet \\K[0-9./]+' | head -1)
      MAC=$(ip link show $DEV | grep -oP 'link/ether \\K[0-9a-f:]+')
      DNS1=$(grep -oP 'nameserver \\K[0-9.]+' /etc/resolv.conf 2>/dev/null | sed -n '1p')
      DNS2=$(grep -oP 'nameserver \\K[0-9.]+' /etc/resolv.conf 2>/dev/null | sed -n '2p')
      [ -z "$DNS1" ] && DNS1="1.1.1.1"
      [ -z "$DNS2" ] && DNS2="8.8.8.8"
      cat > /etc/netplan/99-static.yaml <<NETEOF
    network:
      version: 2
      ethernets:
        $DEV:
          addresses:
          - $MYIP
          match:
            macaddress: $MAC
          nameservers:
            addresses:
            - $DNS1
            - $DNS2
          routes:
          - to: $GW/32
            scope: link
          - to: 0.0.0.0/0
            via: $GW
            on-link: true
          set-name: $DEV
    NETEOF
      chmod 600 /etc/netplan/99-static.yaml
      # Remove cloud-init's netplan so it doesn't conflict
      rm -f /etc/netplan/50-cloud-init.yaml
      # Disable cloud-init network management on future boots
      mkdir -p /etc/cloud/cloud.cfg.d
      echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
      netplan apply 2>/dev/null || true
    fi
    # Write persistent NetworkManager route for reboots (CentOS/RHEL)
    if [ -n "$GW" ] && [ -n "$DEV" ] && command -v nmcli >/dev/null 2>&1 && ! [ -d /etc/netplan ]; then
      CONN=$(nmcli -t -f NAME,DEVICE con show --active | grep ":$DEV$" | head -1 | cut -d: -f1)
      if [ -n "$CONN" ]; then
        nmcli con mod "$CONN" ipv4.routes "0.0.0.0/0 $GW" ipv4.route-metric 100 2>/dev/null
        nmcli con mod "$CONN" ipv4.gateway "$GW" 2>/dev/null
        nmcli con up "$CONN" 2>/dev/null || true
      fi
      # Disable cloud-init network management on future boots
      mkdir -p /etc/cloud/cloud.cfg.d
      echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
    fi`;

    await new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on("ready", () => {
        // Base64 encode the snippet content for reliable transfer
        const b64 = Buffer.from(snippet + "\n").toString("base64");
        const cmd = [
          "mkdir -p /var/lib/vz/snippets",
          "pvesm set " + (host.storage || "local") + " --content images,iso,vztmpl,snippets,rootdir 2>/dev/null || true",
          "echo '" + b64 + "' | base64 -d > /var/lib/vz/snippets/linux-cloud-init.yml",
          "echo '--- Deployed snippet ---'",
          "cat /var/lib/vz/snippets/linux-cloud-init.yml",
        ].join(" && ");
        conn.exec(cmd, (err, stream) => {
          if (err) { reject(err); return; }
          let out = "";
          stream.on("data", (d) => (out += d.toString()));
          stream.stderr.on("data", (d) => (out += d.toString()));
          stream.on("close", () => {
            console.log("  " + out.trim().replace(/\n/g, "\n  "));
            conn.end();
            resolve();
          });
        });
      });
      conn.on("error", reject);
      conn.connect({ host: sshHost, port: 22, username: sshUser, password: sshPass });
    });
  }
  console.log("\nDone. Snippet deployed to all hosts.");
  process.exit(0);
}
main();
