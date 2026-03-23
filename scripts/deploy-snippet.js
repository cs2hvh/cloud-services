process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("ssh2");

const sb = createClient(
  "https://xafjjpgazdxhktpfeuri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmpqcGdhemR4aGt0cGZldXJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjA1ODU3MiwiZXhwIjoyMDY3NjM0NTcyfQ.lWrNK4jO0xM0j9Hcb-0i8rhojswcCuh_-Qbg80RoKqE"
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
    [ -z "$GW" ] && GW=$(grep -oP 'Gateway=\\K[0-9.]+' /run/systemd/network/*.network 2>/dev/null | head -1)
    DEV=$(ip -o link show | awk -F': ' '/ether/{print $2; exit}')
    if [ -n "$GW" ] && [ -n "$DEV" ] && ! ip route show default 2>/dev/null | grep -q via; then
      ip route replace $GW/32 dev $DEV 2>/dev/null
      ip route replace default via $GW dev $DEV onlink 2>/dev/null
    fi
    # Write persistent netplan override for reboots
    if [ -n "$GW" ] && [ -n "$DEV" ] && [ -d /etc/netplan ]; then
      MYIP=$(ip -4 addr show $DEV | grep -oP 'inet \\K[0-9./]+' | head -1)
      MAC=$(ip link show $DEV | grep -oP 'link/ether \\K[0-9a-f:]+')
      DNS=$(grep -oP 'nameserver \\K[0-9.]+' /etc/resolv.conf 2>/dev/null | head -2 | tr '\\n' ',' | sed 's/,$//')
      cat > /etc/netplan/50-cloud-init.yaml << NETEOF
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
                    - $DNS
                routes:
                - to: 0.0.0.0/0
                  via: $GW
                  on-link: true
                set-name: $DEV
    NETEOF
      sed -i 's/^    //' /etc/netplan/50-cloud-init.yaml
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
