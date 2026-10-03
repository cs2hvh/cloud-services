"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { DocsProduct } from "./nav";

/**
 * The docs sidebar. Client-side only for the active-link state and the
 * mobile disclosure; the nav config itself is static.
 *
 * Shows the product the reader is in. On the docs home, which belongs to no
 * product, it shows every product so the sidebar is a full index there.
 *
 * Takes plain data — the product list is strings and arrays, so it crosses the
 * server/client boundary as a prop. The matching is done here rather than with
 * productFor() because that would mean importing a function into a client
 * component only to re-run what pathname already tells us.
 */
const DASHBOARD: Record<DocsProduct["id"], { href: string; label: string }> = {
  inference: { href: "/dashboard/services/inference", label: "Inference dashboard" },
  apps: { href: "/dashboard/services/apps", label: "Apps dashboard" },
};

export function DocsSidebar({ products }: { products: DocsProduct[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const active = products.find((p) => pathname === p.base || pathname.startsWith(`${p.base}/`));
  const shown = active ? [active] : products;
  const current = shown.flatMap((p) => p.groups).flatMap((g) => g.items).find((i) => i.href === pathname);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ah-notch-sm mb-4 flex w-full items-center justify-between border border-[var(--ah-line)] bg-[#121216] px-3 py-2.5 text-left lg:hidden"
        aria-expanded={open}
      >
        <span className="text-[14px] text-[var(--ah-ink)]">{current?.title ?? active?.label ?? "Documentation"}</span>
        <span className="ah-lbl">{open ? "close" : "menu"}</span>
      </button>

      <nav className={`${open ? "block" : "hidden"} lg:block`} aria-label="Documentation">
        <Link href="/docs" className="ah-lbl mb-5 block hover:text-[var(--ah-ink)]">
          Docs
        </Link>

        {shown.map((product) => (
          <div key={product.id} className={shown.length > 1 ? "mb-8" : undefined}>
            {shown.length > 1 ? (
              <Link
                href={product.base}
                onClick={() => setOpen(false)}
                className="mb-3 block text-[14px] font-semibold text-[var(--ah-ink)] hover:text-[var(--ah-blue-lt)]"
              >
                {product.label}
              </Link>
            ) : null}
            {product.groups.map((g) => (
              <div key={g.label} className="mb-6">
                <p className="ah-lbl mb-2">{g.label}</p>
                <ul className="space-y-0.5 border-l border-[var(--ah-line)]">
                  {g.items.map((it) => {
                    const isActive = it.href === pathname;
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          onClick={() => setOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={`-ml-px block border-l py-1 pl-3 text-[13.5px] leading-snug transition-colors ${
                            isActive
                              ? "border-[var(--ah-blue)] bg-[rgba(0,149,255,0.06)] text-[var(--ah-ink)]"
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
          </div>
        ))}

        <div className="mt-8 border-t border-[var(--ah-line)] pt-5">
          <p className="ah-lbl mb-2">Also</p>
          {(active ? products.filter((p) => p.id !== active.id) : [])
            .map((p) => (
              <Link
                key={p.id}
                href={p.base}
                className="block py-1 text-[13.5px] text-[var(--ah-body)] hover:text-[var(--ah-ink)]"
              >
                {p.label} docs
              </Link>
            ))}
          <Link href="/api-docs" className="block py-1 text-[13.5px] text-[var(--ah-body)] hover:text-[var(--ah-ink)]">
            Cloud API reference
          </Link>
          {active ? (
            <Link
              href={DASHBOARD[active.id].href}
              className="block py-1 text-[13.5px] text-[var(--ah-body)] hover:text-[var(--ah-ink)]"
            >
              {DASHBOARD[active.id].label}
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
