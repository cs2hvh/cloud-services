// What the home hero announces. Edit this file to change the "What's new"
// bar, the offer chip and the model shown in the API card.
//
// WHY A FILE AND NOT A TABLE. Three items, changed by a person a few times a
// month, reviewed in a diff. A CMS for this would be a second place for copy
// to go stale. Numbers that move on their own (a GPU price, the dedicated
// server floor) are NOT typed here: an item can ask for a live figure via
// `live`, and components/hero.tsx resolves it from the same catalog the
// deploy pages read. An item whose live figure cannot be resolved is dropped
// and logged, never shown with a blank where the number should be.

export type HeroTone = "green" | "amber" | "grey";

export interface HeroAnnouncementSpec {
  /** Copy as shown. For `live` items, the resolved figure is appended. */
  label: string;
  href: string;
  tone: HeroTone;
  /**
   * Append a live number to the label:
   *   { kind: "gpu", id }   → " from $X.XX/hr" from the public GPU catalog
   *   { kind: "bare-metal" } → " from $N/mo" from lib/catalog/bare-metal
   */
  live?: { kind: "gpu"; id: string } | { kind: "bare-metal" };
}

export const HERO_ANNOUNCEMENTS: HeroAnnouncementSpec[] = [
  {
    label: "GLM-5.3 is live on the inference API",
    href: "/dashboard/services/inference",
    tone: "green",
  },
  {
    label: "B300 Blackwell Ultra",
    href: "/dashboard/services/gpu/deploy?gpu=b300-sxm6-ac-288",
    tone: "amber",
    live: { kind: "gpu", id: "b300-sxm6-ac-288" },
  },
  {
    label: "Dedicated servers",
    href: "/services/compute",
    tone: "grey",
    live: { kind: "bare-metal" },
  },
];

/**
 * The offer chip at the right of the bar. `null` renders nothing in
 * production; in development an empty slot is drawn so the layout can be
 * seen. Set it when there is a real offer to make, e.g.
 *   { label: "$25 in credits for new accounts", href: "/signup" }
 */
export const HERO_OFFER: { label: string; href: string } | null = null;

/** The model id shown in the hero's API request. Must be a live public id. */
export const HERO_FEATURED_MODEL_ID = "zhipu/glm-5.3";

/** Region count is stated once and reused, rather than restated per section. */
export const HERO_REGIONS = 15;
