"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { DocsNavGroup } from "./nav";

/**
 * The docs sidebar. Client-side only for the active-link state and the
 * mobile disclosure; the nav config itself is static.
 */
export function DocsSidebar({ groups }: { groups: DocsNavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const current = groups.flatMap((g) => g.items).find((i) => i.href === pathname);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ah-notch-sm mb-4 flex w-full items-center justify-between border border-[var(--ah-line)] bg-[#121216] px-3 py-2.5 text-left lg:hidden"
        aria-expanded={open}
      >
        <span className="text-[14px] text-[var(--ah-ink)]">{current?.title ?? "Documentation"}</span>
        <span className="ah-lbl">{open ? "close" : "menu"}</span>
      </button>

      <nav className={`${open ? "block" : "hidden"} lg:block`} aria-label="Documentation">
        <Link href="/docs" className="ah-lbl mb-5 block hover:text-[var(--ah-ink)]">
          Docs
        </Link>
        {groups.map((g) => (
          <div key={g.label} className="mb-6">
            <p className="ah-lbl mb-2">{g.label}</p>
            <ul className="space-y-0.5 border-l border-[var(--ah-line)]">
              {g.items.map((it) => {
                const active = it.href === pathname;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={`-ml-px block border-l py-1 pl-3 text-[13.5px] leading-snug transition-colors ${
                        active
                          ? "border-[var(--ah-blue)] text-[var(--ah-ink)]"
                          : "border-transparent text-[var(--ah-body)] hover:border-[var(--ah-line-hi)] hover:text-[var(--ah-ink)]"
                      }`}
                    >
                      {it.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="mt-8 border-t border-[var(--ah-line)] pt-5">
          <p className="ah-lbl mb-2">Also</p>
          <Link href="/api-docs" className="block py-1 text-[13.5px] text-[var(--ah-body)] hover:text-[var(--ah-ink)]">
            Cloud API reference
          </Link>
          <Link
            href="/dashboard/services/inference"
            className="block py-1 text-[13.5px] text-[var(--ah-body)] hover:text-[var(--ah-ink)]"
          >
            Inference dashboard
          </Link>
        </div>
      </nav>
    </div>
  );
}
