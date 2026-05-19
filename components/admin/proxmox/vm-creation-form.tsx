'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HostRow } from '../types';
import { toast } from 'sonner';

// Supported OS options
const OS_OPTIONS = [
  { value: 'Ubuntu 24.04 LTS', label: 'Ubuntu 24.04 LTS', type: 'linux' as const, icon: '🐧' },
  { value: 'Windows Server 2025', label: 'Windows Server 2025', type: 'windows' as const, icon: '🪟' },
] as const;

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
  const [selectedOs, setSelectedOs] = useState<string>(OS_OPTIONS[0].value);
  const [cpuCores, setCpuCores] = useState(2);
  const [memoryGB, setMemoryGB] = useState(2);
  const [diskGB, setDiskGB] = useState(20);
  const [password, setPassword] = useState('');
  const [templateVmid, setTemplateVmid] = useState<number | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<Record<string, unknown> | null>(null);

  // Derived state — is this a Windows or Desktop VM?
  const isWindows = useMemo(() => {
    return selectedOs.toLowerCase().includes('windows');
  }, [selectedOs]);

  const isDesktop = useMemo(() => {
    return selectedOs.toLowerCase().includes('desktop');
  }, [selectedOs]);

  const usesRDP = isWindows || isDesktop;

  // When OS changes, enforce minimum specs for Windows/Desktop
  useEffect(() => {
    if (isWindows) {
      if (memoryGB < 2) setMemoryGB(2);
      if (diskGB < 40) setDiskGB(40);
    } else if (isDesktop) {
      if (memoryGB < 2) setMemoryGB(2);
      if (diskGB < 25) setDiskGB(25);
    }
  }, [isWindows, isDesktop, memoryGB, diskGB]);

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

  // Get available templates for selected host — filtered by OS type
  const availableTemplates = useMemo(() => {
    const all = selectedHost?.proxmox_templates || [];
    if (!isWindows) {
      // Show Linux templates (exclude windows ones)
      return all.filter((t) => {
        const name = (t.name || '').toLowerCase();
        const osType = ((t as Record<string, unknown>).os_type as string || '').toLowerCase();
        return !name.includes('windows') && !osType.includes('windows');
      });
    }
    // Show Windows templates
    return all.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const osType = ((t as Record<string, unknown>).os_type as string || '').toLowerCase();
      return name.includes('windows') || osType.includes('windows');
    });
  }, [selectedHost, isWindows]);

  // Password validation
  const passwordErrors = useMemo(() => {
    const errors: string[] = [];
    if (!password) return errors;
    if (password.length < 12) errors.push('Must be at least 12 characters');
    if (isWindows) {
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasDigit = /[0-9]/.test(password);
      const hasSpecial = /[^A-Za-z0-9]/.test(password);
      const count = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
      if (count < 3) errors.push('Needs 3 of: uppercase, lowercase, digit, special character');
    }
    return errors;
  }, [password, isWindows]);

  // Validation
  const canSubmit = useMemo(() => {
    if (!vmName || !selectedHostId || !password) return false;
    if (!cpuCores || !memoryGB || !diskGB) return false;
    if (passwordErrors.length > 0) return false;
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(vmName)) return false;
    return true;
  }, [vmName, selectedHostId, password, cpuCores, memoryGB, diskGB, passwordErrors]);

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
          sshPassword: password,
          os: selectedOs,
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
        setMemoryGB(isWindows ? 2 : 2);
        setDiskGB(isWindows ? 40 : 20);
        setPassword('');
        setTemplateVmid(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'VM creation failed';
        setSubmitError(message);
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [canSubmit, selectedHost, selectedHostId, vmName, cpuCores, memoryGB, diskGB, password, templateVmid, selectedOs, isWindows, getAccessToken]
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

          {/* Operating System Selection */}
          <div className="space-y-2">
            <Label className="text-white">Operating System</Label>
            <select
              className="bg-black text-white border border-white/10 h-10 w-full rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-white/20"
              value={selectedOs}
              onChange={(e) => setSelectedOs(e.target.value)}
            >
              {OS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </option>
              ))}
            </select>
            <p className="text-white/40 text-sm mt-1">
              {usesRDP ? '🖥️ Remote Desktop (RDP) access on port 3389' : '🐧 Linux — SSH access on port 22'}
            </p>
          </div>

          {/* VM Name */}
          <div className="space-y-2">
            <Label className="text-white">VM Name</Label>
            <Input
              type="text"
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              placeholder={isWindows ? 'e.g., win-dc-01' : 'e.g., ubuntu-web-server-01'}
              className="bg-black text-white border-white/10"
            />
            {vmName && !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(vmName) && (
              <p className="text-red-400 text-sm">Alphanumeric and hyphens only, 1-63 characters</p>
            )}
          </div>

          {/* CPU Cores */}
          <div className="space-y-2">
            <Label className="text-white">vCPU Cores</Label>
            <Input
              type="number"
              min={1}
              max={64}
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
              min={isWindows ? 2 : 1}
              max={256}
              value={memoryGB}
              onChange={(e) => setMemoryGB(Math.max(isWindows ? 2 : 1, parseInt(e.target.value || '1', 10)))}
              className="bg-black text-white border-white/10"
            />
            {isWindows && memoryGB < 2 && (
              <p className="text-amber-400 text-sm">Windows requires minimum 2 GB</p>
            )}
          </div>

          {/* Disk Size */}
          <div className="space-y-2">
            <Label className="text-white">Disk (GB)</Label>
            <Input
              type="number"
              min={isWindows ? 40 : 10}
              max={2000}
              value={diskGB}
              onChange={(e) => setDiskGB(Math.max(isWindows ? 40 : 10, parseInt(e.target.value || '20', 10)))}
              className="bg-black text-white border-white/10"
            />
            {isWindows && diskGB < 40 && (
              <p className="text-amber-400 text-sm">Windows requires minimum 40 GB</p>
            )}
          </div>

          {/* Password — label changes based on OS */}
          <div className="space-y-2 md:col-span-2">
            <Label className="text-white">
              {usesRDP ? 'RDP Password' : 'SSH Root Password'}
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={usesRDP ? 'Enter a strong password for RDP access' : 'Enter a strong password for root access'}
              className="bg-black text-white border-white/10"
              autoComplete="new-password"
            />
            {passwordErrors.length > 0 && password && (
              <div className="space-y-1">
                {passwordErrors.map((err, i) => (
                  <p key={i} className="text-red-400 text-sm">• {err}</p>
                ))}
              </div>
            )}
            <p className="text-white/40 text-sm">
              {usesRDP
                ? `Used for Remote Desktop (RDP) access as ${isWindows ? 'admin' : 'ubuntu'}. Must meet complexity requirements.`
                : 'Used for initial SSH access. Minimum 12 characters.'}
            </p>
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

          {/* Access Info Banner */}
          <div className="md:col-span-2 p-3 bg-blue-900/15 border border-blue-500/20 rounded text-blue-300 text-sm">
            <p className="font-medium mb-1">
              {isWindows ? '🪟 Windows Access Details' : '🐧 Linux Access Details'}
            </p>
            {isWindows ? (
              <ul className="list-disc ml-4 space-y-0.5 text-blue-300/80 text-xs">
                <li>Connect via Remote Desktop (RDP) on port <strong>3389</strong></li>
                <li>Username: <code className="bg-blue-900/30 px-1 rounded">admin</code></li>
                <li>IP will be assigned automatically from the pool</li>
                <li>QEMU Guest Agent will be enabled for monitoring</li>
              </ul>
            ) : (
              <ul className="list-disc ml-4 space-y-0.5 text-blue-300/80 text-xs">
                <li>Connect via SSH on port <strong>22</strong></li>
                <li>Username: <code className="bg-blue-900/30 px-1 rounded">ubuntu</code></li>
                <li>IP will be assigned automatically from the pool</li>
              </ul>
            )}
          </div>

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
              {submitSuccess?.accessType === 'rdp' && (
                <p className="text-sm">Access: RDP (port 3389) as admin</p>
              )}
              {submitSuccess?.accessType === 'ssh' && (
                <p className="text-sm">Access: SSH (port 22) as ubuntu</p>
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
              {isSubmitting
                ? `Provisioning ${isWindows ? 'Windows' : 'Linux'} VM...`
                : `Create ${isWindows ? 'Windows' : 'Linux'} VM`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
