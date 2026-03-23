# Windows Server 2025 Template Setup for Proxmox VE

Complete guide to creating a Windows Server 2025 VM template with cloudbase-init on Proxmox VE for automated provisioning via the AhuraSense Cloud Services platform.

> **Tested on:** Proxmox VE 9.1.6 | Windows Server 2025 Standard (Desktop Experience)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Download Required ISOs](#2-download-required-isos)
3. [Create the Base VM](#3-create-the-base-vm)
4. [Install Windows Server 2025](#4-install-windows-server-2025)
5. [Install VirtIO Drivers](#5-install-virtio-drivers)
6. [Install QEMU Guest Agent](#6-install-qemu-guest-agent)
7. [Install Cloudbase-Init](#7-install-cloudbase-init)
8. [Configure Cloudbase-Init](#8-configure-cloudbase-init)
9. [Seal the Template](#9-seal-the-template)
10. [Convert to Template](#10-convert-to-template)
11. [Host Networking (OVH Routed IPs)](#11-host-networking-ovh-routed-ips)
12. [Register in Database](#12-register-in-database)
13. [Verification](#13-verification)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

- Proxmox VE 9.x installed and accessible
- SSH access to the Proxmox host (root)
- At least 60 GB free storage on the target storage backend
- VirtIO drivers ISO (`virtio-win.iso`)
- Windows Server 2025 ISO

### Host Requirements for OVH Routed IP Model

The Proxmox host must have:
- **IP forwarding** enabled: `net.ipv4.ip_forward = 1`
- **Proxy ARP** enabled on the bridge: `net.ipv4.conf.vmbr0.proxy_arp = 1`
- A network bridge (`vmbr0`) configured

---

## 2. Download Required ISOs

SSH into the Proxmox host and download:

```bash
# VirtIO drivers (required for disk/network during Windows install)
cd /var/lib/vz/template/iso/
wget https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso

# Upload Windows Server 2025 ISO via Proxmox UI:
#   Datacenter → Storage → local → ISO Images → Upload
```

---

## 3. Create the Base VM

### Via Proxmox UI

1. **Create VM** with these settings:

| Setting | Value | Notes |
|---------|-------|-------|
| **VM ID** | Pick a high number (e.g., 9000) | Will become your template ID |
| **Name** | `win2025-template` | Descriptive name |
| **OS Type** | Microsoft Windows / 11/2022/2025 | |
| **ISO** | Your Windows Server 2025 ISO | |
| **SCSI Controller** | VirtIO SCSI single | Required for performance |
| **Disk** | 40 GB minimum, on target storage | Use `scsi0` (not `ide0`) |
| **CPU** | 2 sockets × 1 core (or 1 socket × 2 cores) | Template default |
| **Memory** | 4096 MB | Minimum for install |
| **Network** | VirtIO (virtio), Bridge: `vmbr0` | Must be VirtIO for cloudbase-init |
| **TPM** | v2.0 (if supported) | Windows 11/2025 may require it |

2. **Add CD/DVD drive** for VirtIO drivers:
   - Hardware → Add → CD/DVD Drive → `ide0` or `ide2` → Select `virtio-win.iso`

### Via CLI (alternative)

```bash
NODE="your-node-name"
VMID=9000
STORAGE="local"

qm create $VMID \
  --name win2025-template \
  --ostype win11 \
  --scsihw virtio-scsi-single \
  --scsi0 ${STORAGE}:40,format=qcow2 \
  --ide0 local:iso/windows-server-2025.iso,media=cdrom \
  --ide2 local:iso/virtio-win.iso,media=cdrom \
  --cores 2 --sockets 1 --memory 4096 \
  --net0 virtio,bridge=vmbr0 \
  --boot order=ide0 \
  --tpmstate0 ${STORAGE}:1,version=v2.0 \
  --agent 1
```

---

## 4. Install Windows Server 2025

1. Start the VM and open the console (noVNC or SPICE)
2. Boot from the Windows ISO
3. Select **Windows Server 2025 Standard (Desktop Experience)**
4. At the disk selection screen, you'll see **no drives** (VirtIO driver not loaded yet)

### Load VirtIO Storage Driver

5. Click **Load driver** → Browse → VirtIO CD → `vioscsi\2k25\amd64` (or `2k22\amd64` if 2k25 folder doesn't exist)
6. Select **Red Hat VirtIO SCSI controller** → Next
7. The 40 GB disk should now appear → Select it → Next
8. Complete the Windows installation normally
9. Set the **Administrator** password when prompted

### After Installation

10. Log in as Administrator
11. **Do NOT run Windows Update yet** — install drivers first

---

## 5. Install VirtIO Drivers

With the VirtIO ISO still mounted:

1. Open **File Explorer** → Navigate to the VirtIO CD drive
2. Run `virtio-win-gt-x64.msi` — this installs ALL VirtIO drivers:
   - VirtIO Network (NetKVM)
   - VirtIO Balloon
   - VirtIO Serial (vioserial)
   - VirtIO SCSI (vioscsi)
   - QEMU FWCfg
3. Complete the installer with defaults
4. Verify in **Device Manager** — no yellow exclamation marks should remain

### Verify Network Driver

```powershell
# In PowerShell, verify the network adapter is VirtIO
Get-NetAdapter
# Should show "Red Hat VirtIO Ethernet Adapter" or similar
```

---

## 6. Install QEMU Guest Agent

The QEMU Guest Agent allows Proxmox to query the VM's IP, execute commands, and perform graceful shutdowns.

1. On the VirtIO CD, navigate to `guest-agent\`
2. Run `qemu-ga-x86_64.msi`
3. Complete the installer
4. Verify the service is running:

```powershell
Get-Service QEMU-GA
# Status should be "Running"
```

5. In Proxmox VM settings → Options → **QEMU Guest Agent** → Enable
   - Or via CLI: `qm set 9000 --agent 1`

---

## 7. Install Cloudbase-Init

Cloudbase-init is the Windows equivalent of cloud-init. It reads configuration from the ConfigDrive ISO that Proxmox generates.

1. Download the installer inside the VM:
   - URL: `https://cloudbase.it/downloads/CloudbaseInitSetup_Stable_x64.msi`
   - Or use PowerShell:
   ```powershell
   Invoke-WebRequest -Uri "https://cloudbase.it/downloads/CloudbaseInitSetup_Stable_x64.msi" -OutFile "$env:USERPROFILE\Desktop\CloudbaseInitSetup.msi"
   ```

2. Run the installer:
   - **Username:** `admin` (lowercase — must match `ciuser` in our platform code)
   - **Serial port for logging:** `COM1` (default)
   - ⚠️ **DO NOT check "Run Sysprep"** at the end
   - ⚠️ **DO NOT check "Shutdown"** at the end
   - Just click **Finish**

> **Important:** The username `admin` is critical. Our platform sends `ciuser: "admin"` for Windows VMs. If cloudbase-init is configured with a different user, password setting will fail.

---

## 8. Configure Cloudbase-Init

This is the most critical step. Cloudbase-init must be configured to:
- Read metadata from Proxmox's **ConfigDrive2** format
- Apply network configuration (static IP, gateway, DNS)
- Set the admin password

### Edit Main Config

Open `C:\Program Files\Cloudbase Solutions\Cloudbase-Init\conf\cloudbase-init.conf` and ensure it contains:

```ini
[DEFAULT]
username=admin
groups=Administrators
inject_user_password=true
first_logon_behaviour=no
metadata_services=cloudbaseinit.metadata.services.configdrive.ConfigDriveService
plugins=cloudbaseinit.plugins.common.mtu.MTUPlugin,cloudbaseinit.plugins.common.sethostname.SetHostNamePlugin,cloudbaseinit.plugins.windows.createuser.CreateUserPlugin,cloudbaseinit.plugins.windows.extendvolumes.ExtendVolumesPlugin,cloudbaseinit.plugins.common.setuserpassword.SetUserPasswordPlugin,cloudbaseinit.plugins.common.localscripts.LocalScriptsPlugin,cloudbaseinit.plugins.common.networkconfig.NetworkConfigPlugin
config_drive_types=iso
config_drive_locations=cdrom
logging_serial_port_settings=COM1,115200,N,8
bsdtar_path=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\bin\bsdtar.exe
mtools_path=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\bin\
verbose=true
debug=true
logdir=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\
logfile=cloudbase-init.log
default_log_levels=comtypes=INFO,suds=INFO,iso8601=WARN,requests=WARN
local_scripts_path=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\LocalScripts\
```

### Edit Unattend Config

Open `C:\Program Files\Cloudbase Solutions\Cloudbase-Init\conf\cloudbase-init-unattend.conf` and ensure it contains:

```ini
[DEFAULT]
username=admin
groups=Administrators
inject_user_password=true
metadata_services=cloudbaseinit.metadata.services.configdrive.ConfigDriveService
plugins=cloudbaseinit.plugins.common.mtu.MTUPlugin,cloudbaseinit.plugins.common.sethostname.SetHostNamePlugin,cloudbaseinit.plugins.common.networkconfig.NetworkConfigPlugin
config_drive_types=iso
config_drive_locations=cdrom
logging_serial_port_settings=COM1,115200,N,8
bsdtar_path=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\bin\bsdtar.exe
mtools_path=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\bin\
verbose=true
debug=true
logdir=C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\
logfile=cloudbase-init-unattend.log
default_log_levels=comtypes=INFO,suds=INFO,iso8601=WARN,requests=WARN
```

### Key Configuration Explained

| Setting | Value | Why |
|---------|-------|-----|
| `username=admin` | Must match platform's `ciuser` | Password is set for this user |
| `metadata_services=...configdrive.ConfigDriveService` | Proxmox generates ConfigDrive2 format | Without this, cloudbase-init can't find metadata |
| `NetworkConfigPlugin` in plugins list | Applies static IP from cloud-init | Without this, VM gets no IP |
| `config_drive_types=iso` | Proxmox mounts cloud-init as ISO | |
| `config_drive_locations=cdrom` | Look for ISO on CD-ROM drives | |
| `inject_user_password=true` | Allow password injection | Required for RDP access |
| `first_logon_behaviour=no` | Don't force password change on first login | Better UX for customers |

---

## 9. Seal the Template

Before converting to template, clean up the cloudbase-init state so it runs fresh on each clone.

### Option A: Sysprep (Preferred but May Fail)

```powershell
# Run from inside the VM
cd "C:\Program Files\Cloudbase Solutions\Cloudbase-Init\conf"
C:\Windows\System32\Sysprep\sysprep.exe /generalize /oobe /shutdown /unattend:Unattend.xml
```

If Sysprep fails (common with certain Windows builds), use Option B.

### Option B: Manual State Reset (Reliable Workaround)

```powershell
# 1. Stop cloudbase-init service
Stop-Service cloudbase-init

# 2. Clear the state files that track "already ran" status
Remove-Item -Force -ErrorAction SilentlyContinue "C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\*"

# 3. Remove the "plugins already executed" marker
$statePath = "C:\Program Files\Cloudbase Solutions\Cloudbase-Init"
Remove-Item -Force -ErrorAction SilentlyContinue "$statePath\Plugins\*"

# 4. Remove the instance ID cache (forces re-read of metadata)
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "HKLM:\SOFTWARE\Cloudbase Solutions\Cloudbase-Init" 2>$null
reg delete "HKLM\SOFTWARE\Cloudbase Solutions\Cloudbase-Init" /f 2>$null

# 5. Set cloudbase-init to start automatically on boot
Set-Service cloudbase-init -StartupType Automatic

# 6. Verify it's set to auto-start
Get-Service cloudbase-init | Select-Object Name, Status, StartType

# 7. Shut down the VM cleanly
Stop-Computer -Force
```

---

## 10. Convert to Template

After the VM is shut down:

### Via Proxmox UI
1. Right-click the VM → **Convert to Template**

### Via CLI
```bash
qm template 9000
```

### Add Cloud-Init Drive

The template needs a cloud-init drive for Proxmox to inject configuration:

```bash
# Add cloud-init drive on ide1 (don't use ide2 if VirtIO ISO was there)
qm set 9000 --ide1 local:cloudinit
```

### Remove ISO Drives

Clean up the installation ISOs from the template:

```bash
# Remove Windows ISO
qm set 9000 --delete ide0

# Remove VirtIO ISO (if on ide2)
qm set 9000 --delete ide2
```

> **Note:** If the template has immutable base files (after conversion), you may need:
> ```bash
> cd /var/lib/vz/images/9000/  # or your storage path
> chattr -i base-*
> ```
> Then re-run the delete commands.

### Verify Template Config

```bash
qm config 9000
```

Expected output should show:
- `scsi0:` — the main disk (qcow2)
- `ide1: local:cloudinit` — cloud-init drive
- `agent: 1` — QEMU agent enabled
- `scsihw: virtio-scsi-single`
- No `ide0` or `ide2` (ISOs removed)

---

## 11. Host Networking (OVH Routed IPs)

For OVH dedicated servers with routed failover IPs, the host must be configured to route traffic to VMs.

### Persistent Network Configuration

Edit `/etc/network/interfaces` on the Proxmox host:

```
auto lo
iface lo inet loopback

auto eno1
iface eno1 inet static
    address YOUR_HOST_IP/32
    gateway 100.64.0.1

auto vmbr0
iface vmbr0 inet static
    address YOUR_HOST_IP/32
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   echo 1 > /proc/sys/net/ipv4/conf/vmbr0/proxy_arp
```

> Replace `YOUR_HOST_IP` with the host's main IP. The gateway `100.64.0.1` is OVH's standard for routed IPs.

### How VM Routes Work

When the platform creates a VM, it automatically:
1. Assigns a failover IP from the `public_ip_pool_ips` table
2. Uses the OVH-assigned virtual MAC for that IP
3. Injects a host route via SSH: `ip route add {VM_IP}/32 dev vmbr0`
4. Configures cloud-init: `ipconfig0=ip={VM_IP}/32,gw={GATEWAY}`

When a VM is deleted, the route is automatically removed.

### OVH Virtual MAC Requirement

Each failover IP **must** have a virtual MAC assigned in the OVH control panel:
1. Go to OVH Manager → Bare Metal Cloud → IP
2. Click the ⋯ menu next to each failover IP → **Add a virtual MAC**
3. Choose **OVH** type
4. Note down the assigned MAC (format: `00:50:56:xx:xx:xx`)
5. Store this MAC in the `public_ip_pools` table in the database

---

## 12. Register in Database

### Add the Proxmox Host

Insert into `proxmox_hosts`:

```sql
INSERT INTO proxmox_hosts (
  name, host_url, allow_insecure_tls,
  username, password,
  node, storage, bridge,
  gateway_ip, dns_primary, dns_secondary,
  template_vmid, is_active
) VALUES (
  'My Proxmox Host',
  'https://your-proxmox-host:8006',
  true,  -- set false if using valid TLS cert
  'root', 'your-password',
  'your-node-name',    -- run `hostname` on the Proxmox host
  'local',             -- or 'local-lvm', 'ceph', etc.
  'vmbr0',
  '100.64.0.1',        -- OVH gateway (or your gateway)
  '8.8.8.8', '1.1.1.1',
  9000,                -- template VMID from step 10
  true
);
```

### Register the Template

Insert into `proxmox_templates`:

```sql
INSERT INTO proxmox_templates (
  host_id, vmid, name, os_type, is_active
) VALUES (
  'HOST_ID_FROM_ABOVE',
  9000,
  'Windows Server 2025',
  'windows-server-2025',
  true
);
```

### Add IP Pool and IPs

```sql
-- Create IP pool with OVH virtual MAC
INSERT INTO public_ip_pools (host_id, mac)
VALUES ('HOST_ID', '00:50:56:xx:xx:xx');

-- Add failover IPs to the pool
INSERT INTO public_ip_pool_ips (pool_id, ip)
VALUES
  (POOL_ID, '203.0.113.10'),
  (POOL_ID, '203.0.113.11');
```

> **Note:** If different IPs have different MACs (common with OVH), you may need separate pools per MAC, or store MACs at the IP level.

---

## 13. Verification

### Quick Smoke Test

1. Create a VM through the admin panel or API
2. Wait 60-90 seconds for Windows to boot and cloudbase-init to run
3. Check QEMU agent:
   ```bash
   qm agent VMID ping
   ```
4. Check guest network:
   ```bash
   qm agent VMID network-get-interfaces
   ```
5. Ping the VM's IP from the Proxmox host:
   ```bash
   ping -c 3 VM_IP
   ```
6. Try RDP from your machine:
   ```
   mstsc /v:VM_IP
   # Username: admin
   # Password: (the one you set during creation)
   ```

### Check Cloudbase-Init Logs (if networking fails)

Via QEMU agent or console:
```powershell
Get-Content "C:\Program Files\Cloudbase Solutions\Cloudbase-Init\log\cloudbase-init.log" -Tail 50
```

### Verify Cloud-Init Data from Proxmox

```bash
# Dump the cloud-init network config Proxmox will inject
qm cloudinit dump VMID network

# Expected output (Debian interfaces format):
# auto lo
# iface lo inet loopback
# auto eth0
# iface eth0 inet static
#     address VM_IP/32
#     gateway GATEWAY_IP
```

---

## 14. Troubleshooting

### VM boots but no network

| Cause | Fix |
|-------|-----|
| `NetworkConfigPlugin` missing from cloudbase-init plugins | Add it to both `.conf` files (see step 8) |
| `metadata_services` not set to `ConfigDriveService` | Add `metadata_services=cloudbaseinit.metadata.services.configdrive.ConfigDriveService` |
| Cloud-init drive not attached | Run `qm set VMID --ide1 local:cloudinit` |
| Cloud-init ISO not regenerated after config change | Run `qm cloudinit update VMID` or API: `PUT /nodes/{node}/qemu/{vmid}/cloudinit` |
| Host route missing | SSH to host: `ip route add VM_IP/32 dev vmbr0` |
| ip_forward or proxy_arp disabled | Check: `cat /proc/sys/net/ipv4/ip_forward` (should be `1`) |

### Cloudbase-init doesn't run on clone

| Cause | Fix |
|-------|-----|
| Service not set to Automatic | `Set-Service cloudbase-init -StartupType Automatic` on template |
| State files not cleared | Delete logs and registry key (see step 9, Option B) |
| Sysprep was skipped but state wasn't reset | Re-do step 9 Option B, then re-template |

### Wrong username for RDP

Our platform uses `ciuser=admin` for Windows VMs. Ensure:
- Cloudbase-init installer was configured with username `admin`
- Both `.conf` files have `username=admin`
- The user logs in with username `admin`, not `Administrator`

### Disk resize not working

Check the primary disk device name:
```bash
qm config VMID | grep -E "^(scsi|ide|virtio)[0-9]"
```
The platform auto-detects the primary disk in this order: `ide0` (if not cdrom/cloudinit) → `virtio0` → `scsi0`.

### MAC address mismatch

OVH requires the VM's MAC to match the virtual MAC assigned to the failover IP. Verify:
```bash
qm config VMID | grep net0
# Should show: virtio=XX:XX:XX:XX:XX:XX,bridge=vmbr0
# The MAC must match the OVH vMAC for that IP
```

---

## Quick Reference: Full Clone Flow

When the platform creates a Windows VM, it executes these steps in order:

```
1. Reserve DB record (status=provisioning)
2. Authenticate with Proxmox (ticket/CSRF)
3. Find Windows template (proxmox_templates table)
4. Get next available VMID
5. Full clone: POST /nodes/{node}/qemu/{template}/clone
6. Wait for clone task completion
7. Delete inherited vcpus: PUT config {delete: "vcpus"}
8. Configure VM: PUT config {
     sockets: 1, cores: N, memory: N,
     onboot: 1, nameserver: "8.8.8.8 1.1.1.1",
     net0: "virtio={OVH_MAC},bridge=vmbr0",
     ipconfig0: "ip={IP}/32,gw={GATEWAY}",
     ciuser: "admin", cipassword: "{password}"
   }
9. Resize disk: PUT /resize {disk: "scsi0", size: "+NGB"}
10. Regenerate cloud-init ISO: PUT /cloudinit
11. Add host route via SSH: ip route add {IP}/32 dev vmbr0
12. Start VM: POST /status/start
13. Update DB record (vmid, status)
```

Customer receives: `{ rdp: { username: "admin", port: 3389 }, ip: "x.x.x.x" }`
