"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ServiceKey =
  | "compute"
  | "gpu"
  | "gpu-enterprise"
  | "kubernetes"
  | "database"
  | "security"
  | "object-storage"
  | "app-deployment"
  | "domain"
  | "main"
  | "ai-agents";

type CtaIntent = "main" | "new";

type AuthAwareServiceCtaProps = {
  service: ServiceKey;
  intent: CtaIntent;
  className: string;
  children: ReactNode;
  unauthenticatedHref?: string;
  disabled?: boolean;
};

const SERVICE_DASHBOARD_TARGETS: Record<
  ServiceKey,
  { main: string; new: string }
> = {
  compute: {
    main: "/dashboard/services/compute",
    new: "/dashboard/services/compute/vps/new",
  },
  gpu: {
    main: "/dashboard/services/gpu",
    new: "/dashboard/services/gpu/deploy",
  },
  "gpu-enterprise": {
    main: "/dashboard/services/gpu/enterprise",
    new: "/dashboard/services/gpu/enterprise",
  },
  kubernetes: {
    main: "/dashboard/services/kubernetes",
    new: "/dashboard/services/kubernetes/new",
  },
  database: {
    main: "/dashboard/services/database",
    new: "/dashboard/services/database/new",
  },
  security: {
    main: "/dashboard/services/network-ddos",
    new: "/dashboard/services/network-ddos/new",
  },
  "object-storage": {
    main: "/dashboard/services/object-storage",
    new: "/dashboard/services/object-storage/new",
  },
  "app-deployment": {
    main: "/dashboard/services/apps",
    new: "/dashboard/services/apps/new",
  },
  domain: {
    main: "/dashboard/domains",
    new: "/dashboard/domains",
  },
  "ai-agents": {
    main: "/dashboard/services/ai-agents",
    new: "/dashboard/services/ai-agents/new",
  },
  "main": {
    main: "/dashboard/",
    new: "/dashboard/",
  },
};

export function AuthAwareServiceCta({
  service,
  intent,
  className,
  children,
  unauthenticatedHref = "/signup",
  disabled = false,
}: AuthAwareServiceCtaProps) {
  const [isRouting, setIsRouting] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const handleClick = async () => {
    if (disabled || isRouting) return;

    setIsRouting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const target = user
        ? SERVICE_DASHBOARD_TARGETS[service][intent]
        : unauthenticatedHref;

      router.push(target);
    } finally {
      setIsRouting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isRouting}
      className={className}
    >
      {children}
    </button>
  );
}
