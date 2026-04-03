export type SupportTicketStatus = "open" | "resolved";

export type SupportResourceType =
  | "vps"
  | "bare_metal"
  | "database"
  | "app_platform"
  | "kubernetes"
  | "game_server"
  | "spectrum"
  | "firewall"
  | "object_storage"
  | "ai_agent"
  | "domain"
  | "billing";

export interface SupportTertiaryTopic {
  id: string;
  label: string;
}

export interface SupportSubTopic {
  id: string;
  label: string;
  tertiaryTopics: SupportTertiaryTopic[];
}

export interface SupportTopic {
  id: string;
  label: string;
  resourceType: SupportResourceType;
  subTopics: SupportSubTopic[];
}

export interface SupportTopicLabels {
  topicLabel: string;
  subTopicLabel: string;
  tertiaryTopicLabel: string;
}

export interface SupportResourceOption {
  id: string;
  name: string;
  type: SupportResourceType;
  status?: string | null;
}

export const SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: "compute_vps",
    label: "Compute - Virtual Private Servers",
    resourceType: "vps",
    subTopics: [
      {
        id: "provisioning",
        label: "Provisioning & Deployment",
        tertiaryTopics: [
          { id: "create_failed", label: "Server creation failed" },
          { id: "stuck_provisioning", label: "Server stuck in provisioning" },
          { id: "image_template", label: "OS image or template issue" },
        ],
      },
      {
        id: "performance",
        label: "Performance & Runtime",
        tertiaryTopics: [
          { id: "high_cpu_memory", label: "High CPU or memory usage" },
          { id: "slow_network", label: "Slow network performance" },
          { id: "disk_latency", label: "Disk throughput/latency issue" },
        ],
      },
    ],
  },
  {
    id: "compute_bare_metal",
    label: "Compute - Bare Metal Servers",
    resourceType: "bare_metal",
    subTopics: [
      {
        id: "hardware",
        label: "Hardware & Availability",
        tertiaryTopics: [
          { id: "hardware_fault", label: "Hardware fault or degradation" },
          { id: "raid_boot", label: "RAID/boot issue" },
          { id: "outage", label: "Unexpected host outage" },
        ],
      },
      {
        id: "networking",
        label: "Network & Connectivity",
        tertiaryTopics: [
          { id: "public_ip", label: "Public IP not reachable" },
          { id: "latency_packet_loss", label: "Latency or packet loss" },
          { id: "remote_console", label: "Remote console/IPMI issue" },
        ],
      },
    ],
  },
  {
    id: "database",
    label: "Managed Databases",
    resourceType: "database",
    subTopics: [
      {
        id: "connection",
        label: "Connection & Access",
        tertiaryTopics: [
          { id: "connection_refused", label: "Connection refused/timeouts" },
          { id: "ssl_cert", label: "SSL/certificate connection issue" },
          { id: "auth_failed", label: "Authentication/credentials failed" },
        ],
      },
      {
        id: "operations",
        label: "Operations & Maintenance",
        tertiaryTopics: [
          { id: "backup_restore", label: "Backup or restore issue" },
          { id: "slow_queries", label: "Slow query performance" },
          { id: "scaling_migration", label: "Scaling/migration issue" },
        ],
      },
    ],
  },
  {
    id: "application_deployment",
    label: "Application Deployment Platform",
    resourceType: "app_platform",
    subTopics: [
      {
        id: "builds",
        label: "Build & Deployment",
        tertiaryTopics: [
          { id: "build_failed", label: "Build failed" },
          { id: "deploy_rollback", label: "Deployment rollback issue" },
          { id: "runtime_startup", label: "Runtime startup failure" },
        ],
      },
      {
        id: "integrations",
        label: "Git & Integrations",
        tertiaryTopics: [
          { id: "webhook_issue", label: "Webhook trigger issue" },
          { id: "repo_access", label: "Repository access issue" },
          { id: "env_var", label: "Environment variable issue" },
        ],
      },
    ],
  },
  {
    id: "kubernetes",
    label: "Kubernetes Clusters",
    resourceType: "kubernetes",
    subTopics: [
      {
        id: "cluster_health",
        label: "Cluster Health",
        tertiaryTopics: [
          { id: "node_not_ready", label: "Node not ready" },
          { id: "control_plane_issue", label: "Control plane issue" },
          { id: "autoscaling_issue", label: "Autoscaling issue" },
        ],
      },
      {
        id: "workloads",
        label: "Workloads & Networking",
        tertiaryTopics: [
          { id: "pod_crashloop", label: "Pod crash loop/restart storm" },
          { id: "service_ingress", label: "Service/ingress issue" },
          { id: "kubeconfig_access", label: "Kubeconfig/access issue" },
        ],
      },
    ],
  },
  {
    id: "game_servers",
    label: "Game Servers",
    resourceType: "game_server",
    subTopics: [
      {
        id: "server_runtime",
        label: "Runtime & Stability",
        tertiaryTopics: [
          { id: "server_crash", label: "Server crash or restart loop" },
          { id: "mods_plugins", label: "Mods/plugins compatibility issue" },
          { id: "save_data", label: "Save/state persistence issue" },
        ],
      },
      {
        id: "player_connectivity",
        label: "Player Connectivity",
        tertiaryTopics: [
          { id: "join_fail", label: "Players cannot join" },
          { id: "high_ping", label: "High ping/lag" },
          { id: "port_opening", label: "Port/firewall issue" },
        ],
      },
    ],
  },
  {
    id: "network_ddos",
    label: "Network DDoS Protection",
    resourceType: "spectrum",
    subTopics: [
      {
        id: "traffic_routing",
        label: "Traffic Routing",
        tertiaryTopics: [
          { id: "origin_unreachable", label: "Origin unreachable" },
          { id: "dns_propagation", label: "DNS/proxy propagation issue" },
          { id: "edge_ip", label: "Edge IP mismatch" },
        ],
      },
      {
        id: "security_policy",
        label: "Security Policy",
        tertiaryTopics: [
          { id: "false_positive", label: "Legitimate traffic blocked" },
          { id: "tls_setting", label: "TLS mode/certificate issue" },
          { id: "proxy_protocol", label: "Proxy protocol issue" },
        ],
      },
    ],
  },
  {
    id: "firewall",
    label: "Firewall",
    resourceType: "firewall",
    subTopics: [
      {
        id: "rules",
        label: "Rule Management",
        tertiaryTopics: [
          { id: "rule_not_applied", label: "Rule not applied" },
          { id: "traffic_blocked", label: "Unexpected traffic blocked" },
          { id: "nat_mapping", label: "NAT/forwarding issue" },
        ],
      },
      {
        id: "security_events",
        label: "Security Events",
        tertiaryTopics: [
          { id: "suspicious_traffic", label: "Suspicious traffic event" },
          { id: "allowlist_issue", label: "Allowlist/denylist issue" },
          { id: "rule_priority", label: "Rule priority conflict" },
        ],
      },
    ],
  },
  {
    id: "object_storage",
    label: "Object Storage",
    resourceType: "object_storage",
    subTopics: [
      {
        id: "bucket_ops",
        label: "Bucket Operations",
        tertiaryTopics: [
          { id: "bucket_create", label: "Bucket create/delete issue" },
          { id: "object_upload", label: "Object upload/download issue" },
          { id: "permissions_acl", label: "ACL/permission issue" },
        ],
      },
      {
        id: "compatibility",
        label: "S3 Compatibility",
        tertiaryTopics: [
          { id: "sdk_integration", label: "SDK integration issue" },
          { id: "cors_issue", label: "CORS configuration issue" },
          { id: "versioning_issue", label: "Versioning/lifecycle issue" },
        ],
      },
    ],
  },
  {
    id: "ai_agents",
    label: "AI Agents",
    resourceType: "ai_agent",
    subTopics: [
      {
        id: "agent_runtime",
        label: "Agent Runtime",
        tertiaryTopics: [
          { id: "response_quality", label: "Low response quality" },
          { id: "latency", label: "High latency or timeout" },
          { id: "tool_calling", label: "Tool/function calling issue" },
        ],
      },
      {
        id: "knowledge_base",
        label: "Knowledge Base & Data",
        tertiaryTopics: [
          { id: "doc_ingestion", label: "Document ingestion failed" },
          { id: "embedding_index", label: "Embedding/index issue" },
          { id: "retrieval_quality", label: "Poor retrieval results" },
        ],
      },
    ],
  },
  {
    id: "domains",
    label: "Domains",
    resourceType: "domain",
    subTopics: [
      {
        id: "purchase_transfer",
        label: "Purchase & Transfer",
        tertiaryTopics: [
          { id: "purchase_pending", label: "Purchase request pending too long" },
          { id: "transfer_issue", label: "Transfer/ownership issue" },
          { id: "whois", label: "WHOIS/contact details issue" },
        ],
      },
      {
        id: "dns_ssl",
        label: "DNS & SSL",
        tertiaryTopics: [
          { id: "dns_record", label: "DNS records not resolving" },
          { id: "ssl_verify", label: "SSL verification issue" },
          { id: "primary_domain", label: "Primary domain assignment issue" },
        ],
      },
    ],
  },
  {
    id: "billing",
    label: "Billing & Transactions",
    resourceType: "billing",
    subTopics: [
      {
        id: "payments",
        label: "Payments & Wallet",
        tertiaryTopics: [
          { id: "topup_issue", label: "Top-up payment issue" },
          { id: "transaction_mismatch", label: "Transaction mismatch" },
          { id: "invoice_receipt", label: "Invoice/receipt issue" },
        ],
      },
      {
        id: "credits_promos",
        label: "Credits & Promocodes",
        tertiaryTopics: [
          { id: "coupon_redeem", label: "Coupon redeem issue" },
          { id: "balance_deduction", label: "Unexpected balance deduction" },
          { id: "recurring_topup", label: "Recurring top-up issue" },
        ],
      },
    ],
  },
];

export const ALLOWED_SUPPORT_FILE_EXTENSIONS = [
  "svg",
  "png",
  "jpg",
  "jpeg",
  "pdf",
  "docx",
] as const;

export const ALLOWED_SUPPORT_FILE_MIME_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const SUPPORT_FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const SUPPORT_MAX_ATTACHMENTS = 6;

export function getSupportTopicById(topicId: string): SupportTopic | undefined {
  return SUPPORT_TOPICS.find((topic) => topic.id === topicId);
}

export function isValidSupportTopicSelection(
  topicId: string,
  subTopicId: string,
  tertiaryTopicId: string
): boolean {
  const topic = getSupportTopicById(topicId);
  if (!topic) return false;
  const subTopic = topic.subTopics.find((entry) => entry.id === subTopicId);
  if (!subTopic) return false;
  return subTopic.tertiaryTopics.some((entry) => entry.id === tertiaryTopicId);
}

export function getSupportTopicLabels(
  topicId: string,
  subTopicId: string,
  tertiaryTopicId: string
): SupportTopicLabels | null {
  const topic = getSupportTopicById(topicId);
  if (!topic) return null;

  const subTopic = topic.subTopics.find((entry) => entry.id === subTopicId);
  if (!subTopic) return null;

  const tertiaryTopic = subTopic.tertiaryTopics.find((entry) => entry.id === tertiaryTopicId);
  if (!tertiaryTopic) return null;

  return {
    topicLabel: topic.label,
    subTopicLabel: subTopic.label,
    tertiaryTopicLabel: tertiaryTopic.label,
  };
}

export function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

export function isAllowedSupportFile(fileName: string, mimeType: string): boolean {
  const ext = getFileExtension(fileName);
  const extensionAllowed = ALLOWED_SUPPORT_FILE_EXTENSIONS.includes(
    ext as (typeof ALLOWED_SUPPORT_FILE_EXTENSIONS)[number]
  );

  if (!extensionAllowed) {
    return false;
  }

  if (!mimeType || mimeType === "application/octet-stream") {
    return true;
  }

  return ALLOWED_SUPPORT_FILE_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_SUPPORT_FILE_MIME_TYPES)[number]
  );
}
