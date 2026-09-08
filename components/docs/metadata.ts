import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

/**
 * Page metadata for a docs page, including its own link-preview card.
 *
 * The root layout sets Open Graph and Twitter fields for the whole site, and
 * Next resolves the nearest definition rather than merging titles, so a page
 * that only set `title` still unfurled as the home card in Slack, Discord
 * and iMessage. Every docs page goes through this so the card names the
 * page and draws it with /docs/og.
 *
 * `title` is the full document title, "Models — Inference API — AhuraSense
 * Docs"; the card uses the first segment as its headline and the second as
 * its kicker.
 */
export function docsMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  /** Route path, e.g. "/docs/inference/models". */
  path: string;
}): Metadata {
  const parts = title.split(" — ").map((s) => s.trim());
  const headline = parts[0] ?? title;
  const kicker = parts.length >= 3 ? (parts[1] ?? "Documentation") : "Documentation";
  const cardTitle = `${headline} — AhuraSense Docs`;
  const url = `${siteConfig.url}${path}`;
  const image = `${siteConfig.url}/docs/og?${new URLSearchParams({ k: kicker, t: headline, s: description })}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: siteConfig.name,
      url,
      title: cardTitle,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: `${headline}: ${kicker} documentation` }],
    },
    twitter: {
      card: "summary_large_image",
      title: cardTitle,
      description,
      images: [image],
    },
  };
}
