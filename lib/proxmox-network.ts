export const PROXMOX_NETWORK_MODES = [
  "legacy_public_gateway",
  "ovh_failover_vmac",
  "ovh_hg_scale_routed",
  "ovh_advance_gen3_routed",
  "ovh_vrack_block",
] as const;

export type ProxmoxNetworkMode = typeof PROXMOX_NETWORK_MODES[number];

export type ProxmoxNetworkHost = {
  bridge?: string | null;
  gateway_ip?: string | null;
  dns_primary?: string | null;
  dns_secondary?: string | null;
  provider?: string | null;
  server_series?: string | null;
  network_mode?: string | null;
  vm_private_cidr?: string | null;
  vm_private_gateway?: string | null;
  vm_private_ip_start?: number | null;
  public_prefix_length?: number | null;
  snippet_storage?: string | null;
};

export type VmNetworkPlan = {
  mode: ProxmoxNetworkMode;
  bridge: string;
  publicIp: string;
  publicPrefixLength: number;
  privateIp?: string;
  privatePrefixLength?: number;
  privateGateway?: string;
  ipconfig0: string;
  nameservers: string;
  requiresMac: boolean;
  addHostRoute: boolean;
  networkSnippetFilename?: string;
  networkSnippetContent?: string;
  cicustomNetwork?: string;
  vendorSnippetFilename?: string;
  vendorSnippetContent?: string;
  cicustomVendor?: string;
  snippetStorage: string;
  details: Record<string, unknown>;
};

const ROUTED_PRIVATE_MODES = new Set<ProxmoxNetworkMode>([
  "ovh_hg_scale_routed",
  "ovh_advance_gen3_routed",
]);

function normalizeMode(mode: string | null | undefined): ProxmoxNetworkMode {
  return PROXMOX_NETWORK_MODES.includes(mode as ProxmoxNetworkMode)
    ? (mode as ProxmoxNetworkMode)
    : "legacy_public_gateway";
}

function normalizePrefix(value: number | null | undefined, fallback: number): number {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n < 1 || n > 32) return fallback;
  return n;
}

function parseCidr(cidr: string): { base: string; prefix: number } {
  const [base, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  if (!isValidIPv4(base) || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) {
    throw new Error("Invalid private VM CIDR on Proxmox host");
  }
  return { base, prefix };
}

function isValidIPv4(ip: string): boolean {
  const parts = ip.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

function intToIPv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

export function allocatePrivateIpFromReservation(cidr: string, reservationId: number, start = 10): string {
  const { base, prefix } = parseCidr(cidr);
  const hostBits = 32 - prefix;
  const usable = Math.max(1, Math.pow(2, hostBits) - 3);
  const offset = Math.max(2, start) + ((Math.max(1, reservationId) - 1) % usable);
  return intToIPv4((ipv4ToInt(base) + offset) >>> 0);
}

function buildRoutedVendorYaml(plan: {
  publicIp: string;
  privateIp: string;
  privatePrefixLength: number;
  privateGateway: string;
  dns: string[];
}): string {
  const dns1 = plan.dns[0] || "8.8.8.8";
  const dns2 = plan.dns[1] || "1.1.1.1";
  return [
    "#cloud-config",
    "ssh_pwauth: true",
    "write_files:",
    "  - path: /etc/ssh/sshd_config.d/99-cloud-init-pwauth.conf",
    "    content: |",
    "      PasswordAuthentication yes",
    "    owner: root:root",
    "    permissions: '0644'",
    "  - path: /etc/netplan/99-byoip.yaml",
    "    content: |",
    "      network:",
    "        version: 2",
    "        ethernets:",
    "          vmnic0:",
    "            match:",
    '              name: "e*"',
    "            addresses:",
    `              - ${plan.privateIp}/${plan.privatePrefixLength}`,
    `              - ${plan.publicIp}/32`,
    "            nameservers:",
    "              addresses:",
    `                - ${dns1}`,
    `                - ${dns2}`,
    "            routes:",
    "              - to: default",
    `                via: ${plan.privateGateway}`,
    "                on-link: true",
    `                from: ${plan.publicIp}`,
    "    owner: root:root",
    "    permissions: '0600'",
    "runcmd:",
    "  - mkdir -p /etc/ssh/sshd_config.d",
    "  - sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config",
    "  - rm -f /etc/netplan/50-cloud-init.yaml /etc/netplan/99-static.yaml",
    "  - mkdir -p /etc/cloud/cloud.cfg.d",
    "  - \"printf '%s\\n' 'network: {config: disabled}' > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg\"",
    "  - netplan generate || true",
    "  - netplan apply || true",
    "  - systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true",
    "",
  ].join("\n");
}

export function buildVmNetworkPlan(args: {
  host: ProxmoxNetworkHost;
  publicIp: string;
  vmid: number;
  reservationId: number;
  isWindows: boolean;
}): VmNetworkPlan {
  const mode = normalizeMode(args.host.network_mode);
  const bridge = args.host.bridge || "vmbr0";
  const dns = [args.host.dns_primary || "8.8.8.8", args.host.dns_secondary || "1.1.1.1"].filter((ip): ip is string => Boolean(ip));
  const nameservers = dns.join(" ");
  const snippetStorage = args.host.snippet_storage || "local";
  const publicPrefixLength = normalizePrefix(args.host.public_prefix_length, mode === "ovh_vrack_block" ? 24 : 32);

  if (ROUTED_PRIVATE_MODES.has(mode)) {
    if (args.isWindows) {
      throw new Error("This OVH routed BYOIP network profile currently requires a Linux cloud-init template. Use vRack/legacy mode for Windows or add a Cloudbase-Init network script.");
    }
    if (!args.host.vm_private_cidr || !args.host.vm_private_gateway) {
      throw new Error("Private VM CIDR and private gateway are required for this OVH routed BYOIP profile.");
    }
    const { prefix } = parseCidr(args.host.vm_private_cidr);
    const privateIp = allocatePrivateIpFromReservation(
      args.host.vm_private_cidr,
      args.reservationId,
      args.host.vm_private_ip_start || 10
    );
    const vendorFilename = `vm-${args.vmid}-vendor.yaml`;
    const vendorContent = buildRoutedVendorYaml({
      publicIp: args.publicIp,
      privateIp,
      privatePrefixLength: prefix,
      privateGateway: args.host.vm_private_gateway,
      dns,
    });

    return {
      mode,
      bridge,
      publicIp: args.publicIp,
      publicPrefixLength: 32,
      privateIp,
      privatePrefixLength: prefix,
      privateGateway: args.host.vm_private_gateway,
      ipconfig0: `ip=${args.publicIp}/32,gw=${args.host.vm_private_gateway}`,
      nameservers,
      requiresMac: false,
      addHostRoute: true,
      vendorSnippetFilename: vendorFilename,
      vendorSnippetContent: vendorContent,
      cicustomVendor: `vendor=${snippetStorage}:snippets/${vendorFilename}`,
      snippetStorage,
      details: {
        mode,
        public_ip: args.publicIp,
        public_prefix_length: 32,
        private_ip: privateIp,
        private_prefix_length: prefix,
        private_gateway: args.host.vm_private_gateway,
        bridge,
      },
    };
  }

  const gateway = args.host.gateway_ip || undefined;
  if (!gateway) {
    throw new Error("Gateway IP is required for this Proxmox network profile.");
  }

  return {
    mode,
    bridge,
    publicIp: args.publicIp,
    publicPrefixLength,
    ipconfig0: `ip=${args.publicIp}/${publicPrefixLength},gw=${gateway}`,
    nameservers,
    requiresMac: mode !== "ovh_vrack_block",
    addHostRoute: mode === "legacy_public_gateway",
    snippetStorage,
    details: {
      mode,
      public_ip: args.publicIp,
      public_prefix_length: publicPrefixLength,
      gateway,
      bridge,
    },
  };
}

export function buildCiCustomValue(args: {
  vendorSnippet?: string;
  networkSnippet?: string;
}): string | undefined {
  const parts = [args.networkSnippet, args.vendorSnippet].filter(Boolean);
  return parts.length > 0 ? parts.join(",") : undefined;
}
