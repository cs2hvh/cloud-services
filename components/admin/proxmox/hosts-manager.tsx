'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Trash2, Plus, Edit2, ChevronDown, ChevronUp,
  Server, Cpu, MemoryStick, HardDrive, Globe, Sparkles, Settings2, X,
} from 'lucide-react';

import { VmacSyncPanel } from './vmac-sync-panel';
import { AutoSetupPanel } from './auto-setup-panel';

const SERVER_SERIES_OPTIONS = [
  { value: 'generic', label: 'Generic / existing setup' },
  { value: 'ovh_rise_game', label: 'Entry-tier bare metal (Rise / Game)' },
  { value: 'ovh_advance_gen3', label: 'Mid-tier bare metal (Advance Gen3)' },
  { value: 'ovh_high_grade_scale', label: 'High-grade / scale bare metal' },
] as const;

const NETWORK_MODE_OPTIONS = [
  { value: 'legacy_public_gateway', label: 'Legacy routed public gateway' },
  { value: 'ovh_failover_vmac', label: 'Failover IP with virtual MAC' },
  { value: 'ovh_hg_scale_routed', label: 'High-grade routed BYOIP' },
  { value: 'ovh_advance_gen3_routed', label: 'Mid-tier routed BYOIP' },
  { value: 'ovh_vrack_block', label: 'vRack routed IP block' },
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

type PanelMode = 'closed' | 'add' | 'edit';
type AddTab = 'auto' | 'manual';

export function ProxmoxHostsManager() {
  const [hosts, setHosts] = useState<HostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [expandedHostId, setExpandedHostId] = useState<string | null>(null);
  const [usedIps, setUsedIps] = useState<Set<string>>(new Set());
  const [panelMode, setPanelMode] = useState<PanelMode>('closed');
  const [addTab, setAddTab] = useState<AddTab>('auto');
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
    setPanelMode('closed');
  }, []);

  // Edit host
  const handleEdit = useCallback((host: HostData) => {
    setPanelMode('edit');
    setAddTab('manual'); // edit always uses the manual form (it has all fields)
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
      ipAddresses: [...prev.ipAddresses, { ip: '', mac: '', label: isPrivateRoutedMode || isVrackMode ? 'BYOIP routed' : 'Failover IP' }]
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
          .map(a => ({ mac: a.mac || `route:${a.ip}`, ips: [a.ip], label: a.label || (isPrivateRoutedMode || isVrackMode ? 'BYOIP routed' : 'Failover IP') })),
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

  // Summary metrics (computed from loaded hosts)
  const totals = useMemo(() => {
    const active = hosts.filter((h) => h.is_active).length;
    const cores = hosts.reduce((s, h) => s + (h.total_cpu_cores || 0), 0);
    const ram = hosts.reduce((s, h) => s + (h.total_memory_mb || 0), 0);
    const disk = hosts.reduce((s, h) => s + (h.total_disk_gb || 0), 0);
    return { active, cores, ram, disk };
  }, [hosts]);

  return (
    <div className="space-y-6 pb-12">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={<Server className="h-4 w-4" />} label="Hosts" value={String(hosts.length)} sub={`${totals.active} active`} />
        <MetricCard icon={<Cpu className="h-4 w-4" />} label="vCPU cores" value={String(totals.cores)} sub="aggregate" />
        <MetricCard icon={<MemoryStick className="h-4 w-4" />} label="Memory" value={formatMem(totals.ram)} sub="aggregate" />
        <MetricCard icon={<HardDrive className="h-4 w-4" />} label="Storage" value={formatDisk(totals.disk)} sub="aggregate" />
      </div>

      {/* Hosts list (always visible — primary content) */}
      <Card className="bg-black/40 border-white/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white text-base">Proxmox hosts</CardTitle>
            <CardDescription className="text-white/55 text-xs mt-0.5">
              {hosts.length === 0
                ? 'No hosts configured. Add one to start provisioning.'
                : `${hosts.length} host${hosts.length === 1 ? '' : 's'} configured across ${
                    new Set(hosts.map((h) => h.region || 'default')).size
                  } region${new Set(hosts.map((h) => h.region || 'default')).size === 1 ? '' : 's'}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={loadHosts}
              disabled={loading}
              size="sm"
              variant="outline"
              className="border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] hover:text-white"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            {panelMode === 'closed' && (
              <Button
                onClick={() => { resetForm(); setPanelMode('add'); setAddTab('auto'); }}
                size="sm"
                className="bg-[#0095FF] text-white hover:bg-[#0aa0ff]"
              >
                <Plus className="w-4 h-4 mr-1" /> Add host
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded mb-4 text-sm">
              {error}
            </div>
          )}
          {loading ? (
            <div className="text-white/55 text-center py-10 text-sm">Loading hosts…</div>
          ) : hosts.length === 0 ? (
            <div className="border border-dashed border-white/15 rounded-md py-10 text-center">
              <Server className="h-8 w-8 mx-auto text-white/30 mb-2" />
              <p className="text-white/60 text-sm">No hosts configured yet.</p>
              <p className="text-white/40 text-xs mt-1">Click &quot;Add host&quot; to register your first Proxmox host.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {hosts.map((host) => (
                <HostListItem
                  key={host.id}
                  host={host}
                  expanded={expandedHostId === host.id}
                  onToggle={() => setExpandedHostId(expandedHostId === host.id ? null : host.id)}
                  onEdit={() => handleEdit(host)}
                  onDelete={() => handleDelete(host.id, host.name)}
                  usedIps={usedIps}
                  loadHosts={loadHosts}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit panel (conditional) */}
      {panelMode !== 'closed' && (
        <Card className="bg-black/40 border-white/10">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex-1">
              <CardTitle className="text-white text-base flex items-center gap-2">
                {panelMode === 'edit' ? <Settings2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-[#0095FF]" />}
                {panelMode === 'edit' ? `Edit host — ${form.name}` : 'Add a new Proxmox host'}
              </CardTitle>
              <CardDescription className="text-white/55 text-xs mt-0.5">
                {panelMode === 'edit'
                  ? 'Modify the configuration of an existing host.'
                  : 'Auto-setup probes the host, builds templates, and seeds IP pools in one streamed run.'}
              </CardDescription>
              {panelMode === 'add' && (
                <div className="mt-3 inline-flex border border-white/10 bg-black/30 rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAddTab('auto')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      addTab === 'auto'
                        ? 'bg-[#0095FF] text-white'
                        : 'text-white/55 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    Auto-setup (recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddTab('manual')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      addTab === 'manual'
                        ? 'bg-[#0095FF] text-white'
                        : 'text-white/55 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    Manual configuration
                  </button>
                </div>
              )}
            </div>
            <Button
              onClick={resetForm}
              size="sm"
              variant="outline"
              className="border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Close
            </Button>
          </CardHeader>
          <CardContent>
            {panelMode === 'add' && addTab === 'auto' ? (
              <AutoSetupPanel onCreated={() => { loadHosts(); resetForm(); }} />
            ) : (
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
                  : 'Each IP requires its own unique virtual MAC unless this host uses route-only networking.'}
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
                        placeholder={isVrackMode || isPrivateRoutedMode ? 'BYOIP routed' : 'Failover IP'}
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
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="border border-white/10 bg-black/40 px-4 py-3 rounded-md">
      <div className="flex items-center gap-2 text-white/45 text-[11px] uppercase tracking-[0.14em]">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {sub && <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
}

function HostListItem({
  host,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  usedIps,
  loadHosts,
}: {
  host: HostData;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  usedIps: Set<string>;
  loadHosts: () => void;
}) {
  const ipStats = useMemo(() => {
    let available = 0;
    let used = 0;
    for (const pool of host.public_ip_pools ?? []) {
      for (const r of pool.public_ip_pool_ips ?? []) {
        if (usedIps.has(r.ip)) used++;
        else available++;
      }
    }
    return { available, used, total: available + used };
  }, [host.public_ip_pools, usedIps]);

  const templatesCount = host.proxmox_templates?.length ?? 0;
  const hostUrlShort = host.host_url.replace(/^https?:\/\//, '').replace(/:8006\/?$/, '');

  return (
    <div className="border border-white/10 rounded-md bg-black/30 overflow-hidden transition-colors hover:border-white/15">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded bg-[#0095FF]/10 border border-[#0095FF]/25">
          <Server className="h-4 w-4 text-[#0095FF]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-medium text-sm truncate">{host.name}</h3>
            {host.is_active ? (
              <span className="text-[10px] font-medium uppercase tracking-wider bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded">
                Active
              </span>
            ) : (
              <span className="text-[10px] font-medium uppercase tracking-wider bg-white/10 text-white/40 px-1.5 py-0.5 rounded">
                Inactive
              </span>
            )}
            {host.display_region && (
              <span className="text-[10px] text-white/55 bg-white/[0.04] border border-white/10 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {host.display_region}
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/40 mt-0.5 font-mono truncate">{hostUrlShort}</p>
        </div>
        <div className="hidden md:flex items-center gap-4 text-[11px] text-white/60 shrink-0">
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-wider">CPU</p>
            <p className="text-white font-medium">{host.total_cpu_cores || 0}</p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-wider">RAM</p>
            <p className="text-white font-medium">{formatMem(host.total_memory_mb || 0)}</p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-wider">Disk</p>
            <p className="text-white font-medium">{formatDisk(host.total_disk_gb || 0)}</p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase tracking-wider">IPs</p>
            <p className="text-white font-medium">
              {ipStats.available}
              <span className="text-white/40">/{ipStats.total}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 border-red-500/20 bg-red-500/[0.06] text-red-300/80 hover:bg-red-500/15 hover:text-red-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          {expanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 bg-black/20 px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <DetailField label="Node" value={host.node} />
            <DetailField label="Storage" value={host.storage} />
            <DetailField label="Bridge" value={host.bridge} />
            <DetailField label="Network mode" value={host.network_mode || 'legacy_public_gateway'} />
            <DetailField label="Templates" value={String(templatesCount)} />
          </div>

          {(host.public_ip_pools?.length ?? 0) > 0 && (
            <div>
              <p className="text-white/70 text-xs font-semibold mb-2">
                IP addresses{' '}
                <span className="font-normal text-[11px] text-white/45">
                  · <span className="text-emerald-300">{ipStats.available} free</span> · <span className="text-amber-300">{ipStats.used} in use</span>
                </span>
              </p>
              <div className="max-h-48 overflow-y-auto rounded border border-white/10 bg-black/30 p-2 space-y-0.5">
                {host.public_ip_pools!.flatMap((pool) =>
                  (pool.public_ip_pool_ips ?? []).map((ip) => {
                    const inUse = usedIps.has(ip.ip);
                    return (
                      <div key={ip.id} className="flex items-center gap-2 text-[11px] font-mono">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inUse ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        <span className="text-white/80 w-32">{ip.ip}</span>
                        <span className="text-white/40 truncate">{pool.mac || '—'}</span>
                        {inUse && <span className="text-amber-300 text-[10px] ml-auto">in use</span>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {templatesCount > 0 && (
            <div>
              <p className="text-white/70 text-xs font-semibold mb-2">OS templates</p>
              <div className="flex flex-wrap gap-1.5">
                {host.proxmox_templates!.map((tpl) => (
                  <span key={tpl.id} className="text-[11px] border border-white/10 bg-white/[0.04] text-white/75 px-2 py-1 rounded">
                    {tpl.name} <span className="text-white/40">· #{tpl.vmid}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {host.provider === 'ovh' && (
            <VmacSyncPanel hostId={host.id} hostUrl={host.host_url} onPoolsChanged={loadHosts} />
          )}
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-white/40 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white text-sm font-medium mt-0.5 truncate">{value}</p>
    </div>
  );
}

function formatMem(mb: number): string {
  if (!mb) return '—';
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
function formatDisk(gb: number): string {
  if (!gb) return '—';
  if (gb < 1024) return `${gb} GB`;
  return `${(gb / 1024).toFixed(2)} TB`;
}
