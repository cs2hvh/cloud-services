'use client';

import { ProxmoxHostsManager } from '@/components/admin/proxmox/hosts-manager';

export default function AdminHostsPage() {
  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Proxmox Infrastructure</h1>
          <p className="text-white/60">Configure Proxmox hosts, IP pools, and OS templates</p>
        </div>

        <ProxmoxHostsManager />
      </div>
    </div>
  );
}
