/**
 * Reusable Linux Cloud Template Creator for Proxmox VE
 * 
 * Creates VM templates from cloud images, installs qemu-guest-agent,
 * tests SSH + guest agent, and registers in the database.
 * 
 * Usage: node scripts/create-linux-template.js [--host-id <id>]
 * 
 * Not tightly coupled to any host — reads host config from DB.
 * Can be run against any Proxmox host by passing --host-id.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { createClient } = require("@supabase/supabase-js");
const { Client } = require("ssh2");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xafjjpgazdxhktpfeuri.supabase.co";
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Template Definitions ──────────────────────────────────────────────
// Add new OS templates here. The script handles everything else.
const TEMPLATES = [
  {
    vmid: 107,
    name: "ubuntu-server-22-template",
    dbName: "Ubuntu Server 22.04",
    osType: "ubuntu-server-22",
    osDisplayName: "Ubuntu Server 22.04 LTS",
    cloudImageUrl: "https://cloud-images.ubuntu.com/releases/22.04/release/ubuntu-22.04-server-cloudimg-amd64.img",
    cloudImageFile: "ubuntu-22.04-server-cloudimg-amd64.img",
    defaultUser: "ubuntu",
  },
  {
    vmid: 108,
    name: "debian-12-template",
    dbName: "Debian 12",
    osType: "debian-12",
    osDisplayName: "Debian 12 (Bookworm)",
    cloudImageUrl: "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2",
    cloudImageFile: "debian-12-generic-amd64.qcow2",
    defaultUser: "ubuntu", // We override with ciuser anyway
  },
  {
    vmid: 109,
    name: "debian-13-template",
    dbName: "Debian 13",
    osType: "debian-13",
    osDisplayName: "Debian 13 (Trixie)",
    cloudImageUrl: "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2",
    cloudImageFile: "debian-13-generic-amd64.qcow2",
    defaultUser: "ubuntu",
  },
  {
    vmid: 110,
    name: "centos-stream-9-template",
    dbName: "CentOS Stream 9",
    osType: "centos-stream-9",
    osDisplayName: "CentOS Stream 9",
    cloudImageUrl: "https://cloud.centos.org/centos/9-stream/x86_64/images/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2",
    cloudImageFile: "CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2",
    defaultUser: "centos",
  },
];

// ── NAT Setup for Internet During Template Build ──────────────────────
const NAT_SUBNET = "10.10.10";
const NAT_HOST_IP = NAT_SUBNET + ".1";
const NAT_VM_IP = NAT_SUBNET + ".100";
const NAT_CIDR = NAT_SUBNET + ".0/24";

// ── SSH Helper ────────────────────────────────────────────────────────
function createSSH(host) {
  const sshHost = new URL(host.host_url).hostname;
  const sshUser = (host.username || "root").split("@")[0];
  const sshPass = host.password;

  return function ssh(cmd, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const timer = setTimeout(() => {
        conn.end();
        reject(new Error("SSH timeout (" + (timeout/1000) + "s): " + cmd.substring(0, 60)));
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

// ── Create One Template ───────────────────────────────────────────────
async function createTemplate(ssh, tpl, host) {
  const V = tpl.vmid;
  const S = host.storage || "local";
  const imgPath = "/tmp/" + tpl.cloudImageFile;

  console.log("\n" + "═".repeat(60));
  console.log("  Creating: " + tpl.dbName + " (VMID " + V + ")");
  console.log("═".repeat(60));

  // 1. Download cloud image
  console.log("\n  [1/6] Cloud image...");
  let r = await ssh("ls " + imgPath + " 2>/dev/null || echo MISSING");
  if (r.out.includes("MISSING")) {
    console.log("    Downloading " + tpl.cloudImageFile + "...");
    r = await ssh("wget -q -O " + imgPath + " " + tpl.cloudImageUrl + " && echo DOWNLOAD_OK", 600000);
    if (!r.out.includes("DOWNLOAD_OK")) {
      console.error("    FAILED to download: " + r.out.substring(0, 200));
      return false;
    }
    console.log("    Downloaded");
  } else {
    console.log("    Already cached");
  }

  // 2. Destroy old VM
  console.log("  [2/6] Cleanup old VM...");
  r = await ssh("qm status " + V + " 2>/dev/null || echo NOT_FOUND");
  if (!r.out.includes("NOT_FOUND")) {
    // Un-template if needed, then destroy
    await ssh("qm set " + V + " --template 0 2>/dev/null || true");
    await ssh("qm stop " + V + " --skiplock 2>/dev/null || true");
    await new Promise((r) => setTimeout(r, 3000));
    await ssh("qm destroy " + V + " --purge --skiplock 2>/dev/null || true");
    console.log("    Old VM destroyed");
  } else {
    console.log("    VMID free");
  }

  // 3. Create VM + import disk
  console.log("  [3/6] Create VM + import disk...");
  await ssh([
    "qm create " + V,
    "--name " + tpl.name,
    "--ostype l26",
    "--scsihw virtio-scsi-single",
    "--cores 2 --sockets 1 --memory 2048",
    "--net0 virtio,bridge=" + (host.bridge || "vmbr0"),
    "--agent 1,fstrim_cloned_disks=1",
    "--serial0 socket",
    "--vga serial0",
  ].join(" "));

  r = await ssh("qm importdisk " + V + " " + imgPath + " " + S + " --format qcow2", 300000);
  console.log("    " + r.out.split("\n").pop());

  await ssh("qm set " + V + " --scsi0 " + S + ":" + V + "/vm-" + V + "-disk-0.qcow2,discard=on,iothread=1,ssd=1");
  await ssh("qm set " + V + " --ide2 " + S + ":cloudinit");
  await ssh("qm set " + V + " --boot order=scsi0");
  console.log("    VM created, disk attached");

  // 4. Vendor snippet for qemu-guest-agent install
  console.log("  [4/6] Install qemu-guest-agent...");
  const snippetName = "setup-" + tpl.osType + ".yml";
  const snippet = `#cloud-config
package_update: true
packages:
  - qemu-guest-agent
runcmd:
  - systemctl enable qemu-guest-agent
  - systemctl start qemu-guest-agent`;

  await ssh("mkdir -p /var/lib/vz/snippets");
  await ssh("pvesm set " + S + " --content images,iso,vztmpl,snippets,rootdir 2>/dev/null || true");
  await ssh("cat > /var/lib/vz/snippets/" + snippetName + " << 'VENDOREOF'\n" + snippet + "\nVENDOREOF");

  // Configure cloud-init with temp network
  await ssh([
    "qm set " + V,
    "--ciuser " + tpl.defaultUser,
    "--cipassword TempSetup2024!",
    "--ipconfig0 ip=" + NAT_VM_IP + "/24,gw=" + NAT_HOST_IP,
    "--nameserver 8.8.8.8",
    "--cicustom vendor=" + S + ":snippets/" + snippetName,
  ].join(" "));

  // Setup NAT
  await ssh("ip addr add " + NAT_HOST_IP + "/24 dev " + (host.bridge || "vmbr0") + " 2>/dev/null || true");
  await ssh("iptables -t nat -C POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE");

  // Start VM
  await ssh("qm start " + V);
  console.log("    VM booting, waiting for guest agent...");

  // Wait for guest agent
  let agentOk = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const ping = await ssh("qm agent " + V + " ping 2>&1", 8000);
      if (!ping.out.includes("error") && !ping.out.includes("not running") && !ping.out.includes("No QEMU")) {
        console.log("    Guest agent responding (" + ((i+1)*5) + "s)");
        agentOk = true;
        break;
      }
    } catch(e) {}
    if (i % 12 === 11) console.log("    Still waiting... (" + ((i+1)*5) + "s)");
  }

  if (!agentOk) {
    // Fallback: try SSH install (supports both apt and dnf based distros)
    console.log("    Agent not responding, trying SSH fallback...");
    await ssh("which sshpass >/dev/null 2>&1 || apt-get install -y sshpass 2>/dev/null || dnf install -y sshpass 2>/dev/null || true", 30000);
    const installCmd = "sudo sh -c 'if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -yqq qemu-guest-agent; elif command -v dnf >/dev/null 2>&1; then dnf install -y qemu-guest-agent; elif command -v yum >/dev/null 2>&1; then yum install -y qemu-guest-agent; fi && systemctl enable qemu-guest-agent && systemctl start qemu-guest-agent && echo INSTALL_OK'";
    const sshResult = await ssh(
      "sshpass -p TempSetup2024! ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 " + tpl.defaultUser + "@" + NAT_VM_IP +
      " '" + installCmd + "' 2>&1",
      180000
    );
    if (sshResult.out.includes("INSTALL_OK")) {
      console.log("    Installed via SSH fallback");
      agentOk = true;
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      console.error("    FAILED: Could not install guest agent");
      console.error("    " + sshResult.out.substring(0, 300));
    }
  }

  // 5. Clean cloud-init state + shutdown
  console.log("  [5/6] Seal template...");
  // Clean cloud-init state so it runs fresh on each clone
  try {
    await ssh("qm guest exec " + V + " -- cloud-init clean --logs 2>&1", 15000);
  } catch(e) {
    await ssh(
      "sshpass -p TempSetup2024! ssh -o StrictHostKeyChecking=no " + tpl.defaultUser + "@" + NAT_VM_IP +
      " 'sudo cloud-init clean --logs' 2>&1 || true", 15000
    );
  }

  // Shutdown
  await ssh("qm shutdown " + V + " --timeout 30 2>/dev/null || qm stop " + V);
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    r = await ssh("qm status " + V);
    if (r.out.includes("stopped")) break;
  }

  // Clean up temp config
  await ssh("qm set " + V + " --delete cicustom 2>/dev/null || true");
  await ssh("qm set " + V + " --delete cipassword --delete nameserver --ipconfig0 '' --ciuser " + tpl.defaultUser + " 2>/dev/null || true");

  // 6. Convert to template
  console.log("  [6/6] Convert to template...");
  await ssh("qm template " + V);

  // Cleanup NAT (will be re-added for the next template if needed)
  await ssh("ip addr del " + NAT_HOST_IP + "/24 dev " + (host.bridge || "vmbr0") + " 2>/dev/null || true");
  await ssh("iptables -t nat -D POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE 2>/dev/null || true");
  await ssh("rm -f /var/lib/vz/snippets/" + snippetName);

  console.log("  TEMPLATE CREATED: VMID " + V);
  return agentOk;
}

// ── Test One Template ─────────────────────────────────────────────────
async function testTemplate(ssh, tpl, host) {
  const TEMPLATE_VMID = tpl.vmid;
  const TEST_VMID = 250;
  const bridge = host.bridge || "vmbr0";

  console.log("\n  Testing " + tpl.dbName + " (clone " + TEMPLATE_VMID + " → " + TEST_VMID + ")...");

  // Cleanup old test VM
  await ssh("qm stop " + TEST_VMID + " --skiplock 2>/dev/null; qm destroy " + TEST_VMID + " --purge --skiplock 2>/dev/null || true");

  // Clone
  console.log("    Cloning...");
  await ssh("qm clone " + TEMPLATE_VMID + " " + TEST_VMID + " --name test-" + tpl.osType + " --full", 300000);

  // Configure
  await ssh("ip addr add " + NAT_HOST_IP + "/24 dev " + bridge + " 2>/dev/null || true");
  await ssh("iptables -t nat -C POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE");
  const testUser = tpl.defaultUser || "ubuntu";
  await ssh("qm set " + TEST_VMID + " --ciuser " + testUser + " --cipassword TestPass2024! --ipconfig0 ip=" + NAT_VM_IP + "/24,gw=" + NAT_HOST_IP + " --nameserver 8.8.8.8");

  // Start
  console.log("    Booting...");
  await ssh("qm start " + TEST_VMID);

  const results = {
    guestAgent: false,
    ssh: false,
    network: false,
    passwordAuth: false,
    os: tpl.dbName,
  };

  // Wait for guest agent
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const ping = await ssh("qm agent " + TEST_VMID + " ping 2>&1", 8000);
      if (!ping.out.includes("error") && !ping.out.includes("not running") && !ping.out.includes("No QEMU")) {
        results.guestAgent = true;
        console.log("    Guest agent: OK (" + ((i+1)*5) + "s)");
        break;
      }
    } catch(e) {}
    if (i % 6 === 5) console.log("    Waiting for agent... (" + ((i+1)*5) + "s)");
  }

  if (results.guestAgent) {
    // Check network
    try {
      const net = await ssh("qm agent " + TEST_VMID + " network-get-interfaces 2>&1", 10000);
      if (net.out.includes(NAT_VM_IP)) {
        results.network = true;
        console.log("    Network config: OK (IP " + NAT_VM_IP + " assigned)");
      } else {
        console.log("    Network: IP not found in interfaces");
      }
    } catch(e) {
      console.log("    Network check failed:", e.message);
    }
  }

  // Test SSH (with a small delay for sshd to be ready)
  await new Promise((r) => setTimeout(r, 5000));
  await ssh("apt-get install -y sshpass 2>/dev/null || true", 30000);
  try {
    const sshResult = await ssh(
      "sshpass -p TestPass2024! ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 " + testUser + "@" + NAT_VM_IP +
      " 'echo SSH_OK; id; uname -a; cat /etc/os-release | head -3' 2>&1", 20000
    );
    if (sshResult.out.includes("SSH_OK")) {
      results.ssh = true;
      results.passwordAuth = true;
      console.log("    SSH login: OK");
      console.log("    Password auth: OK");
      // Print OS info
      const lines = sshResult.out.split("\n").filter(l => !l.includes("SSH_OK"));
      for (const l of lines.slice(0, 4)) console.log("      " + l);
    } else {
      console.log("    SSH: FAILED - " + sshResult.out.substring(0, 100));
    }
  } catch(e) {
    console.log("    SSH: FAILED - " + e.message);
  }

  // Security check: verify root login is disabled
  try {
    const rootTest = await ssh(
      "sshpass -p TestPass2024! ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@" + NAT_VM_IP +
      // Note: root test always uses 'root' regardless of template user
     
      " 'echo ROOT_OK' 2>&1", 10000
    );
    if (rootTest.out.includes("ROOT_OK")) {
      console.log("    Security WARNING: Root SSH login is ENABLED");
    } else {
      console.log("    Security: Root SSH login blocked (good)");
    }
  } catch(e) {
    console.log("    Security: Root SSH login blocked (good)");
  }

  // Cleanup
  console.log("    Cleaning up test VM...");
  await ssh("qm stop " + TEST_VMID + " --skiplock 2>/dev/null || true");
  await new Promise((r) => setTimeout(r, 3000));
  await ssh("qm destroy " + TEST_VMID + " --purge --skiplock 2>/dev/null || true");
  await ssh("ip addr del " + NAT_HOST_IP + "/24 dev " + bridge + " 2>/dev/null || true");
  await ssh("iptables -t nat -D POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE 2>/dev/null || true");

  return results;
}

// ── Register Templates in Database ────────────────────────────────────
async function registerTemplates(sb, hostId, templates) {
  console.log("\n" + "═".repeat(60));
  console.log("  Registering templates in database");
  console.log("═".repeat(60));

  for (const tpl of templates) {
    // Check if already exists
    const { data: existing } = await sb
      .from("proxmox_templates")
      .select("id")
      .eq("host_id", hostId)
      .eq("vmid", tpl.vmid)
      .maybeSingle();

    if (existing) {
      // Update
      const { error } = await sb
        .from("proxmox_templates")
        .update({
          name: tpl.dbName,
          os_type: tpl.osType,
          os_display_name: tpl.osDisplayName,
          is_active: true,
        })
        .eq("id", existing.id);
      if (error) console.error("  Update failed for " + tpl.dbName + ":", error.message);
      else console.log("  Updated: " + tpl.dbName + " (VMID " + tpl.vmid + ")");
    } else {
      // Insert
      const { error } = await sb
        .from("proxmox_templates")
        .insert({
          host_id: hostId,
          vmid: tpl.vmid,
          name: tpl.dbName,
          os_type: tpl.osType,
          os_display_name: tpl.osDisplayName,
          is_active: true,
        });
      if (error) console.error("  Insert failed for " + tpl.dbName + ":", error.message);
      else console.log("  Registered: " + tpl.dbName + " (VMID " + tpl.vmid + ")");
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Parse --host-id argument (optional)
  const hostIdArg = process.argv.find((a, i) => process.argv[i-1] === "--host-id");
  // Parse --vmid argument to create only specific template(s)
  const vmidArg = process.argv.find((a, i) => process.argv[i-1] === "--vmid");

  let host;
  if (hostIdArg) {
    const { data, error } = await sb.from("proxmox_hosts").select("*").eq("id", hostIdArg).single();
    if (error || !data) {
      console.error("Host not found:", hostIdArg);
      process.exit(1);
    }
    host = data;
  } else {
    // Use the first active host
    const { data, error } = await sb.from("proxmox_hosts").select("*").eq("is_active", true).limit(1).single();
    if (error || !data) {
      console.error("No active host found");
      process.exit(1);
    }
    host = data;
  }

  // Filter templates if --vmid is specified
  const templatesToCreate = vmidArg
    ? TEMPLATES.filter(t => t.vmid === Number(vmidArg))
    : TEMPLATES;

  if (templatesToCreate.length === 0) {
    console.error("No template found for VMID:", vmidArg);
    process.exit(1);
  }

  const sshHost = new URL(host.host_url).hostname;
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║  Linux Cloud Template Creator                            ║");
  console.log("╠" + "═".repeat(58) + "╣");
  console.log("║  Host: " + sshHost.padEnd(50) + "║");
  console.log("║  Node: " + (host.node || "").padEnd(50) + "║");
  console.log("║  Storage: " + (host.storage || "local").padEnd(47) + "║");
  console.log("║  Templates: " + templatesToCreate.map(t => t.vmid).join(", ").padEnd(45) + "║");
  console.log("╚" + "═".repeat(58) + "╝");

  const ssh = createSSH(host);

  // Verify SSH connectivity
  console.log("\nVerifying SSH connectivity...");
  const r = await ssh("hostname && uptime");
  console.log("  " + r.out);

  // Create templates
  const created = [];
  for (const tpl of templatesToCreate) {
    try {
      const ok = await createTemplate(ssh, tpl, host);
      if (ok) created.push(tpl);
      else console.error("  WARNING: " + tpl.dbName + " created but agent test failed");
    } catch(e) {
      console.error("  ERROR creating " + tpl.dbName + ":", e.message);
    }
  }

  // Register in database
  if (created.length > 0) {
    await registerTemplates(sb, host.id, created);
  }

  // Test all created templates
  console.log("\n" + "═".repeat(60));
  console.log("  Running Integration Tests");
  console.log("═".repeat(60));

  const testResults = [];
  for (const tpl of created) {
    try {
      const result = await testTemplate(ssh, tpl, host);
      testResults.push(result);
    } catch(e) {
      console.error("  Test FAILED for " + tpl.dbName + ":", e.message);
      testResults.push({ os: tpl.dbName, guestAgent: false, ssh: false, network: false, passwordAuth: false });
    }
  }

  // Print summary
  console.log("\n" + "═".repeat(60));
  console.log("  RESULTS SUMMARY");
  console.log("═".repeat(60));
  console.log("  " + "OS".padEnd(25) + "Agent  SSH    Network  PwdAuth");
  console.log("  " + "─".repeat(55));
  for (const r of testResults) {
    const check = (v) => v ? " ✓ " : " ✗ ";
    console.log("  " + r.os.padEnd(25) + check(r.guestAgent).padEnd(7) + check(r.ssh).padEnd(7) + check(r.network).padEnd(9) + check(r.passwordAuth));
  }

  // Show all registered templates
  const { data: allTemplates } = await sb
    .from("proxmox_templates")
    .select("vmid, name, os_type, is_active")
    .eq("host_id", host.id)
    .order("vmid");
  console.log("\n  All templates for this host:");
  for (const t of allTemplates || []) {
    console.log("    VMID " + t.vmid + " | " + t.name + " | " + (t.is_active ? "ACTIVE" : "disabled"));
  }

  const allPass = testResults.every(r => r.guestAgent && r.ssh && r.network);
  console.log("\n" + (allPass ? "  ALL TESTS PASSED" : "  SOME TESTS FAILED — check output above"));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
