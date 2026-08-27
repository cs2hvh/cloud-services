"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Activity, Link2, Receipt, Rocket, Settings2, SlidersHorizontal } from "lucide-react";
import { ServiceTabBar } from "@/components/dashboard/ui/service-tab-bar";
import { SECTION_VALUES } from "./sections";

/**
 * The project page's section nav.
 *
 * WRAPS ServiceTabBar RATHER THAN REIMPLEMENTING IT. That component's own
 * header calls itself the single source of truth so that compute, database,
 * kubernetes, object storage and apps all render an identical bar. A second tab
 * control for v2 would make the newest surface the one that looks like a
 * different product.
 *
 * THE TAB LIVES IN THE URL, not in React state, and that is what lets the page
 * stay a server component. It reads its data through the RLS-scoped client
 * directly; making it a client component to hold one string would mean fetching
 * every project, deployment and charge over HTTP instead — an auth hop and a
 * failure mode traded for a query parameter.
 *
 * It also makes a section linkable, and it survives the refresh AutoRefresh
 * triggers while a build runs. Component state would be discarded on every one
 * of those, snapping the reader back to the first tab every few seconds.
 */

/**
 * THE TABLE LIVES HERE, ON THE CLIENT SIDE OF THE BOUNDARY, because the icons
 * are functions.
 *
 * It was first written in the page — a server component — and passed down as a
 * prop. That renders fine in the type system and fails at request time with
 * "Functions cannot be passed directly to Client Components": a React element
 * type cannot cross the serialization boundary. tsc was happy, the route
 * compiled, and every tab 500'd.
 *
 * The server needs only the VALUES, to validate ?tab= against, so that is all
 * it gets.
 */
const ICONS = {
  overview: Activity,
  deployments: Rocket,
  domains: Link2,
  environment: SlidersHorizontal,
  usage: Receipt,
  settings: Settings2,
} as const;

// Built from the shared order, so adding a section in one place cannot leave
// the bar and the page disagreeing about which sections exist.
const SECTIONS = SECTION_VALUES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
  icon: ICONS[value],
}));
export function TabNav({ active }: { active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <ServiceTabBar
      tabs={SECTIONS}
      value={active}
      onChange={(value) => {
        const next = new URLSearchParams(params.toString());
        next.set("tab", value);
        // scroll: false — the sections are of very different heights, and
        // jumping to the top on every switch loses the reader's place in a way
        // that feels like a page load rather than a tab.
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
      className="mb-6"
    />
  );
}
