'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, Plus, Edit2, ChevronDown, ChevronUp } from 'lucide-react';

const SERVER_SERIES_OPTIONS = [
  { value: 'generic', label: 'Generic / existing setup' },
  { value: 'ovh_rise_game', label: 'OVH Rise / Game / legacy' },
  { value: 'ovh_advance_gen3', label: 'OVH Advance Gen3' },
  { value: 'ovh_high_grade_scale', label: 'OVH High Grade / Scale' },
] as const;

const NETWORK_MODE_OPTIONS = [
  { value: 'legacy_public_gateway', label: 'Legacy routed public gateway' },
  { value: 'ovh_failover_vmac', label: 'OVH Additional IP with vMAC' },
  { value: 'ovh_hg_scale_routed', label: 'OVH High Grade / Scale routed BYOIP' },
  { value: 'ovh_advance_gen3_routed', label: 'OVH Advance Gen3 routed BYOIP' },
  { value: 'ovh_vrack_block', label: 'OVH vRack routed block' },
] as const;

function defaultNetworkModeForSeries(series: string): string {
  if (series === 'ovh_high_grade_scale') return 'ovh_hg_scale_routed';
  if (series === 'ovh_advance_gen3') return 'ovh_advance_gen3_routed';
  if (series === 'ovh_rise_game') return 'ovh_failover_vmac';
  return 'legacy_public_gateway';
}

interface HostData {
  id: string;
  name: string;
  host_url: string;
  allow_insecure_tls: boolean;
  token_id: string | null;
  node: string;
  storage: string;
  bridge: string;
  template_vmid: number | null;
  gateway_ip: string | null;
  dns_primary: string | null;
  dns_secondary: string | null;
  provider: string | null;
  server_series: string | null;
  network_mode: string | null;
  vm_private_cidr: string | null;
  vm_private_gateway: string | null;
  vm_private_ip_start: number | null;
  public_prefix_length: number | null;
  snippet_storage: string | null;
  region: string;
  display_region: string;
  total_cpu_cores: number;
  total_memory_mb: number;
  total_disk_gb: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  public_ip_pools?: Array<{ id: string; mac: string; label?: string | null; public_ip_pool_ips?: Array<{ id: string; ip: string }> }>;
  proxmox_templates?: Array<{ id: string; vmid: number; name: string; os_type: string | null; os_display_name: string | null }>;
}

interface FormState {
  id?: string;
  name: string;
  host_url: string;
  allow_insecure_tls: boolean;
  token_id: string;
  token_secret: string;
  username: string;
  password: string;
  node: string;
  storage: string;
  bridge: string;
  gateway_ip: string;
  dns_primary: string;
  dns_secondary: string;
  provider: string;
  server_series: string;
  network_mode: string;
  vm_private_cidr: string;
  vm_private_gateway: string;
  vm_private_ip_start: string;
  public_prefix_length: string;
  snippet_storage: string;
  template_vmid: string;
  region: string;
  display_region: string;
  total_cpu_cores: string;
  total_memory_mb: string;
  total_disk_gb: string;
  is_active: boolean;
  ipAddresses: Array<{ ip: string; mac: string; label?: string }>;
  templates: Array<{ name: string; vmid: string; os_type: string; os_display_name: string }>;
}

const emptyForm: FormState = {
  name: '',
  host_url: '',
  allow_insecure_tls: false,
  token_id: '',
  token_secret: '',
  username: '',
  password: '',
  node: '',
  storage: 'local',
  bridge: 'vmbr0',
  gateway_ip: '',
  dns_primary: '',
  dns_secondary: '',
  provider: 'ovh',
  server_series: 'generic',
  network_mode: 'legacy_public_gateway',
  vm_private_cidr: '',
  vm_private_gateway: '',
  vm_private_ip_start: '10',
  public_prefix_length: '32',
  snippet_storage: 'local',
  template_vmid: '',
  region: '',
  display_region: '',
  total_cpu_cores: '',
  total_memory_mb: '',
  total_disk_gb: '',
  is_active: true,
  ipAddresses: [],
  templates: [],
};

export function ProxmoxHostsManager() {
  const [hosts, setHosts] = useState<HostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [expandedHostId, setExpandedHostId] = useState<string | null>(null);
  const [usedIps, setUsedIps] = useState<Set<string>>(new Set());
  const isPrivateRoutedMode = form.network_mode === 'ovh_hg_scale_routed' || form.network_mode === 'ovh_advance_gen3_routed';
  const isVrackMode = form.network_mode === 'ovh_vrack_block';

  // Load hosts + used IPs
  const loadHosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hostsRes, serversRes] = await Promise.all([
        fetch('/api/admin/proxmox/hosts'),
        fetch('/api/admin/proxmox/hosts?action=used-ips'),
      ]);
      const data = await hostsRes.json();
      if (!hostsRes.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load hosts');
      }
      setHosts(data.hosts || []);
      
      if (serversRes.ok) {
        const ipsData = await serversRes.json();
        setUsedIps(new Set(ipsData.usedIps || []));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load hosts';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  // Reset form
  const resetForm = useCallback(() => {
    setForm(emptyForm);
  }, []);

  // Edit host
  const handleEdit = useCallback((host: HostData) => {
    setForm({
      id: host.id,
      name: host.name,
      host_url: host.host_url,
      allow_insecure_tls: host.allow_insecure_tls,
      token_id: host.token_id || '',
      token_secret: '',
      username: '',
      password: '',
      node: host.node,
      storage: host.storage,
      bridge: host.bridge,
      gateway_ip: host.gateway_ip || '',
      dns_primary: host.dns_primary || '',
      dns_secondary: host.dns_secondary || '',
      provider: host.provider || 'ovh',
      server_series: host.server_series || 'generic',
      network_mode: host.network_mode || 'legacy_public_gateway',
      vm_private_cidr: host.vm_private_cidr || '',
      vm_private_gateway: host.vm_private_gateway || '',
      vm_private_ip_start: host.vm_private_ip_start?.toString() || '10',
      public_prefix_length: host.public_prefix_length?.toString() || '32',
      snippet_storage: host.snippet_storage || 'local',
      template_vmid: host.template_vmid?.toString() || '',
      region: host.region || '',
      display_region: host.display_region || '',
      total_cpu_cores: host.total_cpu_cores?.toString() || '',
      total_memory_mb: host.total_memory_mb?.toString() || '',
      total_disk_gb: host.total_disk_gb?.toString() || '',
      is_active: host.is_active,
      ipAddresses: host.public_ip_pools?.flatMap(p =>
        (p.public_ip_pool_ips || []).map(ip => ({ ip: ip.ip, mac: p.mac, label: p.label || '' }))
      ) || [],
      templates: host.proxmox_templates?.map(t => ({
        name: t.name,
        vmid: t.vmid.toString(),
        os_type: t.os_type || '',
        os_display_name: t.os_display_name || '',
      })) || [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Add IP address
  const addIpAddress = useCallback(() => {
    setForm(prev => ({
      ...prev,
      ipAddresses: [...prev.ipAddresses, { ip: '', mac: '', label: isPrivateRoutedMode || isVrackMode ? 'BYOIP routed' : 'OVH Additional IP' }]
    }));
  }, [isPrivateRoutedMode, isVrackMode]);

  // Remove IP address
  const removeIpAddress = useCallback((idx: number) => {
    setForm(prev => ({
      ...prev,
      ipAddresses: prev.ipAddresses.filter((_, i) => i !== idx)
    }));
  }, []);

  // Add template
  const addTemplate = useCallback(() => {
    setForm(prev => ({
      ...prev,
      templates: [...prev.templates, { name: '', vmid: '', os_type: '', os_display_name: '' }]
    }));
  }, []);

  // Remove template
  const removeTemplate = useCallback((idx: number) => {
    setForm(prev => ({
      ...prev,
      templates: prev.templates.filter((_, i) => i !== idx)
    }));
  }, []);

  // Delete host
  const handleDelete = useCallback(async (hostId: string, hostName: string) => {
    if (!confirm(`Are you sure you want to delete host "${hostName}"? This will also delete all associated IP pools and templates.`)) {
      return;
    }

    try {
      // First attempt without force
      let res = await fetch(`/api/admin/proxmox/hosts?id=${encodeURIComponent(hostId)}`, {
        method: 'DELETE',
      });

      let data = await res.json();

      // If there are existing servers, ask for confirmation to force delete
      if (!res.ok && data.requiresForce) {
        const serverCount = data.serverCount || 0;
        const forceConfirm = confirm(
          `This host has ${serverCount} existing server(s). Do you want to delete the host AND all its servers?\n\nThis action cannot be undone!`
        );

        if (!forceConfirm) {
          return;
        }

        // Retry with force=true
        res = await fetch(`/api/admin/proxmox/hosts?id=${encodeURIComponent(hostId)}&force=true`, {
          method: 'DELETE',
        });

        data = await res.json();
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Delete failed');
      }

      toast.success('Host deleted successfully');
      await loadHosts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      toast.error(msg);
    }
  }, [loadHosts]);

  // Submit
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name || !form.host_url || !form.node) {
      toast.error('Name, host URL, and node are required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: form.id,
        name: form.name,
        host_url: form.host_url,
        allow_insecure_tls: form.allow_insecure_tls,
        token_id: form.token_id || undefined,
        token_secret: form.token_secret || undefined,
        username: form.username || undefined,
        password: form.password || undefined,
        node: form.node,
        storage: form.storage,
        bridge: form.bridge,
        gateway_ip: form.gateway_ip || undefined,
        dns_primary: form.dns_primary || undefined,
        dns_secondary: form.dns_secondary || undefined,
        provider: form.provider || 'ovh',
        server_series: form.server_series,
        network_mode: form.network_mode,
        vm_private_cidr: form.vm_private_cidr || undefined,
        vm_private_gateway: form.vm_private_gateway || undefined,
        vm_private_ip_start: form.vm_private_ip_start ? Number(form.vm_private_ip_start) : undefined,
        public_prefix_length: form.public_prefix_length ? Number(form.public_prefix_length) : undefined,
        snippet_storage: form.snippet_storage || 'local',
        template_vmid: form.template_vmid ? Number(form.template_vmid) : undefined,
        region: form.region || undefined,
        display_region: form.display_region || undefined,
        total_cpu_cores: form.total_cpu_cores ? Number(form.total_cpu_cores) : undefined,
        total_memory_mb: form.total_memory_mb ? Number(form.total_memory_mb) : undefined,
        total_disk_gb: form.total_disk_gb ? Number(form.total_disk_gb) : undefined,
        is_active: form.is_active,
        pools: form.ipAddresses
          .filter(a => a.ip && (a.mac || isPrivateRoutedMode || isVrackMode))
          .map(a => ({ mac: a.mac || `route:${a.ip}`, ips: [a.ip], label: a.label || (isPrivateRoutedMode || isVrackMode ? 'BYOIP routed' : 'OVH Additional IP') })),
        templates: form.templates.filter(t => t.name && t.vmid),
      };

      const res = await fetch('/api/admin/proxmox/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Save failed');
      }

      toast.success('Host saved successfully');
      resetForm();
      await loadHosts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [form, isPrivateRoutedMode, isVrackMode, resetForm, loadHosts]);

  return (
    <div className="space-y-6">
      {/* Form Card */}
      <Card className="bg-black/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">{form.id ? 'Edit Host' : 'Add Proxmox Host'}</CardTitle>
          <CardDescription className="text-white/60">
            Configure a Proxmox host for VPS provisioning. Add credentials, network settings, and templates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-white">Host Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Production Proxmox 1"
                  className="bg-black/50 text-white border-white/10 mt-1"
                />
              </div>
              <div>
                <Label className="text-white">Host URL *</Label>
                <Input
                  value={form.host_url}
                  onChange={(e) => setForm(prev => ({ ...prev, host_url: e.target.value }))}
                  placeholder="https://pve1.example.com:8006"
                  className="bg-black/50 text-white border-white/10 mt-1"
                />
              </div>
              <div>
                <Label className="text-white">Node Name *</Label>
                <Input
                  value={form.node}
                  onChange={(e) => setForm(prev => ({ ...prev, node: e.target.value }))}
                  placeholder="e.g., pve1"
                  className="bg-black/50 text-white border-white/10 mt-1"
                />
              </div>
              <div>
                <Label className="text-white">Storage</Label>
                <Input
                  value={form.storage}
                  onChange={(e) => setForm(prev => ({ ...prev, storage: e.target.value }))}
                  placeholder="local"
                  className="bg-black/50 text-white border-white/10 mt-1"
                />
              </div>
              <div>
                <Label className="text-white">Bridge</Label>
                <Input
                  value={form.bridge}
                  onChange={(e) => setForm(prev => ({ ...prev, bridge: e.target.value }))}
                  placeholder="vmbr0"
                  className="bg-black/50 text-white border-white/10 mt-1"
                />
              </div>
              <div>
                <Label className="text-white">Template VMID</Label>
                <Input
                  type="number"
                  value={form.template_vmid}
                  onChange={(e) => setForm(prev => ({ ...prev, template_vmid: e.target.value }))}
                  placeholder="e.g., 9001"
                  className="bg-black/50 text-white border-white/10 mt-1"
                />
              </div>
            </div>

            {/* Provider & Network Profile */}
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-white font-semibold mb-3">Provider & Network Profile</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-white">Provider</Label>
                  <Select value={form.provider} onValueChange={(value) => setForm(prev => ({ ...prev, provider: value }))}>
                    <SelectTrigger className="bg-black/50 text-white border-white/10 mt-1 w-full">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ovh">OVHcloud</SelectItem>
                      <SelectItem value="generic">Generic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white">Server Series</Label>
                  <Select
                    value={form.server_series}
                    onValueChange={(value) => setForm(prev => ({
                      ...prev,
                      server_series: value,
                      network_mode: defaultNetworkModeForSeries(value),
                    }))}
                  >
                    <SelectTrigger className="bg-black/50 text-white border-white/10 mt-1 w-full">
                      <SelectValue placeholder="Server series" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVER_SERIES_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white">Network Mode</Label>
                  <Select value={form.network_mode} onValueChange={(value) => setForm(prev => ({ ...prev, network_mode: value }))}>
                    <SelectTrigger className="bg-black/50 text-white border-white/10 mt-1 w-full">
                      <SelectValue placeholder="Network mode" />
                    </SelectTrigger>
                    <SelectContent>
                      {NETWORK_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Region & Capacity */}
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-white font-semibold mb-3">Region & Capacity</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-white">Region Slug *</Label>
                  <Input
                    value={form.region}
                    onChange={(e) => setForm(prev => ({ ...prev, region: e.target.value }))}
                    placeholder="e.g., france, india, us-east"
                    className="bg-black/50 text-white border-white/10 mt-1"
                  />
                  <p className="text-xs text-white/50 mt-1">Hosts with the same slug are grouped into one region for customers</p>
                </div>
                <div>
                  <Label className="text-white">Display Region Name *</Label>
                  <Input
                    value={form.display_region}
                    onChange={(e) => setForm(prev => ({ ...prev, display_region: e.target.value }))}
                    placeholder="e.g., France, India, US East"
                    className="bg-black/50 text-white border-white/10 mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-white">Total CPU Cores</Label>
                  <Input
                    type="number"
                    value={form.total_cpu_cores}
                    onChange={(e) => setForm(prev => ({ ...prev, total_cpu_cores: e.target.value }))}
                    placeholder="e.g., 64"
                    className="bg-black/50 text-white border-white/10 mt-1"
                  />
                  <p className="text-xs text-white/50 mt-1">Max vCPU cores to allocate on this host</p>
                </div>
                <div>
                  <Label className="text-white">Total Memory (MB)</Label>
                  <Input
                    type="number"
                    value={form.total_memory_mb}
                    onChange={(e) => setForm(prev => ({ ...prev, total_memory_mb: e.target.value }))}
                    placeholder="e.g., 131072 (128 GB)"
                    className="bg-black/50 text-white border-white/10 mt-1"
                  />
                  <p className="text-xs text-white/50 mt-1">Max memory in MB to allocate on this host</p>
                </div>
                <div>
                  <Label className="text-white">Total Disk (GB)</Label>
                  <Input
                    type="number"
                    value={form.total_disk_gb}
                    onChange={(e) => setForm(prev => ({ ...prev, total_disk_gb: e.target.value }))}
                    placeholder="e.g., 2000"
                    className="bg-black/50 text-white border-white/10 mt-1"
                  />
                  <p className="text-xs text-white/50 mt-1">Max disk in GB to allocate on this host</p>
                </div>
              </div>
            </div>

            {/* Authentication */}
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-white font-semibold mb-3">Authentication</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={form.allow_insecure_tls}
                    onCheckedChange={(v) => setForm(prev => ({ ...prev, allow_insecure_tls: !!v }))}
                    className="border-white/20"
                  />
                  <label className="text-white/80 text-sm cursor-pointer">Allow insecure TLS (self-signed certs)</label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">Token ID</Label>
                    <Input
                      value={form.token_id}
                      onChange={(e) => setForm(prev => ({ ...prev, token_id: e.target.value }))}
                      placeholder="user@pam!token-name"
                      className="bg-black/50 text-white border-white/10 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-white">Token Secret</Label>
                    <Input
                      type="password"
                      value={form.token_secret}
                      onChange={(e) => setForm(prev => ({ ...prev, token_secret: e.target.value }))}
                      placeholder="••••••••••••••••••••"
                      className="bg-black/50 text-white border-white/10 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-white">Username (fallback)</Label>
                    <Input
                      value={form.username}
                      onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="root@pam"
                      className="bg-black/50 text-white border-white/10 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-white">Password (fallback)</Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="••••••••••••••••••••"
                      className="bg-black/50 text-white border-white/10 mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Network */}
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-white font-semibold mb-3">Network Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-white">{isPrivateRoutedMode ? 'Host Public Gateway' : 'Gateway IP'}</Label>
                  <Input
                    value={form.gateway_ip}
                    onChange={(e) => setForm(prev => ({ ...prev, gateway_ip: e.target.value }))}
                    placeholder={isPrivateRoutedMode ? '100.64.0.1' : '192.168.1.1'}
                    className="bg-black/50 text-white border-white/10 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">DNS Primary</Label>
                  <Input
                    value={form.dns_primary}
                    onChange={(e) => setForm(prev => ({ ...prev, dns_primary: e.target.value }))}
                    placeholder="8.8.8.8"
                    className="bg-black/50 text-white border-white/10 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">DNS Secondary</Label>
                  <Input
                    value={form.dns_secondary}
                    onChange={(e) => setForm(prev => ({ ...prev, dns_secondary: e.target.value }))}
                    placeholder="8.8.4.4"
                    className="bg-black/50 text-white border-white/10 mt-1"
                  />
                </div>
              </div>
              {(isPrivateRoutedMode || isVrackMode) && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  {isPrivateRoutedMode && (
                    <>
                      <div>
                        <Label className="text-white">VM Private CIDR</Label>
                        <Input
                          value={form.vm_private_cidr}
                          onChange={(e) => setForm(prev => ({ ...prev, vm_private_cidr: e.target.value }))}
                          placeholder="192.168.0.0/24"
                          className="bg-black/50 text-white border-white/10 mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-white">VM Private Gateway</Label>
                        <Input
                          value={form.vm_private_gateway}
                          onChange={(e) => setForm(prev => ({ ...prev, vm_private_gateway: e.target.value }))}
                          placeholder="192.168.0.1"
                          className="bg-black/50 text-white border-white/10 mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-white">Private IP Start</Label>
                        <Input
                          type="number"
                          value={form.vm_private_ip_start}
                          onChange={(e) => setForm(prev => ({ ...prev, vm_private_ip_start: e.target.value }))}
                          placeholder="10"
                          className="bg-black/50 text-white border-white/10 mt-1"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <Label className="text-white">Public Prefix Length</Label>
                    <Input
                      type="number"
                      value={form.public_prefix_length}
                      onChange={(e) => setForm(prev => ({ ...prev, public_prefix_length: e.target.value }))}
                      placeholder={isVrackMode ? '28' : '32'}
                      className="bg-black/50 text-white border-white/10 mt-1"
                    />
                  </div>
                  {isPrivateRoutedMode && (
                    <div>
                      <Label className="text-white">Snippet Storage</Label>
                      <Input
                        value={form.snippet_storage}
                        onChange={(e) => setForm(prev => ({ ...prev, snippet_storage: e.target.value }))}
                        placeholder="local"
                        className="bg-black/50 text-white border-white/10 mt-1"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* IP Addresses */}
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">IP Addresses</h3>
                <Button
                  type="button"
                  onClick={addIpAddress}
                  size="sm"
                  className="bg-blue-600/20 text-blue-400 border border-blue-400/30 hover:bg-blue-600/30"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add IP
                </Button>
              </div>
              <p className="text-xs text-white/50 mb-3">
                {isVrackMode || isPrivateRoutedMode
                  ? 'Add usable BYOIP/Additional IP addresses. MAC can be left empty for routed BYOIP/vRack profiles.'
                  : 'Each IP requires its own unique vMAC from OVH unless this host uses route-only networking.'}
              </p>
              {form.ipAddresses.length > 0 && (
                <div className="flex gap-2 text-xs text-white/40 px-1 mb-1">
                  <span className="flex-1">IP Address</span>
                  <span className="flex-1">vMAC Address</span>
                  <span className="flex-1">Pool Label</span>
                  <span className="w-9" />
                </div>
              )}
              <div className="space-y-2">
                {form.ipAddresses.map((entry, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Input
                        value={entry.ip}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          ipAddresses: prev.ipAddresses.map((a, i) => i === idx ? { ...a, ip: e.target.value } : a)
                        }))}
                        placeholder="203.0.113.10"
                        className="bg-black/50 text-white border-white/10"
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        value={entry.mac}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          ipAddresses: prev.ipAddresses.map((a, i) => i === idx ? { ...a, mac: e.target.value } : a)
                        }))}
                        placeholder="02:00:00:17:73:3d"
                        className="bg-black/50 text-white border-white/10"
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        value={entry.label || ''}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          ipAddresses: prev.ipAddresses.map((a, i) => i === idx ? { ...a, label: e.target.value } : a)
                        }))}
                        placeholder={isVrackMode || isPrivateRoutedMode ? 'BYOIP routed' : 'OVH Additional IP'}
                        className="bg-black/50 text-white border-white/10"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => removeIpAddress(idx)}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Templates */}
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">OS Templates</h3>
                <Button
                  type="button"
                  onClick={addTemplate}
                  size="sm"
                  className="bg-blue-600/20 text-blue-400 border border-blue-400/30 hover:bg-blue-600/30"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Template
                </Button>
              </div>
              <div className="space-y-3">
                {form.templates.map((tpl, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-white/80 text-sm">Name</Label>
                      <Input
                        value={tpl.name}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          templates: prev.templates.map((t, i) => i === idx ? { ...t, name: e.target.value } : t)
                        }))}
                        placeholder="ubuntu-22.04"
                        className="bg-black/50 text-white border-white/10 mt-1"
                      />
                    </div>
                    <div className="w-24">
                      <Label className="text-white/80 text-sm">VMID</Label>
                      <Input
                        type="number"
                        value={tpl.vmid}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          templates: prev.templates.map((t, i) => i === idx ? { ...t, vmid: e.target.value } : t)
                        }))}
                        placeholder="9001"
                        className="bg-black/50 text-white border-white/10 mt-1"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-white/80 text-sm">OS Type</Label>
                      <Input
                        value={tpl.os_type}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          templates: prev.templates.map((t, i) => i === idx ? { ...t, os_type: e.target.value } : t)
                        }))}
                        placeholder="ubuntu"
                        className="bg-black/50 text-white border-white/10 mt-1"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-white/80 text-sm">Display Name</Label>
                      <Input
                        value={tpl.os_display_name}
                        onChange={(e) => setForm(prev => ({
                          ...prev,
                          templates: prev.templates.map((t, i) => i === idx ? { ...t, os_display_name: e.target.value } : t)
                        }))}
                        placeholder="Ubuntu 24.04 LTS"
                        className="bg-black/50 text-white border-white/10 mt-1"
                      />
                      <p className="text-xs text-white/50 mt-0.5">Same display name = same OS across hosts</p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => removeTemplate(idx)}
                      variant="destructive"
                      size="sm"
                      className="mb-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Checkbox */}
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm(prev => ({ ...prev, is_active: !!v }))}
                  className="border-white/20"
                />
                <label className="text-white/80 cursor-pointer">Active</label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 border-t border-white/10 pt-4">
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {saving ? 'Saving...' : 'Save Host'}
              </Button>
              {form.id && (
                <Button
                  type="button"
                  onClick={resetForm}
                  variant="outline"
                  className="border-white/10 text-white hover:bg-white/10"
                >
                  Clear Form
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Hosts List */}
      <Card className="bg-black/50 border-white/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white">Proxmox Hosts</CardTitle>
            <CardDescription className="text-white/60">Configured Proxmox hosts and their resources</CardDescription>
          </div>
          <Button
            onClick={loadHosts}
            disabled={loading}
            className="bg-white/10 text-white border border-white/10 hover:bg-white/15"
          >
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded mb-4">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-white/60 text-center py-8">Loading hosts...</div>
          ) : hosts.length === 0 ? (
            <div className="text-white/60 text-center py-8">No hosts configured yet</div>
          ) : (
            <div className="space-y-3">
              {hosts.map((host) => (
                <div key={host.id} className="border border-white/10 rounded-lg p-4 bg-black/30">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedHostId(expandedHostId === host.id ? null : host.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-semibold">{host.name}</h3>
                        {host.is_active ? (
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">Active</span>
                        ) : (
                          <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-1 rounded">Inactive</span>
                        )}
                      </div>
                      <p className="text-white/60 text-sm mt-1">{host.host_url}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(host);
                        }}
                        size="sm"
                        className="bg-white/10 text-white hover:bg-white/20"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(host.id, host.name);
                        }}
                        size="sm"
                        variant="destructive"
                        className="bg-red-600/20 text-red-400 border border-red-400/30 hover:bg-red-600/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      {expandedHostId === host.id ? (
                        <ChevronUp className="w-5 h-5 text-white/60" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-white/60" />
                      )}
                    </div>
                  </div>

                  {expandedHostId === host.id && (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-white/60">Node</p>
                          <p className="text-white">{host.node}</p>
                        </div>
                        <div>
                          <p className="text-white/60">Region</p>
                          <p className="text-white">{host.display_region || host.region || '-'}</p>
                        </div>
                        <div>
                          <p className="text-white/60">Storage</p>
                          <p className="text-white">{host.storage}</p>
                        </div>
                        <div>
                          <p className="text-white/60">Bridge</p>
                          <p className="text-white">{host.bridge}</p>
                        </div>
                        <div>
                          <p className="text-white/60">Network</p>
                          <p className="text-white">{host.network_mode || 'legacy_public_gateway'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-white/60">Total CPU</p>
                          <p className="text-white">{host.total_cpu_cores || 0} cores</p>
                        </div>
                        <div>
                          <p className="text-white/60">Total Memory</p>
                          <p className="text-white">{host.total_memory_mb ? `${Math.round(host.total_memory_mb / 1024)} GB` : '0 GB'}</p>
                        </div>
                        <div>
                          <p className="text-white/60">Total Disk</p>
                          <p className="text-white">{host.total_disk_gb || 0} GB</p>
                        </div>
                      </div>

                      {host.public_ip_pools && host.public_ip_pools.length > 0 && (
                        <div>
                          <p className="text-white/80 font-semibold text-sm mb-2">
                            IP Addresses:
                            <span className="ml-2 font-normal text-xs">
                              <span className="text-green-400">
                                {host.public_ip_pools.reduce((count, pool) => 
                                  count + (pool.public_ip_pool_ips?.filter(ip => !usedIps.has(ip.ip)).length || 0), 0
                                )} available
                              </span>
                              {' / '}
                              <span className="text-red-400">
                                {host.public_ip_pools.reduce((count, pool) => 
                                  count + (pool.public_ip_pool_ips?.filter(ip => usedIps.has(ip.ip)).length || 0), 0
                                )} used
                              </span>
                            </span>
                          </p>
                          <div className="space-y-1">
                            {host.public_ip_pools.map((pool) =>
                              pool.public_ip_pool_ips?.map((ip) => {
                                const inUse = usedIps.has(ip.ip);
                                return (
                                  <div key={ip.id} className="flex items-center gap-2 ml-2 text-xs">
                                    <span className={`w-2 h-2 rounded-full ${inUse ? 'bg-red-500' : 'bg-green-500'}`} />
                                    <span className="text-white/70 font-mono">{ip.ip}</span>
                                    <span className="text-white/40">MAC: {pool.mac || '-'}</span>
                                    {pool.label && <span className="text-white/40">Label: {pool.label}</span>}
                                    {inUse && (
                                      <span className="text-red-400/80 text-[10px] px-1.5 py-0.5 bg-red-500/10 rounded">
                                        in use
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                      {host.proxmox_templates && host.proxmox_templates.length > 0 && (
                        <div>
                          <p className="text-white/80 font-semibold text-sm mb-2">Templates:</p>
                          <div className="space-y-1">
                            {host.proxmox_templates.map((tpl) => (
                              <p key={tpl.id} className="text-white/70 text-xs ml-2">
                                • {tpl.name} (VMID: {tpl.vmid}, Type: {tpl.os_type || 'N/A'})
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
