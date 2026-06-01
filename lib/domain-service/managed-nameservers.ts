const MIN_NAMESERVERS = 2;

const CONFIGURED_MANAGED_NAMESERVERS = (process.env.AHURASENSE_MANAGED_NAMESERVERS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase().replace(/\.$/, ""))
  .filter(Boolean);

export const DEFAULT_MANAGED_NAMESERVERS: string[] = CONFIGURED_MANAGED_NAMESERVERS.length >= MIN_NAMESERVERS
  ? CONFIGURED_MANAGED_NAMESERVERS
  : ["ns1.name.com", "ns2.name.com", "ns3.name.com", "ns4.name.com"];

export const NAMECOM_MANAGED_NAMESERVER_RE = /^ns[a-z0-9-]*\.name\.com$/i;