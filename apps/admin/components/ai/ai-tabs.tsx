"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Boxes,
  Cpu,
  KeyRound,
  LayoutDashboard,
  Route,
  ScrollText,
} from "lucide-react";

/** Shared sub-navigation for every AI Labs surface. */
const TABS = [
  { href: "/ai", label: "Overview", icon: LayoutDashboard },
  { href: "/ai/requests", label: "Requests", icon: ScrollText },
  { href: "/ai/accounts", label: "Orgs & Keys", icon: KeyRound },
  { href: "/ai/routing", label: "Providers & GPU", icon: Route },
  { href: "/ai/models", label: "Models", icon: Boxes },
  { href: "/ai/workloads", label: "Workloads", icon: Cpu },
  { href: "/ai/activity", label: "Activity", icon: Activity },
] as const;

export function AiTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active =
          t.href === "/ai" ? pathname === "/ai" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors ${
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#3987e5]" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
