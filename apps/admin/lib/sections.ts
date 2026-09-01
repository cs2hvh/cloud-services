import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  LifeBuoy,
  BadgeDollarSign,
  TicketPercent,
  Server,
  HardDrive,
  Cpu,
  Gamepad2,
  Cloud,
  Boxes,
  Database,
  ShieldAlert,
  Archive,
  AppWindow,
  Activity,
  Globe,
  Bot,
  ScrollText,
  Sparkles,
  Rocket,
  FolderGit2,
} from "lucide-react";

/**
 * Every admin section, whether it has been migrated into this app yet or not.
 *
 * Unmigrated sections link to the main app's /dashboard/admin/* pages so the
 * panel is usable end-to-end from day one; flip `migrated` to true (and add
 * the local route + API re-exports) as each section moves over.
 */
export type AdminSection = {
  title: string;
  slug: string;
  icon: LucideIcon;
  migrated: boolean;
  description: string;
  group: string;
};

export const MAIN_APP_URL =
  process.env.NEXT_PUBLIC_MAIN_APP_URL || "https://ahuracloud.com";

/** Group render order for the sidebar and overview. "" renders ungrouped at top. */
export const SECTION_GROUPS = ["", "Platform", "Compute", "Services", "Commerce"];

export const ADMIN_SECTIONS: AdminSection[] = [
  { title: "Overview", slug: "", icon: LayoutDashboard, migrated: true, description: "Admin home", group: "" },

  { title: "Users", slug: "users", icon: Users, migrated: true, description: "Accounts, roles, suspensions", group: "Platform" },
  { title: "Support", slug: "support", icon: LifeBuoy, migrated: true, description: "Tickets and replies", group: "Platform" },
  { title: "Audit Logs", slug: "audit-logs", icon: ScrollText, migrated: false, description: "Admin activity trail", group: "Platform" },

  { title: "Servers", slug: "servers", icon: Server, migrated: true, description: "Customer VMs — fleet, actions, revenue", group: "Compute" },
  { title: "Linode Console", slug: "servers/linode", icon: Cloud, migrated: true, description: "Catalog, pricing, kill-switch", group: "Compute" },
  { title: "Hosts", slug: "hosts", icon: HardDrive, migrated: false, description: "Proxmox hypervisors", group: "Compute" },
  { title: "GPU", slug: "gpu", icon: Cpu, migrated: false, description: "GPU inventory and sync", group: "Compute" },
  { title: "Game", slug: "game", icon: Gamepad2, migrated: false, description: "Game hosting console", group: "Compute" },
  { title: "Kubernetes", slug: "kubernetes", icon: Boxes, migrated: true, description: "Managed clusters", group: "Compute" },

  { title: "Deploy v2", slug: "deploy", icon: Rocket, migrated: true, description: "PaaS ops — queue, fleet, drift", group: "Services" },
  { title: "V2 Projects", slug: "deploy/projects", icon: FolderGit2, migrated: true, description: "All projects — deleted included, reads audited", group: "Services" },
  { title: "AI Labs", slug: "ai", icon: Sparkles, migrated: true, description: "Inference — usage, models, health", group: "Services" },
  { title: "AI Agents", slug: "ai-agents", icon: Bot, migrated: false, description: "Agent builder product", group: "Services" },
  { title: "Databases", slug: "databases", icon: Database, migrated: true, description: "Managed databases", group: "Services" },
  { title: "Object Storage", slug: "object-storage", icon: Archive, migrated: false, description: "Buckets and spaces", group: "Services" },
  { title: "Network & DDoS", slug: "network-ddos", icon: ShieldAlert, migrated: false, description: "Spectrum apps", group: "Services" },
  { title: "Platform Apps (v1)", slug: "platform-apps", icon: AppWindow, migrated: false, description: "Legacy PaaS — being retired", group: "Services" },
  { title: "Domains", slug: "domains", icon: Globe, migrated: true, description: "Registrations and transfers", group: "Services" },
  { title: "Cluster Monitor", slug: "cluster-monitor", icon: Activity, migrated: false, description: "Internal cluster health", group: "Services" },

  { title: "Pricing", slug: "pricing", icon: BadgeDollarSign, migrated: true, description: "Price book — the one place a price is set", group: "Commerce" },
  { title: "Coupons & Discounts", slug: "coupons", icon: TicketPercent, migrated: true, description: "Credit grants · rate discounts", group: "Commerce" },
];

export function sectionHref(section: AdminSection): string {
  if (section.migrated) {
    return `/${section.slug}`;
  }
  return `${MAIN_APP_URL}/dashboard/admin/${section.slug}`;
}
