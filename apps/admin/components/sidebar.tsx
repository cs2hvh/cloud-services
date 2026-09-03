"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Nunito } from "next/font/google";
import { ExternalLink } from "lucide-react";
import {
  ADMIN_SECTIONS,
  SECTION_GROUPS,
  sectionHref,
  type AdminSection,
} from "@admin/lib/sections";
import { cn } from "@/lib/utils";

const ACCENT = "#3987e5";

// The brand is typographic: "ahura" in white, "sense" in #0095FF, Nunito —
// exactly the wordmark the main site's navbar renders. No icon beside it.
const nunito = Nunito({ subsets: ["latin"], weight: ["400"] });

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

  const renderItem = (section: AdminSection) => {
    const href = sectionHref(section);
    const active = section.migrated && href === activeHref;

    const inner = (
      <>
        {/* active accent bar */}
        <span
          className={cn(
            "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-opacity",
            active ? "opacity-100" : "opacity-0",
          )}
          style={{ backgroundColor: ACCENT }}
        />
        <section.icon
          className="h-4 w-4 shrink-0 transition-colors"
          style={active ? { color: ACCENT } : undefined}
        />
        <span className="flex-1 truncate">{section.title}</span>
        {!section.migrated && (
          <ExternalLink className="h-3 w-3 shrink-0 opacity-40" />
        )}
      </>
    );

    const className = cn(
      "relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] transition-colors",
      active
        ? "bg-[#3987e5]/10 font-medium text-foreground"
        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
    );

    return section.migrated ? (
      <Link key={section.slug} href={href} className={className}>
        {inner}
      </Link>
    ) : (
      <a key={section.slug} href={href} className={className}>
        {inner}
      </a>
    );
  };

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-black/30">
      <div className="flex h-16 flex-col justify-center border-b border-border px-5">
        <Link
          href="/"
          className={`${nunito.className} text-[21px] leading-none tracking-[0.01em] text-white`}
        >
          ahura<span className="text-[#0095FF]">sense</span>
        </Link>
        <div className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground/80">
          Control Panel
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 custom-scrollbar">
        {SECTION_GROUPS.map((group) => {
          const items = ADMIN_SECTIONS.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group || "root"}>
              {group ? (
                <div className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  {group}
                </div>
              ) : (
                <div className="pt-2" />
              )}
              <div className="space-y-0.5">{items.map(renderItem)}</div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-3">
        <a
          href="https://ahurasense.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          ahurasense.com
          <ExternalLink className="h-3 w-3 opacity-50" />
        </a>
      </div>
    </aside>
  );
}
