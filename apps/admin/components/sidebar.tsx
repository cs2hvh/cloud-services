"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { ADMIN_SECTIONS, sectionHref } from "@admin/lib/sections";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  // Longest-matching migrated href wins, so /servers/linode highlights the
  // Linode Console entry rather than both it and Servers.
  const activeHref = ADMIN_SECTIONS.filter((s) => s.migrated)
    .map((s) => sectionHref(s))
    .filter((href) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
    )
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <ShieldCheck className="h-5 w-5" />
        <span className="text-sm font-semibold tracking-wide">
          AhuraSense Admin
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 custom-scrollbar">
        {ADMIN_SECTIONS.map((section) => {
          const href = sectionHref(section);
          const active = section.migrated && href === activeHref;

          const className = cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
            active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          );

          if (!section.migrated) {
            // Not migrated yet — jump to the section in the main app.
            return (
              <a key={section.slug} href={href} className={className}>
                <section.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{section.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
              </a>
            );
          }

          return (
            <Link key={section.slug} href={href} className={className}>
              <section.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{section.title}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
