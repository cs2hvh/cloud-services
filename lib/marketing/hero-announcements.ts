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

export type HeroLive =
  | { kind: "gpu"; id: string }
  /** Several GPUs at once: "B300 $7.89, H200 SXM $3.59 per GPU-hour". */
  | { kind: "gpus"; ids: string[] }
  | { kind: "bare-metal" };

export interface HeroAdSpec {
  /** Small mono label above the title, e.g. "New on the API". */
  eyebrow: string;
  /** Two short lines; `\n` breaks the line. Uppercase, large. */
  title: string;
  /**
   * One sentence. For `live` items the resolved figure is appended. The token
   * `{models}` is replaced with the live count of public models; an item
   * that uses it is dropped if the count cannot be read.
   */
  body: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  tone: HeroTone;
  /** Show only while every one of these public model ids is live in inference.models. */
  requiresModel?: string | string[];
  /**
   * Append a live figure to `body`:
   *   { kind: "gpu", id }     → " From $X.XX/hr."  from the public GPU catalog
   *   { kind: "gpus", ids }   → " B300 $7.89, H200 SXM $3.59 per GPU-hour."
   *   { kind: "bare-metal" }  → " N configurations from $X/mo."
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
// Each item states one thing the platform offers today, in as few words as
// it takes, and every number in it is read from the catalogs at render time.
// Titles are two lines of two or three words; the body is one short sentence.
// (The title is set at up to 5.2rem in a ~1000px column: a line longer than
// ~16 characters wraps to a third line at 1900px wide.) The plate is for the
// AI products; the cloud underneath (VMs, Kubernetes, databases) has its own
// sections further down the page. Order is display order; newest first.
export const HERO_ADS: HeroAdSpec[] = [
  {
    eyebrow: "Inference API",
    title: "GLM-5.3\nis live.",
    body: "{models} models on one OpenAI-compatible endpoint, one key, up to 1M context.",
    primary: { label: "Open the playground", href: "/dashboard/services/inference" },
    secondary: { label: "All models", href: "/services/inference" },
    tone: "green",
    requiresModel: "zhipu/glm-5.3",
  },
  {
    eyebrow: "GPU cloud",
    title: "B300 and H200\navailable.",
    body: "Blackwell and Hopper pods, 1 to 8 GPUs, no commitment.",
    primary: { label: "Deploy a pod", href: "/dashboard/services/gpu/deploy" },
    secondary: { label: "All GPUs", href: "/services/gpu" },
    tone: "amber",
    live: { kind: "gpus", ids: ["b300-sxm6-ac-288", "h200-141"] },
  },
  {
    eyebrow: "Fine-tuning and deployments",
    title: "Your model,\nour GPUs.",
    body: "Fine-tune on our GPUs or deploy any Hugging Face or Docker model, served on the same API.",
    primary: { label: "Start a fine-tune", href: "/dashboard/services/inference/fine-tuning" },
    secondary: { label: "Deploy a model", href: "/dashboard/services/inference/deployments" },
    tone: "grey",
  },
  {
    eyebrow: "Bare metal",
    title: "Dedicated\nservers.",
    body: "AMD and Intel, single tenant, full root access.",
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
 * Small tiles under the platform statement. Empty on purpose: GPUs are in
 * the rail directly below and dedicated servers are in the plate. Add an
 * entry here to bring one back, e.g.
 *   { eyebrow: "Dedicated", label: "Dedicated servers", href: "/services/compute",
 *     tone: "grey", live: { kind: "bare-metal" } }
 */
export const HERO_TILES: HeroTileSpec[] = [];

/**
 * The offer chip next to the actions. `null` renders nothing in production;
 * in development an empty slot is drawn so the layout can be seen. Set it
 * when there is a real offer to make, e.g.
 *   { label: "$25 in credits for new accounts", href: "/signup" }
 */
export const HERO_OFFER: { label: string; href: string } | null = null;

/** Region count is stated once and reused, rather than restated per section. */
export const HERO_REGIONS = 15;
