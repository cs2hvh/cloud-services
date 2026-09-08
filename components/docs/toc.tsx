"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Heading {
  id: string;
  text: string;
}

/**
 * "On this page": the H2s of the current article, with the one in view
 * marked. Collected from the DOM after each navigation so pages do not have
 * to declare their outline twice. Hidden when a page has fewer than two
 * sections; there is nothing to navigate then.
 */
export function TableOfContents() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLHeadingElement>("article h2[id]"));
    const found = nodes.map((h) => ({ id: h.id, text: h.textContent?.replace(/#$/, "").trim() ?? "" }));
    setHeadings(found);
    setActive(found[0]?.id ?? null);
    if (nodes.length < 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost heading that is at or above the reading line wins, so
        // the marker moves as you scroll rather than only when a heading
        // enters the viewport.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive((visible[0].target as HTMLElement).id);
      },
      { rootMargin: "-100px 0px -70% 0px", threshold: 0 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label="On this page" className="text-[13px]">
      <p className="ah-lbl mb-3">On this page</p>
      <ul className="space-y-0.5 border-l border-[var(--ah-line)]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`-ml-px block border-l py-1 pl-3 leading-snug transition-colors ${
                active === h.id
                  ? "border-[var(--ah-blue)] text-[var(--ah-ink)]"
                  : "border-transparent text-[var(--ah-body)] hover:text-[var(--ah-ink)]"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
