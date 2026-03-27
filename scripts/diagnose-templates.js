process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("ssh2");

const sb = createClient(
  "https://xafjjpgazdxhktpfeuri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmpqcGdhemR4aGt0cGZldXJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjA1ODU3MiwiZXhwIjoyMDY3NjM0NTcyfQ.lWrNK4jO0xM0j9Hcb-0i8rhojswcCuh_-Qbg80RoKqE"
);

function createSSH(host) {
  const sshHost = new URL(host.host_url).hostname;
  const sshUser = (host.username || "root").split("@")[0];
  const sshPass = host.password;

  return function ssh(cmd, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const timer = setTimeout(() => {
        conn.end();
        reject(new Error("SSH timeout (" + (timeout / 1000) + "s)"));
      }, timeout);
      conn.on("ready", () => {
        conn.exec(cmd, (err, stream) => {
          if (err) { clearTimeout(timer); conn.end(); reject(err); return; }
          let output = "";
          stream.on("data", (d) => (output += d.toString()));
          stream.stderr.on("data", (d) => (output += d.toString()));
          stream.on("close", (code) => {
            clearTimeout(timer);
            conn.end();
            resolve({ out: output.trim(), code });
          });
        });
      });
      conn.on("error", (err) => { clearTimeout(timer); reject(err); });
      conn.connect({ host: sshHost, port: 22, username: sshUser, password: sshPass });
    });
  };
}

async function main() {
  const { data: host } = await sb.from("proxmox_hosts").select("*").eq("is_active", true).limit(1).single();
  const ssh = createSSH(host);

  console.log("=== DIAGNOSTICS ===\n");

  // 1. Check Ubuntu 22.04 image
  console.log("[1] Ubuntu 22.04 cloud image:");
  let r = await ssh("qemu-img info /tmp/ubuntu-22.04-server-cloudimg-amd64.img 2>&1");
  console.log(r.out);

  // 2. Check Debian 12 image
  console.log("\n[2] Debian 12 cloud image:");
  r = await ssh("qemu-img info /tmp/debian-12-generic-amd64.qcow2 2>&1");
  console.log(r.out);

  // 3. Check Debian 13 image
  console.log("\n[3] Debian 13 cloud image:");
  r = await ssh("qemu-img info /tmp/debian-13-generic-amd64.qcow2 2>&1");
  console.log(r.out);

  // 4. Check current VM statuses
  console.log("\n[4] VM statuses:");
  r = await ssh("qm list 2>&1");
  console.log(r.out);

  // 5. Check disk files for 107, 108, 109
  console.log("\n[5] Disk files:");
  r = await ssh("ls -la /var/lib/vz/images/107/ /var/lib/vz/images/108/ /var/lib/vz/images/109/ 2>&1");
  console.log(r.out);

  // 6. Check current cloud-init snippets
  console.log("\n[6] Snippets:");
  r = await ssh("ls -la /var/lib/vz/snippets/ 2>&1");
  console.log(r.out);

  // 7. Check known_hosts
  console.log("\n[7] Known hosts entries for 10.10.10.100:");
  r = await ssh("grep 10.10.10.100 ~/.ssh/known_hosts 2>&1 || echo NONE");
  console.log(r.out);

  process.exit(0);
}
main();
