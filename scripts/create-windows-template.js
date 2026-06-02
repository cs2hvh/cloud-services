/**
 * Windows Server Template Creator for Proxmox VE
 *
 * Mirror of create-linux-template.js, but for Windows. Linux distros ship
 * downloadable cloud images; Windows does not — so instead of installing the
 * OS per host, we build ONE "golden" Windows template once (install + virtio
 * drivers + qemu-guest-agent + cloudbase-init + sysprep, per
 * docs/WINDOWS_SERVER_2025_TEMPLATE_SETUP.md), export its boot disk to a
 * public URL (R2/Spaces — see lib/proxmox-utils.ts exportVmDiskToUrl), and
 * then on every host just: download that golden qcow2 → import → wrap in a
 * UEFI VM → convert to template → register. ~3-8 min/host (mostly download),
 * no per-host install.
 *
 * Golden image URLs are read from env so they can be rotated without code
 * changes. A version whose URL is unset is skipped (logged), so you can roll
 * out 2022 and 2025 independently.
 *
 *   WINDOWS_2022_DC_IMAGE_URL   golden Windows Server 2022 Datacenter qcow2
 *   WINDOWS_2025_DC_IMAGE_URL   golden Windows Server 2025 Datacenter qcow2
 *
 * Optional VM-shape overrides (defaults match modern Win Server 2022/2025:
 * q35 + UEFI/OVMF + TPM 2.0 + VirtIO SCSI). These MUST be compatible with how
 * the golden image was built (firmware especially) or Windows won't boot.
 *   WINDOWS_TEMPLATE_BIOS       default "ovmf"   (use "seabios" only for a BIOS golden)
 *   WINDOWS_TEMPLATE_MACHINE    default "q35"
 *   WINDOWS_TEMPLATE_OSTYPE     default "win11"  (covers 2022/2025 in PVE 8+)
 *
 * Usage: node scripts/create-windows-template.js --host-id <id> [--vmid <id>]
 *
 * NOTE: this drives a remote Proxmox host over SSH and cannot be validated
 * from CI — run it once against a real host and confirm a clone boots before
 * relying on it.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { createClient } = require("@supabase/supabase-js");
const { Client } = require("ssh2");

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BIOS = process.env.WINDOWS_TEMPLATE_BIOS || "ovmf";
const MACHINE = process.env.WINDOWS_TEMPLATE_MACHINE || "q35";
const OSTYPE = process.env.WINDOWS_TEMPLATE_OSTYPE || "win11";

// ── Template Definitions ──────────────────────────────────────────────
// VMIDs in the 9xxx range so they don't collide with the Linux templates
// (107-114) or customer VMs. imageEnv points at the golden qcow2 URL.
const TEMPLATES = [
  {
    vmid: 9001,
    name: "win2022dc-template",
    dbName: "Windows Server 2022 Datacenter",
    osType: "windows-2022-dc",
    osDisplayName: "Windows Server 2022 Datacenter",
    imageEnv: "WINDOWS_2022_DC_IMAGE_URL",
  },
  {
    vmid: 9002,
    name: "win2025dc-template",
    dbName: "Windows Server 2025 Datacenter",
    osType: "windows-2025-dc",
    osDisplayName: "Windows Server 2025 Datacenter",
    imageEnv: "WINDOWS_2025_DC_IMAGE_URL",
  },
];

// ── SSH helper (same as the Linux builder) ────────────────────────────
function createSSH(host) {
  const sshHost = new URL(host.host_url).hostname;
  const sshUser = (host.username || "root").split("@")[0];
  const sshPass = host.password;

  return function ssh(cmd, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const timer = setTimeout(() => {
        conn.end();
        reject(new Error("SSH timeout (" + timeout / 1000 + "s): " + cmd.substring(0, 60)));
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

// ── Build one Windows template from its golden image ──────────────────
// Returns { built: boolean, skipped?: boolean, reason?: string }
async function createWindowsTemplate(ssh, tpl, host) {
  const V = tpl.vmid;
  const S = host.storage || "local";
  const B = host.bridge || "vmbr0";

  const url = process.env[tpl.imageEnv];
  if (!url) {
    console.log("  SKIP " + tpl.dbName + " — " + tpl.imageEnv + " not set");
    return { built: false, skipped: true, reason: tpl.imageEnv + " not set" };
  }
  if (!/^https:\/\//i.test(url) || /['"`$\\\n\r;|&<>(){}]/.test(url)) {
    throw new Error("Unsafe/invalid golden image URL for " + tpl.dbName + " (must be a clean https URL)");
  }

  console.log("\n──────────────────────────────────────────────");
  console.log("  Building: " + tpl.dbName + " (VMID " + V + ")");
  console.log("──────────────────────────────────────────────");

  const tmp = "/var/tmp/win-" + V + ".qcow2";

  // 1. Download the golden disk (up to 30 min for a big Windows image).
  console.log("  [1/6] Downloading golden image...");
  let r = await ssh(
    "curl -fSL --connect-timeout 30 -o '" + tmp + "' '" + url + "' && echo DL_OK || (wget -q -O '" + tmp + "' '" + url + "' && echo DL_OK)",
    30 * 60_000
  );
  if (!r.out.includes("DL_OK")) {
    await ssh("rm -f '" + tmp + "' 2>/dev/null || true");
    throw new Error("download failed: " + r.out.substring(0, 200));
  }

  try {
    // 2. Remove any stale VM at this VMID.
    r = await ssh("qm status " + V + " 2>/dev/null || echo NOT_FOUND");
    if (!r.out.includes("NOT_FOUND")) {
      console.log("  [2/6] Removing existing VMID " + V + "...");
      await ssh("qm set " + V + " --template 0 2>/dev/null || true");
      await ssh("qm stop " + V + " --skiplock 2>/dev/null || true");
      await new Promise((res) => setTimeout(res, 2000));
      await ssh("qm destroy " + V + " --purge --skiplock 2>/dev/null || true");
    } else {
      console.log("  [2/6] VMID " + V + " free");
    }

    // 3. Create the VM shell (UEFI + TPM 2.0 + VirtIO SCSI — Win 2022/2025).
    console.log("  [3/6] Creating VM shell (" + BIOS + " / " + MACHINE + ")...");
    const createCmd = [
      "qm create " + V,
      "--name " + tpl.name,
      "--ostype " + OSTYPE,
      "--machine " + MACHINE,
      "--bios " + BIOS,
      "--cores 2",
      "--sockets 1",
      "--cpu host",
      "--memory 4096",
      "--scsihw virtio-scsi-pci",
      "--net0 virtio,bridge=" + B,
      "--agent enabled=1",
      "--vga qxl",
    ].join(" ");
    r = await ssh(createCmd);
    if (r.code !== 0) throw new Error("qm create failed: " + r.out.substring(0, 200));

    // 4. Import the golden boot disk and attach it as scsi0.
    console.log("  [4/6] Importing disk...");
    r = await ssh("qm importdisk " + V + " '" + tmp + "' " + S + " --format qcow2", 30 * 60_000);
    if (r.code !== 0) throw new Error("qm importdisk failed: " + r.out.substring(0, 200));
    // The imported disk shows up as an unusedN entry; resolve it from config.
    const cfg = (await ssh("qm config " + V)).out;
    const unused = cfg.split(/\r?\n/).find((l) => /^unused\d+:/.test(l));
    const importedVol = unused ? unused.split(":").slice(1).join(":").trim() : S + ":vm-" + V + "-disk-0";
    await ssh("qm set " + V + " --scsi0 " + importedVol + ",discard=on,ssd=1,iothread=1");

    // 5. UEFI needs an EFI disk; Win11/2025 need a TPM. These are created
    //    fresh (the golden export is just the boot disk) — fine for boot.
    if (BIOS === "ovmf") {
      await ssh("qm set " + V + " --efidisk0 " + S + ":0,efitype=4m,pre-enrolled-keys=1");
      await ssh("qm set " + V + " --tpmstate0 " + S + ":0,version=v2.0");
    }
    // cloudinit drive — cloudbase-init reads provisioning from the ConfigDrive.
    await ssh("qm set " + V + " --ide2 " + S + ":cloudinit");
    await ssh("qm set " + V + " --boot order=scsi0");

    // 6. Convert to template + clean up.
    console.log("  [5/6] Converting to template...");
    await ssh("qm template " + V);
    console.log("  [6/6] Cleaning up temp file...");
    await ssh("rm -f '" + tmp + "' 2>/dev/null || true");

    console.log("  TEMPLATE CREATED: VMID " + V + " (" + tpl.dbName + ")");
    return { built: true };
  } catch (e) {
    await ssh("rm -f '" + tmp + "' 2>/dev/null || true");
    // Best-effort: tear down a half-built VM so a retry is clean.
    await ssh("qm destroy " + V + " --purge --skiplock 2>/dev/null || true");
    throw e;
  }
}

// ── Register built templates in the DB (mirrors the Linux builder) ─────
// owner_id is left null => public OS, which makes it appear in the customer
// OS list (app/api/services/compute/options/route.ts dedupes by os_display_name).
async function registerTemplates(sb, hostId, templates) {
  console.log("\n══════════════════════════════════════════════");
  console.log("  Registering templates in database");
  console.log("══════════════════════════════════════════════");

  for (const tpl of templates) {
    const { data: existing } = await sb
      .from("proxmox_templates")
      .select("id")
      .eq("host_id", hostId)
      .eq("vmid", tpl.vmid)
      .maybeSingle();

    if (existing) {
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

  const hostIdArg = process.argv.find((a, i) => process.argv[i - 1] === "--host-id");
  const vmidArg = process.argv.find((a, i) => process.argv[i - 1] === "--vmid");

  let host;
  if (hostIdArg) {
    const { data, error } = await sb.from("proxmox_hosts").select("*").eq("id", hostIdArg).single();
    if (error || !data) { console.error("Host not found:", hostIdArg); process.exit(1); }
    host = data;
  } else {
    const { data, error } = await sb.from("proxmox_hosts").select("*").eq("is_active", true).limit(1).single();
    if (error || !data) { console.error("No active host found"); process.exit(1); }
    host = data;
  }

  const templatesToCreate = vmidArg
    ? TEMPLATES.filter((t) => t.vmid === Number(vmidArg))
    : TEMPLATES;
  if (templatesToCreate.length === 0) { console.error("No template for VMID:", vmidArg); process.exit(1); }

  const sshHost = new URL(host.host_url).hostname;
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║  Windows Server Template Creator                         ║");
  console.log("╠" + "═".repeat(58) + "╣");
  console.log("║  Host: " + sshHost.padEnd(50) + "║");
  console.log("║  Node: " + (host.node || "").padEnd(50) + "║");
  console.log("║  Storage: " + (host.storage || "local").padEnd(47) + "║");
  console.log("╚" + "═".repeat(58) + "╝");

  const ssh = createSSH(host);
  console.log("\nVerifying SSH connectivity...");
  const conn = await ssh("hostname && pveversion 2>/dev/null | head -1");
  console.log("  " + conn.out);

  const built = [];
  let skipped = 0;
  for (const tpl of templatesToCreate) {
    try {
      const res = await createWindowsTemplate(ssh, tpl, host);
      if (res.built) built.push(tpl);
      else if (res.skipped) skipped++;
    } catch (e) {
      console.error("  ERROR building " + tpl.dbName + ":", e.message);
    }
  }

  if (built.length > 0) await registerTemplates(sb, host.id, built);

  console.log("\n══════════════════════════════════════════════");
  console.log("  RESULT: " + built.length + " built, " + skipped + " skipped (no URL), " +
    (templatesToCreate.length - built.length - skipped) + " failed");
  console.log("══════════════════════════════════════════════");

  if (built.length === 0 && skipped === templatesToCreate.length) {
    console.error("Nothing built — set WINDOWS_2022_DC_IMAGE_URL / WINDOWS_2025_DC_IMAGE_URL to the golden image URLs.");
    process.exit(2);
  }
  process.exit(built.length > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
