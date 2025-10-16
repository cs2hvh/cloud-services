import { ProxmoxHostsManager } from '@/components/admin/proxmox/hosts-manager';

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-black p-6 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-white/60">Manage Proxmox hosts, IP pools, and templates</p>
        </div>

        {/* Proxmox Hosts Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-white mb-6">Proxmox Infrastructure</h2>
          <ProxmoxHostsManager />
        </div>
      </div>
    </div>
  );
}
