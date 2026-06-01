"use client";

// Pricing iconography:
//  - CategoryIcon: maps a pricing category slug to the custom-drawn sidebar
//    icons (shared between the side nav and each section heading).
//  - DB_ENGINE_LOGOS: original MySQL / MongoDB / PostgreSQL brand marks,
//    sourced from the database services page assets.

import type { ComponentType, SVGProps } from "react";
import {
  AppDeployIcon,
  BotIcon,
  BucketIcon,
  ComputeIcon,
  DatabaseIcon,
  GpuIcon,
  K8sIcon,
  ServerIcon,
  ShieldIcon,
} from "@/components/dashboard/sidebar/custom-icons";

type CustomIcon = ComponentType<
  SVGProps<SVGSVGElement> & { strokeWidth?: number | string }
>;

const CATEGORY_ICONS: Record<string, CustomIcon> = {
  compute: ComputeIcon,
  gpu: GpuIcon,
  "gpu-instance": GpuIcon,
  "object-storage": BucketIcon,
  storage: BucketIcon,
  database: DatabaseIcon,
  kubernetes: K8sIcon,
  k8s: K8sIcon,
  security: ShieldIcon,
  "network-ddos": ShieldIcon,
  "ai-deployment": BotIcon,
  "ai-agents": BotIcon,
  "app-deployment": AppDeployIcon,
  "platform-apps": AppDeployIcon,
};

export function CategoryIcon({
  slug,
  className,
  strokeWidth,
}: {
  slug?: string | null;
  className?: string;
  strokeWidth?: number | string;
}) {
  const Icon = (slug && CATEGORY_ICONS[slug.toLowerCase().trim()]) || ServerIcon;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}

// Original brand logos for database engines.
export const DB_ENGINE_LOGOS: Record<string, { src: string; alt: string }> = {
  mysql: { src: "/images/database-logos/mysql.svg", alt: "MySQL" },
  mongodb: { src: "/images/database-logos/mongodb.png", alt: "MongoDB" },
  postgres: { src: "/images/database-logos/postgresql.png", alt: "PostgreSQL" },
};
