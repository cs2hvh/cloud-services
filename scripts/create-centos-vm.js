/**
 * Create a CentOS Stream 9 VM with a real OVH IP for manual testing.
 * The VM is left running — NOT destroyed.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("ssh2");

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}
const sb = createClient(
  process.env.SUPABASE_URL || "https://xafjjpgazdxhktpfeuri.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PASSWORD = "TestCentOS@2026!";
const TEMPLATE_VMID = 110;
const TEST_IP = "148.113.12.250";
const TEST_MAC = "00:50:56:08:6c:68";
const USER = "centos";

function sshExec(host, cmd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    const t = setTimeout(() => { c.end(); reject(new Error("timeout")); }, timeout);
    c.on("ready", () => {
      c.exec(cmd, (err, s) => {
        if (err) { clearTimeout(t); c.end(); reject(err); return; }
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", (code) => { clearTimeout(t); c.end(); resolve({ out: o.trim(), code }); });
      });
    });
    c.on("error", (e) => { clearTimeout(t); reject(e); });
    c.connect({ host: new URL(host.host_url).hostname, port: 22, username: "root", password: host.password });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const { data: h } = await sb.from("proxmox_hosts").select("*").eq("is_active", true).limit(1).single();
  const apiBase = h.host_url.replace(/\/+$/, "");
  const node = h.node;
  const bridge = h.bridge || "vmbr0";
  const gateway = h.gateway_ip;
  const dns1 = h.dns_primary || "8.8.8.8";
  const dns2 = h.dns_secondary || "1.1.1.1";

  // Auth
  const username = (h.username || "root").includes("@") ? h.username : h.username + "@pam";
  const ticketRes = await fetch(apiBase + "/api2/json/access/ticket", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password: h.password }),
  });
  const ticketJson = await ticketRes.json();
  const auth = {
    Cookie: "PVEAuthCookie=" + ticketJson.data.ticket,
    CSRFPreventionToken: ticketJson.data.CSRFPreventionToken,
  };

  async function pveGet(path) {
    const res = await fetch(apiBase + path, { headers: auth });
    if (!res.ok) throw new Error("GET " + path + ": " + res.status);
    return (await res.json()).data;
  }
  async function pvePost(path, data) {
    const body = new URLSearchParams();
    Object.entries(data).forEach(([k, v]) => body.append(k, String(v)));
    const res = await fetch(apiBase + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...auth },
      body,
    });
    if (!res.ok) throw new Error("POST " + path + ": " + res.status + " " + (await res.text()));
    return (await res.json()).data;
  }
  async function pvePut(path, data) {
    const body = new URLSearchParams();
    Object.entries(data || {}).forEach(([k, v]) => body.append(k, String(v)));
    const res = await fetch(apiBase + path, {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...auth },
      body,
    });
    if (!res.ok) throw new Error("PUT " + path + ": " + res.status);
    return (await res.json()).data;
  }
  async function waitTask(upid, timeout = 300000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const st = await pveGet("/api2/json/nodes/" + node + "/tasks/" + encodeURIComponent(upid) + "/status");
      if (st.status === "stopped") {
        if (String(st.exitstatus).toUpperCase() === "OK") return;
        throw new Error("Task failed: " + st.exitstatus);
      }
      await sleep(2000);
    }
    throw new Error("Task timeout");
  }

  console.log("=== Creating CentOS Stream 9 VM ===\n");

  // 1. Get next VMID
  const vmid = Number(await pveGet("/api2/json/cluster/nextid"));
  console.log("1. VMID: " + vmid);

  // 2. Clone
  console.log("2. Cloning template " + TEMPLATE_VMID + "...");
  const cloneUpid = await pvePost(
    "/api2/json/nodes/" + node + "/qemu/" + TEMPLATE_VMID + "/clone",
    { newid: vmid, name: "centos9-test", full: 1, target: node, storage: h.storage || "local" }
  );
  await waitTask(cloneUpid);
  console.log("   Clone complete");

  // 3. Configure
  console.log("3. Configuring...");
  try { await pvePost("/api2/json/nodes/" + node + "/qemu/" + vmid + "/config", { delete: "vcpus" }); } catch {}

  await pvePost("/api2/json/nodes/" + node + "/qemu/" + vmid + "/config", {
    cpu: "host",
    sockets: 1,
    cores: 2,
    memory: 2048,
    onboot: 1,
    nameserver: dns1 + " " + dns2,
    net0: "virtio=" + TEST_MAC + ",bridge=" + bridge + ",rate=4",
    ipconfig0: "ip=" + TEST_IP + "/32,gw=" + gateway,
    ciuser: USER,
    cipassword: PASSWORD,
    cicustom: "vendor=local:snippets/linux-cloud-init.yml",
  });

  // Remove CD-ROMs
  const cfg = await pveGet("/api2/json/nodes/" + node + "/qemu/" + vmid + "/config");
  const cdroms = Object.keys(cfg).filter(k => typeof cfg[k] === "string" && cfg[k].includes("media=cdrom") && !cfg[k].includes("cloudinit"));
  if (cdroms.length > 0) {
    await pvePost("/api2/json/nodes/" + node + "/qemu/" + vmid + "/config", { delete: cdroms.join(",") });
    console.log("   Removed CD-ROMs: " + cdroms.join(", "));
  }

  // Regenerate cloud-init
  try { await pvePut("/api2/json/nodes/" + node + "/qemu/" + vmid + "/cloudinit", {}); } catch {}
  console.log("   Configured");

  // 4. Add host route
  console.log("4. Adding host route...");
  await sshExec(h, "ip route replace " + TEST_IP + "/32 dev " + bridge);

  // 5. Remove stale known_hosts
  await sshExec(h, "ssh-keygen -R " + TEST_IP + " 2>/dev/null || true");

  // 6. Start
  console.log("5. Starting...");
  const startUpid = await pvePost("/api2/json/nodes/" + node + "/qemu/" + vmid + "/status/start", {});
  if (startUpid) await waitTask(startUpid, 60000).catch(() => {});
  console.log("   Started");

  // 7. Wait for guest agent
  console.log("6. Waiting for guest agent...");
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    try {
      const ping = await sshExec(h, "qm agent " + vmid + " ping 2>&1", 8000);
      if (!ping.out.includes("error") && !ping.out.includes("not running") && !ping.out.includes("No QEMU")) {
        console.log("   Guest agent OK at " + ((i + 1) * 5) + "s");
        break;
      }
    } catch {}
    if (i % 6 === 5) console.log("   Still waiting... (" + ((i + 1) * 5) + "s)");
    if (i === 59) console.log("   Guest agent did NOT respond (try SSH anyway)");
  }

  // 8. Wait for cloud-init then verify SSH
  console.log("7. Waiting 30s for cloud-init, then testing SSH...");
  await sleep(30000);

  let sshOk = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const sr = await sshExec(
        h,
        'sshpass -p "' + PASSWORD + '" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 ' +
        USER + "@" + TEST_IP + ' "echo SSH_OK && uname -a && cat /etc/os-release | head -3" 2>&1',
        30000
      );
      if (sr.out.includes("SSH_OK")) {
        console.log("   SSH verified OK");
        sshOk = true;
        break;
      }
    } catch {}
    if (attempt < 4) { console.log("   Retrying SSH in 10s..."); await sleep(10000); }
  }

  console.log("\n========================================");
  console.log("  CentOS Stream 9 VM is READY");
  console.log("========================================");
  console.log("  VMID:     " + vmid);
  console.log("  IP:       " + TEST_IP);
  console.log("  User:     " + USER);
  console.log("  Password: " + PASSWORD);
  console.log("  SSH:      ssh " + USER + "@" + TEST_IP);
  console.log("  Status:   " + (sshOk ? "SSH verified" : "SSH not verified - may need more time"));
  console.log("========================================\n");
})();
