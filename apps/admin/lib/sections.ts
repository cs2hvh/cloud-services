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
};

export const MAIN_APP_URL =
  process.env.NEXT_PUBLIC_MAIN_APP_URL || "https://ahuracloud.com";

export const ADMIN_SECTIONS: AdminSection[] = [
  { title: "Overview", slug: "", icon: LayoutDashboard, migrated: true, description: "Admin home" },
  { title: "Users", slug: "users", icon: Users, migrated: true, description: "Accounts, roles, suspensions" },
  { title: "Support", slug: "support", icon: LifeBuoy, migrated: false, description: "Tickets and replies" },
  { title: "Pricing", slug: "pricing", icon: BadgeDollarSign, migrated: false, description: "Plans, promos, categories" },
  { title: "Coupons", slug: "coupons", icon: TicketPercent, migrated: false, description: "Discount codes" },
  { title: "Servers", slug: "servers", icon: Server, migrated: false, description: "Customer VMs" },
  { title: "Hosts", slug: "hosts", icon: HardDrive, migrated: false, description: "Proxmox hypervisors" },
  { title: "GPU", slug: "gpu", icon: Cpu, migrated: false, description: "GPU inventory and sync" },
  { title: "Game", slug: "game", icon: Gamepad2, migrated: false, description: "Game hosting console" },
  { title: "Linode", slug: "linode", icon: Cloud, migrated: false, description: "Linode instances" },
  { title: "Kubernetes", slug: "kubernetes", icon: Boxes, migrated: false, description: "Managed clusters" },
  { title: "Databases", slug: "databases", icon: Database, migrated: false, description: "Managed databases" },
  { title: "Network & DDoS", slug: "network-ddos", icon: ShieldAlert, migrated: false, description: "Spectrum apps" },
  { title: "Object Storage", slug: "object-storage", icon: Archive, migrated: false, description: "Buckets and spaces" },
  { title: "Platform Apps", slug: "platform-apps", icon: AppWindow, migrated: false, description: "PaaS deployments" },
  { title: "Cluster Monitor", slug: "cluster-monitor", icon: Activity, migrated: false, description: "Internal cluster health" },
  { title: "Domains", slug: "domains", icon: Globe, migrated: false, description: "Registrations and transfers" },
  { title: "AI Agents", slug: "ai-agents", icon: Bot, migrated: false, description: "Agents, models, usage" },
  { title: "Audit Logs", slug: "audit-logs", icon: ScrollText, migrated: false, description: "Admin activity trail" },
];

export function sectionHref(section: AdminSection): string {
  if (section.migrated) {
    return `/${section.slug}`;
  }
  return `${MAIN_APP_URL}/dashboard/admin/${section.slug}`;
}
