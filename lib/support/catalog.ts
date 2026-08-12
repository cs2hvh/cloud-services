export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "pending"
  | "resolved"
  | "closed"
  | "cancelled"
  | "permantly_close";

export const SUPPORT_OPEN_STATUSES: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "pending",
];

export const SUPPORT_CLOSED_STATUSES: SupportTicketStatus[] = [
  "resolved",
  "closed",
  "cancelled",
  "permantly_close",
];

export const SUPPORT_REOPENABLE_STATUSES: SupportTicketStatus[] = [
  "resolved",
  "closed",
  "cancelled",
];

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "OPEN",
  in_progress: "IN_PROGRESS",
  pending: "PENDING",
  resolved: "RESOLVED",
  closed: "CLOSED",
  cancelled: "CANCELLED",
  permantly_close: "PERMANENTLY_CLOSED",
};

export function isSupportOpenStatus(status: SupportTicketStatus): boolean {
  return SUPPORT_OPEN_STATUSES.includes(status);
}

export function isSupportClosedStatus(status: SupportTicketStatus): boolean {
  return SUPPORT_CLOSED_STATUSES.includes(status);
}

export function canSupportStatusBeReopened(status: SupportTicketStatus): boolean {
  return SUPPORT_REOPENABLE_STATUSES.includes(status);
}

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

export interface SupportTopic {
  id: string;
  label: string;
  resourceType: SupportResourceType;
}

export interface SupportResourceOption {
  id: string;
  name: string;
  type: SupportResourceType;
  status?: string | null;
}

export const SUPPORT_TOPICS: SupportTopic[] = [
  { id: "compute_vps", label: "Compute - Virtual Private Servers", resourceType: "vps" },
  { id: "compute_bare_metal", label: "Compute - Bare Metal Servers", resourceType: "bare_metal" },
  { id: "database", label: "Managed Databases", resourceType: "database" },
  { id: "application_deployment", label: "Application Deployment Platform", resourceType: "app_platform" },
  { id: "kubernetes", label: "Kubernetes Clusters", resourceType: "kubernetes" },
  { id: "game_servers", label: "Game Servers", resourceType: "game_server" },
  { id: "network_ddos", label: "Network DDoS Protection", resourceType: "spectrum" },
  { id: "firewall", label: "Firewall", resourceType: "firewall" },
  { id: "object_storage", label: "Object Storage", resourceType: "object_storage" },
  { id: "ai_agents", label: "AI Agents", resourceType: "ai_agent" },
  { id: "domains", label: "Domains", resourceType: "domain" },
  { id: "billing", label: "Billing & Transactions", resourceType: "billing" },
];

// Tickets carry a single topic. The `sub_topic`/`tertiary_topic` columns are
// kept for historical rows and filled with this placeholder on new tickets.
export const SUPPORT_TOPIC_DETAIL_PLACEHOLDER = "general";

export const ALLOWED_SUPPORT_FILE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "pdf",
  "docx",
  "csv",
  "xlsx",
  "txt",
  "doc",
] as const;

export const ALLOWED_SUPPORT_FILE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/msword",
] as const;

export const SUPPORT_FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const SUPPORT_MAX_ATTACHMENTS = 6;

export function getSupportTopicById(topicId: string): SupportTopic | undefined {
  return SUPPORT_TOPICS.find((topic) => topic.id === topicId);
}

export function isValidSupportTopic(topicId: string): boolean {
  return Boolean(getSupportTopicById(topicId));
}

export function getSupportTopicLabel(topicId: string): string | null {
  return getSupportTopicById(topicId)?.label ?? null;
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
