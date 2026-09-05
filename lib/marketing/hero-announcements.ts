// What the home hero announces. Edit this file to change the rotating plate
// on the left of the hero, the two small tiles on the right, and the offer.
//
// WHY A FILE AND NOT A TABLE. A handful of items, changed by a person a few
// times a month, reviewed in a diff. A CMS for this would be a second place
// for copy to go stale. Numbers that move on their own (a GPU price, the
// dedicated-server floor and count) are NOT typed here: an item can ask for a
// live figure via `live`, and components/hero.tsx resolves it from the same
// catalog the deploy pages read. An item whose live figure cannot be resolved
// is dropped and logged, never shown with a blank where the number should be.
// An item that names a model is dropped if that model is not live.

export type HeroTone = "green" | "amber" | "grey";

export type HeroLive = { kind: "gpu"; id: string } | { kind: "bare-metal" };

export interface HeroAdSpec {
  /** Small mono label above the title, e.g. "New on the API". */
  eyebrow: string;
  /** Two short lines; `\n` breaks the line. Uppercase, large. */
  title: string;
  /** One sentence. For `live` items the resolved figure is appended. */
  body: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  tone: HeroTone;
  /** Show only while this public model id is live in inference.models. */
  requiresModel?: string;
  /**
   * Append a live figure to `body`:
   *   { kind: "gpu", id }    → " From $X.XX/hr."  from the public GPU catalog
   *   { kind: "bare-metal" } → " N configurations from $X/mo."
   */
  live?: HeroLive;
}

/**
 * The rotating plate. Order is display order; the first item is what a
 * visitor sees before anything rotates, so put the newest thing first.
 *
 * To announce a new model, add an entry like this one and it appears the
 * moment the model is live (and disappears if it is switched off):
 *
 *   {
 *     eyebrow: "New on the API",
 *     title: "GPT-6 Astra\non the API.",
 *     body: "Drop-in on any OpenAI SDK. Same key, same endpoint, one model id.",
 *     primary: { label: "Try it in the playground", href: "/dashboard/services/inference" },
 *     secondary: { label: "See all models", href: "/services/inference" },
 *     tone: "green",
 *     requiresModel: "openai/gpt-6-astra",
 *   },
 */
export const HERO_ADS: HeroAdSpec[] = [
  {
    eyebrow: "New on the API",
    title: "GLM-5.3\non the API.",
    body: "Drop-in on any OpenAI SDK. Same key, same endpoint, one model id.",
    primary: { label: "Try it in the playground", href: "/dashboard/services/inference" },
    secondary: { label: "See all models", href: "/services/inference" },
    tone: "green",
    requiresModel: "zhipu/glm-5.3",
  },
  {
    eyebrow: "GPUs",
    title: "B300 Blackwell Ultra,\nby the hour.",
    body: "288 GB HBM3e per GPU, up to eight per pod, no commitment.",
    primary: { label: "Deploy a pod", href: "/dashboard/services/gpu/deploy?gpu=b300-sxm6-ac-288" },
    secondary: { label: "All GPUs", href: "/services/gpu" },
    tone: "amber",
    live: { kind: "gpu", id: "b300-sxm6-ac-288" },
  },
  {
    eyebrow: "Fine-tuning",
    title: "Your data,\nyour model.",
    body: "Fine-tune an open model on your dataset and serve it on the same API, on GPUs we run.",
    primary: { label: "Start a fine-tune", href: "/dashboard/services/inference/fine-tuning" },
    secondary: { label: "How it works", href: "/services/inference" },
    tone: "grey",
  },
  {
    eyebrow: "Dedicated",
    title: "Bare metal,\nsingle tenant.",
    body: "AMD and Intel machines with full root access.",
    primary: { label: "See the lineup", href: "/services/compute" },
    tone: "grey",
    live: { kind: "bare-metal" },
  },
];

/** Seconds each item stays before the plate advances. */
export const HERO_AD_SECONDS = 7;

export interface HeroTileSpec {
  eyebrow: string;
  /** For `live` items the resolved figure is appended. */
  label: string;
  href: string;
  tone: HeroTone;
  live?: HeroLive;
}

/**
 * Small tiles under the platform statement. GPUs are deliberately not here:
 * the rail directly below already shows them with live prices.
 */
export const HERO_TILES: HeroTileSpec[] = [
  {
    eyebrow: "Dedicated",
    label: "Dedicated servers",
    href: "/services/compute",
    tone: "grey",
    live: { kind: "bare-metal" },
  },
];

/**
 * The offer chip next to the actions. `null` renders nothing in production;
 * in development an empty slot is drawn so the layout can be seen. Set it
 * when there is a real offer to make, e.g.
 *   { label: "$25 in credits for new accounts", href: "/signup" }
 */
export const HERO_OFFER: { label: string; href: string } | null = null;

/** Region count is stated once and reused, rather than restated per section. */
export const HERO_REGIONS = 15;
