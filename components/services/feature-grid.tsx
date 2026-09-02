import Image from "next/image";

import { assetUrl } from "@/lib/asset-url";

/**
 * The "why this service" grid that sits under every service listing.
 *
 * WHY THE PER-CARD ICONS ARE GONE
 *
 * There are eleven illustrations in /images/kubernetes-ui and six service
 * pages, each showing six to eight cards. The same handful of pictures
 * therefore appeared on every page, several times per page, next to copy they
 * had nothing to do with — "auto scaling.png" beside a line about sleeping when
 * idle, "Built in load balancing png.png" beside connection pooling. At that
 * density an illustration stops distinguishing anything and becomes wallpaper:
 * every service page looked like the same page.
 *
 * So each section now keeps ONE illustration, next to its heading, and the
 * cards are text. One picture per page can be chosen to actually suit that
 * page, and the pages stop looking interchangeable.
 *
 * Cards carry a hairline rule instead. It gives the grid its column structure
 * back — which is the only job the icons were really doing at that size — for
 * none of the visual noise.
 */

export type ServiceFeature = {
  title: string;
  /** Body copy. `desc` and `body` both work; the pages disagreed already. */
  desc: string;
  /** The honest edge of the claim, when there is one. */
  caveat?: string;
};

export function ServiceFeatureGrid({
  features,
  columns = 3,
  illustration,
  className = "",
}: {
  features: readonly ServiceFeature[];
  /** Widest breakpoint column count. Two reads better for longer copy. */
  columns?: 2 | 3 | 4;
  /**
   * The ONE picture this section is allowed. Give each service a different
   * one — that is what makes the pages distinguishable now that the cards no
   * longer carry six copies of the same four images.
   */
  illustration?: string;
  className?: string;
}) {
  const wide =
    columns === 2
      ? "lg:grid-cols-2"
      : columns === 3
        ? "xl:grid-cols-3"
        : "xl:grid-cols-4";

  return (
    <div className={className}>
      {illustration ? (
        <SectionIllustration src={illustration} className="mb-5" />
      ) : null}
      <div className={`grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 ${wide}`}>
        {features.map((f) => (
          <div key={f.title} className="border-l border-white/[0.08] pl-4">
            <h3 className="mb-1.5 text-[13.5px] font-semibold tracking-[-0.01em] text-white">
              {f.title}
            </h3>
            <p className="text-[12px] leading-relaxed text-white/55">{f.desc}</p>
            {f.caveat ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/30">
                {f.caveat}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The single illustration a section is allowed to keep, sized to sit beside a
 * heading rather than inside a card.
 *
 * Deliberately not animated. Six floating icons per page read as a loading
 * state; one that holds still reads as a mark.
 */
export function SectionIllustration({
  src,
  size = 56,
  className = "",
}: {
  src: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${className}`}
      style={{ height: size, width: size }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-50 blur-xl"
        style={{
          background:
            "radial-gradient(circle, rgba(0,149,255,0.18), transparent 60%)",
        }}
      />
      <Image
        src={assetUrl(src)}
        alt=""
        width={size}
        height={size}
        className="relative object-contain"
        unoptimized
      />
    </div>
  );
}
