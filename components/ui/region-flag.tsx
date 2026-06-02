"use client";

// Country flag for a region/location, resolved from any of slug / display name
// / country via lib/regions/country. Served directly from flagcdn (allowlisted
// in CSP img-src + next.config remotePatterns). Falls back to a map pin when the
// country can't be determined. Reusable across every location picker.

import Image from "next/image";
import { MapPin } from "lucide-react";
import { countryCodeFor, flagUrl, flagPx } from "@/lib/regions/country";

export function RegionFlag({
  region,
  name,
  country,
  code: codeProp,
  size = 18,
  className = "",
}: {
  /** Region slug (e.g. "fra", "sgp"). */
  region?: string | null;
  /** Display name / city (e.g. "Frankfurt"). */
  name?: string | null;
  /** Explicit country if known (e.g. "Germany"). */
  country?: string | null;
  /** Pre-resolved ISO alpha-2 code; skips lookup when provided. */
  code?: string | null;
  /** Flag width in px (height is 3:4 of this). */
  size?: number;
  className?: string;
}) {
  const code = codeProp ?? countryCodeFor(region, name, country);
  const dispH = Math.round(size * 0.75);

  if (!code) {
    return (
      <MapPin
        className={`text-white/40 ${className}`}
        style={{ width: size * 0.8, height: size * 0.8 }}
        aria-hidden
      />
    );
  }

  // flagcdn only serves discrete 4:3 sizes — snap to a valid one so it never 404s.
  const px = flagPx(size);

  return (
    <Image
      src={flagUrl(code, px.w, px.h)}
      alt=""
      width={size}
      height={dispH}
      unoptimized
      className={`object-cover rounded-[2px] ${className}`}
      style={{ width: size, height: dispH }}
    />
  );
}
