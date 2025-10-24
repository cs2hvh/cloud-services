'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HostRow } from '../types';
import { toast } from 'sonner';

type VMCreationProps = {
  isAdmin: boolean;
  getAccessToken: () => Promise<string | null>;
};

export function VMCreationForm({ isAdmin, getAccessToken }: VMCreationProps) {
  // Hosts/Locations
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [hostsLoading, setHostsLoading] = useState(true);
  const [hostsError, setHostsError] = useState<string | null>(null);

  // Provisioning form state
  const [selectedHostId, setSelectedHostId] = useState<string>('');
  const [vmName, setVmName] = useState('');
  const [cpuCores, setCpuCores] = useState(2);
  const [memoryGB, setMemoryGB] = useState(2);
  const [diskGB, setDiskGB] = useState(20);
  const [sshPassword, setSshPassword] = useState('');
  const [templateVmid, setTemplateVmid] = useState<number | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<Record<string, unknown> | null>(null);

  // Load available hosts
  const loadHosts = useCallback(async () => {
    if (!isAdmin) {
      setHosts([]);
      setHostsLoading(false);
      return;
    }

    setHostsLoading(true);
    setHostsError(null);

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/admin/proxmox/hosts', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load hosts');
      const rows = Array.isArray(json.hosts) ? (json.hosts as HostRow[]) : [];
      setHosts(rows.filter((h) => h.is_active !== false));
      
      // Auto-select first host if only one
      if (rows.length === 1) {
        setSelectedHostId(rows[0].id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load hosts';
      setHostsError(message);
      toast.error(message);
    } finally {
      setHostsLoading(false);
    }
  }, [getAccessToken, isAdmin]);

  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  // Get selected host details
  const selectedHost = useMemo(() => {
    return hosts.find((h) => h.id === selectedHostId);
  }, [hosts, selectedHostId]);

  // Get available templates for selected host
  const availableTemplates = useMemo(() => {
    return selectedHost?.proxmox_templates || [];
  }, [selectedHost]);

  // Validation
  const canSubmit = useMemo(() => {
    if (!vmName || !selectedHostId || !sshPassword) return false;
    if (!cpuCores || !memoryGB || !diskGB) return false;
    return true;
  }, [vmName, selectedHostId, sshPassword, cpuCores, memoryGB, diskGB]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit || !selectedHost) return;

      setIsSubmitting(true);
      setSubmitError(null);
      setSubmitSuccess(null);

      try {
        const token = await getAccessToken();
        const payload = {
          hostId: selectedHostId,
          name: vmName,
          node: selectedHost.node,
          cpuCores,
          memoryMB: memoryGB * 1024,
          diskGB,
          sshPassword,
          templateVmid: templateVmid || selectedHost.template_vmid || undefined,
          storage: selectedHost.storage || 'local',
          bridge: selectedHost.bridge || 'vmbr0',
        };

        const res = await fetch('/api/admin/proxmox/vms/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || 'VM creation failed');
        }

        setSubmitSuccess(json);
        toast.success('VM created successfully!');
        
        // Reset form
        setVmName('');
        setCpuCores(2);
        setMemoryGB(2);
        setDiskGB(20);
        setSshPassword('');
        setTemplateVmid(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'VM creation failed';
        setSubmitError(message);
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [canSubmit, selectedHost, selectedHostId, vmName, cpuCores, memoryGB, diskGB, sshPassword, templateVmid, getAccessToken]
  );

  if (!isAdmin) {
    return (
      <Card className="bg-black/50 border-white/10">
        <CardContent className="pt-6">
          <p className="text-white/60">You do not have permission to create VMs.</p>
        </CardContent>
      </Card>
    );
  }

  if (hostsLoading) {
    return (
      <Card className="bg-black/50 border-white/10">
        <CardContent className="pt-6 text-center">
          <p className="text-white/60">Loading Proxmox hosts...</p>
        </CardContent>
      </Card>
    );
  }

  if (hostsError) {
    return (
      <Card className="bg-black/50 border-white/10">
        <CardContent className="pt-6">
          <p className="text-red-400">{hostsError}</p>
        </CardContent>
      </Card>
    );
  }

  if (hosts.length === 0) {
    return (
      <Card className="bg-black/50 border-white/10">
        <CardContent className="pt-6">
          <p className="text-white/60">No active Proxmox hosts available. Please configure a host first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/50 border-white/10">
      <CardHeader>
        <CardTitle className="text-white">Create Virtual Machine</CardTitle>
        <CardDescription className="text-white/60">
          Provision a new VM on the available Proxmox host{hosts.length === 1 ? '' : 's'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Host Selection */}
          <div className="space-y-2">
            <Label className="text-white">Proxmox Host (Location)</Label>
            <select
              className="bg-black text-white border border-white/10 h-10 w-full rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-white/20"
              value={selectedHostId}
              onChange={(e) => setSelectedHostId(e.target.value)}
            >
              <option value="">Select a host...</option>
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.name || 'Unnamed'} ({host.location || 'Unknown Location'})
                </option>
              ))}
            </select>
            {selectedHost?.location && (
              <p className="text-white/40 text-sm mt-1">📍 Location: {selectedHost.location}</p>
            )}
          </div>

          {/* VM Name */}
          <div className="space-y-2">
            <Label className="text-white">VM Name</Label>
            <Input
              type="text"
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              placeholder="e.g., ubuntu-web-server-01"
              className="bg-black text-white border-white/10"
            />
          </div>

          {/* CPU Cores */}
          <div className="space-y-2">
            <Label className="text-white">vCPU Cores</Label>
            <Input
              type="number"
              min={1}
              max={32}
              value={cpuCores}
              onChange={(e) => setCpuCores(Math.max(1, parseInt(e.target.value || '1', 10)))}
              className="bg-black text-white border-white/10"
            />
          </div>

          {/* Memory */}
          <div className="space-y-2">
            <Label className="text-white">Memory (GB)</Label>
            <Input
              type="number"
              min={1}
              max={256}
              value={memoryGB}
              onChange={(e) => setMemoryGB(Math.max(1, parseInt(e.target.value || '1', 10)))}
              className="bg-black text-white border-white/10"
            />
          </div>

          {/* Disk Size */}
          <div className="space-y-2">
            <Label className="text-white">Disk (GB)</Label>
            <Input
              type="number"
              min={10}
              max={2000}
              value={diskGB}
              onChange={(e) => setDiskGB(Math.max(10, parseInt(e.target.value || '20', 10)))}
              className="bg-black text-white border-white/10"
            />
          </div>

          {/* SSH Password */}
          <div className="space-y-2 md:col-span-2">
            <Label className="text-white">SSH Root Password</Label>
            <Input
              type="password"
              value={sshPassword}
              onChange={(e) => setSshPassword(e.target.value)}
              placeholder="Enter a strong password for root access"
              className="bg-black text-white border-white/10"
            />
            <p className="text-white/40 text-sm">This will be used for initial SSH access</p>
          </div>

          {/* Template Selection */}
          {availableTemplates.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <Label className="text-white">OS Template (Optional)</Label>
              <select
                className="bg-black text-white border border-white/10 h-10 w-full rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-white/20"
                value={templateVmid || ''}
                onChange={(e) => setTemplateVmid(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Use default template</option>
                {availableTemplates.map((tpl) => (
                  <option key={tpl.id} value={String(tpl.vmid || '')}>
                    {tpl.name || `Template ${tpl.vmid}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error Message */}
          {submitError && (
            <div className="md:col-span-2 p-3 bg-red-900/20 border border-red-500/30 rounded text-red-300 text-sm">
              {submitError}
            </div>
          )}

          {/* Success Message */}
          {submitSuccess && (
            <div className="md:col-span-2 p-3 bg-green-900/20 border border-green-500/30 rounded text-green-300 text-sm">
              <p className="font-semibold">✓ VM Created Successfully</p>
              {typeof submitSuccess?.vmid === 'number' && (
                <p className="text-sm mt-1">VM ID: {submitSuccess.vmid}</p>
              )}
              {typeof submitSuccess?.ip === 'string' && (
                <p className="text-sm">IP Address: {submitSuccess.ip}</p>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="md:col-span-2">
            <Button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="w-full bg-white text-black hover:bg-white/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating VM...' : 'Create VM'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
