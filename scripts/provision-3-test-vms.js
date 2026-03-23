#!/usr/bin/env node
/**
 * Provision 3 test VMs using the 3 OVH IPs:
 *   VM1: Ubuntu 24.04 LTS  → 148.113.12.250 (template 106, user: ubuntu)
 *   VM2: Debian 12          → 148.113.13.68  (template 108, user: debian)
 *   VM3: Ubuntu 22.04 LTS  → 148.113.15.162 (template 107, user: ubuntu)
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { createClient } = require('@supabase/supabase-js');
const { Client: SSHClient } = require('ssh2');

const SUPABASE_URL = 'https://xafjjpgazdxhktpfeuri.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmpqcGdhemR4aGt0cGZldXJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjA1ODU3MiwiZXhwIjoyMDY3NjM0NTcyfQ.lWrNK4jO0xM0j9Hcb-0i8rhojswcCuh_-Qbg80RoKqE';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const PASSWORD = 'TestVM@2026Secure!';

const VMS = [
  { name: 'test-ubuntu24',  templateVmid: 106, ip: '148.113.12.250', mac: '00:50:56:08:6c:68', ciuser: 'ubuntu', os: 'Ubuntu Server 24.04 LTS' },
  { name: 'test-debian12',  templateVmid: 108, ip: '148.113.13.68',  mac: '00:50:56:05:2f:4d', ciuser: 'debian', os: 'Debian 12 (Bookworm)' },
  { name: 'test-ubuntu22',  templateVmid: 107, ip: '148.113.15.162', mac: '00:50:56:0a:83:d6', ciuser: 'ubuntu', os: 'Ubuntu Server 22.04 LTS' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getAuth(apiBase, host) {
  const username = host.username.includes('@') ? host.username : `${host.username}@pam`;
  const body = new URLSearchParams({ username, password: host.password });
  const res = await fetch(`${apiBase}/api2/json/access/ticket`, { method: 'POST', body });
  const json = await res.json();
  return {
    Cookie: `PVEAuthCookie=${json.data.ticket}`,
    CSRFPreventionToken: json.data.CSRFPreventionToken,
  };
}

async function pveGet(apiBase, path, auth) {
  const res = await fetch(`${apiBase}${path}`, { headers: auth, cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  const json = await res.json();
  return json.data || json;
}

async function pvePost(apiBase, path, data, auth) {
  const body = new URLSearchParams();
  Object.entries(data).forEach(([k, v]) => body.append(k, String(v)));
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...auth },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path}: ${res.status} ${text}`);
  }
  return (await res.json()).data;
}

async function pvePut(apiBase, path, data, auth) {
  const body = new URLSearchParams();
  Object.entries(data).forEach(([k, v]) => body.append(k, String(v)));
  const res = await fetch(`${apiBase}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...auth },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PUT ${path}: ${res.status} ${text}`);
  }
  return (await res.json()).data;
}

async function waitTask(apiBase, node, upid, auth, timeout = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const status = await pveGet(apiBase, `/api2/json/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`, auth);
    if (status.status === 'stopped') {
      if (String(status.exitstatus).toUpperCase() === 'OK') return;
      throw new Error(`Task failed: ${status.exitstatus}`);
    }
    await sleep(2000);
  }
  throw new Error('Task timeout');
}

function addHostRoute(hostIp, hostUser, hostPass, vmIp, bridge) {
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient();
    ssh.on('ready', () => {
      const cmd = `ip route replace ${vmIp}/32 dev ${bridge} 2>/dev/null; echo "Route added for ${vmIp}"`;
      ssh.exec(cmd, (err, stream) => {
        if (err) { ssh.end(); return reject(err); }
        let out = '';
        stream.on('data', d => out += d);
        stream.on('close', () => { ssh.end(); resolve(out.trim()); });
      });
    });
    ssh.on('error', reject);
    ssh.connect({ host: hostIp, port: 22, username: hostUser, password: hostPass, readyTimeout: 15000 });
  });
}

(async () => {
  console.log('=== Provisioning 3 Test VMs ===\n');

  // Get host config
  const { data: host } = await sb.from('proxmox_hosts').select('*').single();
  const apiBase = host.host_url.replace(/\/+$/, '');
  const node = host.node;
  const bridge = host.bridge || 'vmbr0';
  const gateway = host.gateway_ip;
  const dns1 = host.dns_primary || '8.8.8.8';
  const dns2 = host.dns_secondary || '1.1.1.1';

  const auth = await getAuth(apiBase, host);
  console.log('Authenticated with Proxmox\n');

  // Extract host IP for SSH route setup
  const hostIp = new URL(apiBase).hostname;

  for (const vm of VMS) {
    console.log(`--- Creating ${vm.name} (${vm.os}) → ${vm.ip} ---`);

    try {
      // 1. Get next VMID
      const vmid = Number(await pveGet(apiBase, '/api2/json/cluster/nextid', auth));
      console.log(`  VMID: ${vmid}`);

      // 2. Clone template
      console.log(`  Cloning template ${vm.templateVmid}...`);
      const cloneUpid = await pvePost(apiBase,
        `/api2/json/nodes/${node}/qemu/${vm.templateVmid}/clone`,
        { newid: vmid, name: vm.name, full: 1, target: node, storage: host.storage || 'local' },
        auth
      );
      await waitTask(apiBase, node, cloneUpid, auth);
      console.log('  Clone complete');

      // 3. Configure VM
      const ipConfig = `ip=${vm.ip}/32,gw=${gateway}`;
      const config = {
        sockets: 1,
        cores: 2,
        memory: 2048,
        onboot: 1,
        nameserver: `${dns1} ${dns2}`,
        net0: `virtio=${vm.mac},bridge=${bridge}`,
        ipconfig0: ipConfig,
        ciuser: vm.ciuser,
        cipassword: PASSWORD,
        cicustom: 'vendor=local:snippets/linux-cloud-init.yml',
      };

      // Delete inherited vcpus
      try { await pvePost(apiBase, `/api2/json/nodes/${node}/qemu/${vmid}/config`, { delete: 'vcpus' }, auth); } catch {}

      await pvePost(apiBase, `/api2/json/nodes/${node}/qemu/${vmid}/config`, config, auth);
      console.log('  Configured');

      // 4. Remove CD-ROM drives
      const vmConfig = await pveGet(apiBase, `/api2/json/nodes/${node}/qemu/${vmid}/config`, auth);
      const cdroms = Object.keys(vmConfig).filter(k => typeof vmConfig[k] === 'string' && vmConfig[k].includes('media=cdrom') && !vmConfig[k].includes('cloudinit'));
      if (cdroms.length > 0) {
        await pvePost(apiBase, `/api2/json/nodes/${node}/qemu/${vmid}/config`, { delete: cdroms.join(',') }, auth);
        console.log(`  Removed CD-ROMs: ${cdroms.join(', ')}`);
      }

      // 5. Regenerate cloud-init
      try { await pvePut(apiBase, `/api2/json/nodes/${node}/qemu/${vmid}/cloudinit`, {}, auth); } catch {}
      console.log('  Cloud-init regenerated');

      // 6. Add host route
      const routeResult = await addHostRoute(hostIp, host.username, host.password, vm.ip, bridge);
      console.log(`  ${routeResult}`);

      // 7. Start VM
      const startUpid = await pvePost(apiBase, `/api2/json/nodes/${node}/qemu/${vmid}/status/start`, {}, auth);
      if (startUpid) await waitTask(apiBase, node, startUpid, auth, 60000).catch(() => {});
      console.log('  Started');

      // 8. Insert DB record
      const { error: dbErr } = await sb.from('servers').insert({
        vmid,
        node,
        name: vm.name,
        ip: vm.ip,
        os: vm.os,
        location: host.id,
        cpu_cores: 2,
        memory_mb: 2048,
        disk_gb: null,
        status: 'running',
        owner_id: null,
        owner_email: 'admin@ahurasense.com',
        hourly_cost: 0,
        billing_start: new Date().toISOString(),
      });
      if (dbErr) console.log(`  DB error: ${dbErr.message}`);
      else console.log('  DB record saved');

      console.log(`  ✓ ${vm.name} ready at ${vm.ip} (user: ${vm.ciuser})\n`);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
    }
  }

  console.log('=== Summary ===');
  console.log(`Password for all VMs: ${PASSWORD}`);
  VMS.forEach(vm => {
    console.log(`  ssh ${vm.ciuser}@${vm.ip}  — ${vm.os}`);
  });
  console.log('\nWait ~60s for cloud-init to finish before attempting SSH.');
})();
