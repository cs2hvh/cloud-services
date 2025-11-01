'use client';

import { ServersManager } from '@/components/admin/proxmox/servers-manager';

export default function AdminDatabasePage() {
  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Database Management</h1>
          <p className="text-white/60">View and manage all VPS instances across all users</p>
        </div>

        <ServersManager />
      </div>
    </div>
  );
}
