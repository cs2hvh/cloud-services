'use client';

import { Card, CardContent } from '@/components/ui/card';

export default function AdminUsersPage() {
  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-white/60">Manage users, roles, and permissions</p>
        </div>

        <Card className="bg-black/50 border-white/10">
          <CardContent className="p-12 text-center">
            <p className="text-white/60 text-lg">User management coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
