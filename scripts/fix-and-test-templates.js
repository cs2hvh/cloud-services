/**
 * Fix Ubuntu 22.04 template (re-create with proper image conversion)
 * and add ssh_pwauth to all templates' vendor snippets, then re-test all.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("ssh2");

const sb = createClient(
  "https://xafjjpgazdxhktpfeuri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmpqcGdhemR4aGt0cGZldXJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjA1ODU3MiwiZXhwIjoyMDY3NjM0NTcyfQ.lWrNK4jO0xM0j9Hcb-0i8rhojswcCuh_-Qbg80RoKqE"
);

const NAT_SUBNET = "10.10.10";
const NAT_HOST_IP = NAT_SUBNET + ".1";
const NAT_VM_IP = NAT_SUBNET + ".100";
const NAT_CIDR = NAT_SUBNET + ".0/24";

function createSSH(host) {
  const sshHost = new URL(host.host_url).hostname;
  const sshUser = (host.username || "root").split("@")[0];
  const sshPass = host.password;
  return function ssh(cmd, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const timer = setTimeout(() => { conn.end(); reject(new Error("SSH timeout")); }, timeout);
      conn.on("ready", () => {
        conn.exec(cmd, (err, stream) => {
          if (err) { clearTimeout(timer); conn.end(); reject(err); return; }
          let output = "";
          stream.on("data", (d) => (output += d.toString()));
          stream.stderr.on("data", (d) => (output += d.toString()));
          stream.on("close", (code) => { clearTimeout(timer); conn.end(); resolve({ out: output.trim(), code }); });
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
  const bridge = host.bridge || "vmbr0";
  const storage = host.storage || "local";

  console.log("=== FIX UBUNTU 22.04 TEMPLATE + SSH AUTH ===\n");

  // ── Step 1: Convert Ubuntu 22.04 image from compat 0.10 → 1.1 ──
  console.log("[1] Converting Ubuntu 22.04 image to compat 1.1...");
  let r = await ssh(
    "qemu-img convert -f qcow2 -O qcow2 -o compat=1.1 /tmp/ubuntu-22.04-server-cloudimg-amd64.img /tmp/ubuntu-22.04-converted.qcow2 && echo CONVERT_OK",
    300000
  );
  console.log("  " + (r.out.includes("CONVERT_OK") ? "Converted" : "FAILED: " + r.out.substring(0,200)));
  if (!r.out.includes("CONVERT_OK")) { process.exit(1); }

  r = await ssh("qemu-img info /tmp/ubuntu-22.04-converted.qcow2 | head -8");
  console.log("  " + r.out.replace(/\n/g, "\n  "));

  // ── Step 2: Destroy old VM 107, re-create ──
  console.log("\n[2] Re-creating VM 107...");
  await ssh("qm set 107 --template 0 2>/dev/null || true");
  await ssh("qm stop 107 --skiplock 2>/dev/null || true");
  await new Promise(r => setTimeout(r, 3000));
  await ssh("qm destroy 107 --purge --skiplock 2>/dev/null || true");
  await new Promise(r => setTimeout(r, 2000));

  // Create VM
  await ssh([
    "qm create 107",
    "--name ubuntu-server-22-template",
    "--ostype l26",
    "--scsihw virtio-scsi-single",
    "--cores 2 --sockets 1 --memory 2048",
    "--net0 virtio,bridge=" + bridge,
    "--agent 1,fstrim_cloned_disks=1",
    "--serial0 socket",
    "--vga serial0",
  ].join(" "));

  // Import converted disk
  r = await ssh("qm importdisk 107 /tmp/ubuntu-22.04-converted.qcow2 " + storage + " --format qcow2", 300000);
  console.log("  Import: " + r.out.split("\n").pop());

  // Attach disk + cloud-init
  await ssh("qm set 107 --scsi0 " + storage + ":107/vm-107-disk-0.qcow2,discard=on,iothread=1,ssd=1");
  await ssh("qm set 107 --ide2 " + storage + ":cloudinit");
  await ssh("qm set 107 --boot order=scsi0");
  console.log("  VM 107 created");

  // ── Step 3: Create vendor snippets with ssh_pwauth for ALL templates ──
  console.log("\n[3] Creating vendor snippets with ssh_pwauth...");
  const snippet = `#cloud-config
package_update: true
packages:
  - qemu-guest-agent
ssh_pwauth: true
runcmd:
  - systemctl enable qemu-guest-agent
  - systemctl start qemu-guest-agent`;

  const snippets = [
    "setup-ubuntu-server-22.yml",
    "setup-debian-12.yml",
    "setup-debian-13.yml",
  ];
  for (const s of snippets) {
    await ssh("cat > /var/lib/vz/snippets/" + s + " << 'VENDOREOF'\n" + snippet + "\nVENDOREOF");
  }
  console.log("  Created: " + snippets.join(", "));

  // ── Step 4: Boot VM 107 with cloud-init to install guest agent ──
  console.log("\n[4] Booting VM 107 to install guest-agent...");
  await ssh("ip addr add " + NAT_HOST_IP + "/24 dev " + bridge + " 2>/dev/null || true");
  await ssh("iptables -t nat -C POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE");

  await ssh([
    "qm set 107",
    "--ciuser ubuntu",
    "--cipassword TempSetup2024!",
    "--ipconfig0 ip=" + NAT_VM_IP + "/24,gw=" + NAT_HOST_IP,
    "--nameserver 8.8.8.8",
    "--cicustom vendor=" + storage + ":snippets/setup-ubuntu-server-22.yml",
  ].join(" "));

  await ssh("qm start 107");

  // Wait for guest agent
  let agentOk = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const ping = await ssh("qm agent 107 ping 2>&1", 8000);
      if (!ping.out.includes("error") && !ping.out.includes("not running") && !ping.out.includes("No QEMU")) {
        console.log("  Guest agent responding (" + ((i + 1) * 5) + "s)");
        agentOk = true;
        break;
      }
    } catch (e) {}
    if (i % 12 === 11) console.log("  Waiting... (" + ((i + 1) * 5) + "s)");
  }

  if (!agentOk) {
    console.log("  Agent not responding. Trying SSH fallback...");
    await ssh("apt-get install -y sshpass 2>/dev/null || true", 30000);
    // Clear known_hosts
    await ssh("ssh-keygen -R " + NAT_VM_IP + " 2>/dev/null || true");
    // Wait a bit more for ssh to be ready
    await new Promise(r => setTimeout(r, 15000));
    const sshR = await ssh(
      "sshpass -p TempSetup2024! ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 ubuntu@" + NAT_VM_IP +
      " 'sudo apt-get update -qq && sudo apt-get install -yqq qemu-guest-agent && sudo systemctl enable qemu-guest-agent && sudo systemctl start qemu-guest-agent && echo INSTALL_OK' 2>&1",
      180000
    );
    if (sshR.out.includes("INSTALL_OK")) {
      console.log("  Installed via SSH fallback");
      agentOk = true;
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.error("  SSH fallback FAILED: " + sshR.out.substring(0, 300));
    }
  }

  // Clean cloud-init + shutdown
  console.log("\n[5] Sealing VM 107...");
  try {
    await ssh("qm guest exec 107 -- cloud-init clean --logs 2>&1", 15000);
  } catch (e) {
    await ssh(
      "sshpass -p TempSetup2024! ssh -o StrictHostKeyChecking=no ubuntu@" + NAT_VM_IP +
      " 'sudo cloud-init clean --logs' 2>&1 || true", 15000
    );
  }
  await ssh("qm shutdown 107 --timeout 30 2>/dev/null || qm stop 107");
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 3000));
    r = await ssh("qm status 107");
    if (r.out.includes("stopped")) break;
  }
  await ssh("qm set 107 --delete cicustom 2>/dev/null || true");
  await ssh("qm set 107 --delete cipassword --delete nameserver --ipconfig0 '' --ciuser ubuntu 2>/dev/null || true");
  await ssh("qm template 107");
  console.log("  VM 107 converted to template");

  // Clean up NAT  
  await ssh("ip addr del " + NAT_HOST_IP + "/24 dev " + bridge + " 2>/dev/null || true");
  await ssh("iptables -t nat -D POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE 2>/dev/null || true");

  // Register Ubuntu 22.04 in DB
  console.log("\n[6] Registering Ubuntu 22.04 in DB...");
  const { data: existing } = await sb.from("proxmox_templates").select("id").eq("host_id", host.id).eq("vmid", 107).maybeSingle();
  if (existing) {
    await sb.from("proxmox_templates").update({
      name: "Ubuntu Server 22.04",
      os_type: "ubuntu-server-22",
      os_display_name: "Ubuntu Server 22.04 LTS",
      is_active: true,
    }).eq("id", existing.id);
    console.log("  Updated");
  } else {
    await sb.from("proxmox_templates").insert({
      host_id: host.id,
      vmid: 107,
      name: "Ubuntu Server 22.04",
      os_type: "ubuntu-server-22",
      os_display_name: "Ubuntu Server 22.04 LTS",
      is_active: true,
    });
    console.log("  Registered");
  }

  // ── Step 5: Now re-test ALL 3 templates with proper SSH ──
  console.log("\n=== INTEGRATION TESTS ===\n");

  const templates = [
    { vmid: 107, name: "Ubuntu Server 22.04", osType: "ubuntu-server-22", snippet: "setup-ubuntu-server-22.yml" },
    { vmid: 108, name: "Debian 12", osType: "debian-12", snippet: "setup-debian-12.yml" },
    { vmid: 109, name: "Debian 13", osType: "debian-13", snippet: "setup-debian-13.yml" },
  ];
  const TEST_VMID = 250;
  const results = [];

  for (const tpl of templates) {
    console.log("─── Testing " + tpl.name + " (VMID " + tpl.vmid + " → " + TEST_VMID + ") ───");

    // Cleanup
    await ssh("qm stop " + TEST_VMID + " --skiplock 2>/dev/null; qm destroy " + TEST_VMID + " --purge --skiplock 2>/dev/null || true");
    await new Promise(r => setTimeout(r, 2000));

    // Clone
    console.log("  Cloning...");
    r = await ssh("qm clone " + tpl.vmid + " " + TEST_VMID + " --name test-" + tpl.osType + " --full 2>&1", 300000);
    console.log("  " + r.out.split("\n").pop());

    // Configure with ssh_pwauth snippet
    await ssh("ip addr add " + NAT_HOST_IP + "/24 dev " + bridge + " 2>/dev/null || true");
    await ssh("iptables -t nat -C POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE");

    // Clear known_hosts for this IP
    await ssh("ssh-keygen -R " + NAT_VM_IP + " 2>/dev/null || true");

    await ssh([
      "qm set " + TEST_VMID,
      "--ciuser ubuntu",
      "--cipassword TestPass2024!",
      "--ipconfig0 ip=" + NAT_VM_IP + "/24,gw=" + NAT_HOST_IP,
      "--nameserver 8.8.8.8",
      "--cicustom vendor=" + storage + ":snippets/" + tpl.snippet,
    ].join(" "));

    console.log("  Booting...");
    await ssh("qm start " + TEST_VMID);

    const res = { os: tpl.name, guestAgent: false, ssh: false, network: false, passwordAuth: false, osInfo: "" };

    // Wait for guest agent
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const ping = await ssh("qm agent " + TEST_VMID + " ping 2>&1", 8000);
        if (!ping.out.includes("error") && !ping.out.includes("not running") && !ping.out.includes("No QEMU")) {
          res.guestAgent = true;
          console.log("  Guest agent: OK (" + ((i + 1) * 5) + "s)");
          break;
        }
      } catch (e) {}
      if (i % 6 === 5) console.log("  Waiting for agent... (" + ((i + 1) * 5) + "s)");
    }

    if (res.guestAgent) {
      // Check network
      try {
        const net = await ssh("qm agent " + TEST_VMID + " network-get-interfaces 2>&1", 10000);
        if (net.out.includes(NAT_VM_IP)) {
          res.network = true;
          console.log("  Network: OK");
        }
      } catch (e) {}
    }

    // Wait for SSH to be ready  
    await new Promise(r => setTimeout(r, 10000));
    await ssh("apt-get install -y sshpass 2>/dev/null || true", 30000);

    // Test SSH with password
    try {
      const sshR = await ssh(
        "sshpass -p TestPass2024! ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o PreferredAuthentications=password ubuntu@" + NAT_VM_IP +
        " 'echo SSH_OK && id && cat /etc/os-release | grep PRETTY_NAME' 2>&1",
        30000
      );
      if (sshR.out.includes("SSH_OK")) {
        res.ssh = true;
        res.passwordAuth = true;
        const pretty = sshR.out.match(/PRETTY_NAME="?([^"\n]+)/);
        res.osInfo = pretty ? pretty[1] : "";
        console.log("  SSH: OK (password auth)");
        console.log("  OS: " + res.osInfo);
      } else {
        console.log("  SSH: FAILED - " + sshR.out.substring(0, 200));
      }
    } catch (e) {
      console.log("  SSH: FAILED - " + e.message);
    }

    // Security: check root login
    try {
      const rootR = await ssh(
        "sshpass -p TestPass2024! ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@" + NAT_VM_IP +
        " 'echo ROOT_OK' 2>&1",
        10000
      );
      console.log("  Root SSH: " + (rootR.out.includes("ROOT_OK") ? "ALLOWED (warning)" : "Blocked (good)"));
    } catch (e) {
      console.log("  Root SSH: Blocked (good)");
    }

    // Cleanup test VM
    await ssh("qm stop " + TEST_VMID + " --skiplock 2>/dev/null || true");
    await new Promise(r => setTimeout(r, 3000));
    await ssh("qm destroy " + TEST_VMID + " --purge --skiplock 2>/dev/null || true");
    await ssh("ip addr del " + NAT_HOST_IP + "/24 dev " + bridge + " 2>/dev/null || true");
    await ssh("iptables -t nat -D POSTROUTING -s " + NAT_CIDR + " ! -d " + NAT_CIDR + " -j MASQUERADE 2>/dev/null || true");
    console.log("  Cleanup: Done\n");

    results.push(res);
  }

  // Clean up temp files
  await ssh("rm -f /var/lib/vz/snippets/setup-ubuntu-server-22.yml /var/lib/vz/snippets/setup-debian-12.yml /var/lib/vz/snippets/setup-debian-13.yml");
  await ssh("rm -f /tmp/ubuntu-22.04-converted.qcow2");

  // Print summary
  console.log("═".repeat(65));
  console.log("  RESULTS SUMMARY");
  console.log("═".repeat(65));
  console.log("  " + "OS".padEnd(25) + "Agent  SSH    Network  PwdAuth  OS Version");
  console.log("  " + "─".repeat(60));
  for (const r of results) {
    const c = (v) => v ? " ✓ " : " ✗ ";
    console.log("  " + r.os.padEnd(25) + c(r.guestAgent).padEnd(7) + c(r.ssh).padEnd(7) + c(r.network).padEnd(9) + c(r.passwordAuth).padEnd(9) + r.osInfo);
  }

  // Show all templates
  const { data: allTpl } = await sb.from("proxmox_templates").select("vmid,name,os_type,is_active").eq("host_id", host.id).order("vmid");
  console.log("\n  All templates for host:");
  for (const t of allTpl || []) {
    console.log("    VMID " + t.vmid + " | " + t.name.padEnd(35) + " | " + (t.is_active ? "ACTIVE" : "disabled"));
  }

  const allPass = results.every(r => r.guestAgent && r.ssh && r.network);
  console.log("\n  " + (allPass ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED — review output"));
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
