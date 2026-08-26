import { ExternalLink } from "lucide-react";
import {
  ADMIN_SECTIONS,
  SECTION_GROUPS,
  sectionHref,
} from "@admin/lib/sections";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        Overview
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sections marked with an arrow still open in the main app until they are
        migrated over.
      </p>

      {SECTION_GROUPS.filter(Boolean).map((group) => {
        const sections = ADMIN_SECTIONS.filter((s) => s.group === group);
        if (sections.length === 0) return null;
        return (
          <div key={group} className="mt-7">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              {group}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sections.map((section) => {
                const href = sectionHref(section);
                const inner = (
                  <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#3987e5]/40">
                    <div className="flex items-center justify-between">
                      <section.icon className="h-5 w-5 text-muted-foreground" />
                      {!section.migrated && (
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="mt-3 text-sm font-medium">
                      {section.title}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {section.description}
                    </div>
                  </div>
                );

                return section.migrated ? (
                  <Link key={section.slug} href={href}>
                    {inner}
                  </Link>
                ) : (
                  <a key={section.slug} href={href}>
                    {inner}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
