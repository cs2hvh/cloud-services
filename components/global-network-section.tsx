"use client";

import WorldMap from "@/components/ui/worldmap";
import { RegionFlag } from "@/components/ui/region-flag";

/**
 * GlobalNetworkSection — map + a single location strip.
 *
 * Kept deliberately short. The previous version stacked a full-width map, a
 * four-tile figure block and a three-column index of all 15 regions, which made
 * the network the tallest section on the page for what is essentially one fact:
 * where we run. The map is capped, the figures collapse to one line, and the
 * index is a wrapped strip.
 *
 * Content decisions carried forward:
 *
 * 1. REGION COUNT is derived from LOCATIONS, not restated, so the number and
 *    the list cannot drift apart (the site previously said 12 in the hero and
 *    15 here while listing 15 cities).
 *
 * 2. LATENCY AND SLA FIGURES ARE ABSENT ON PURPOSE. The old block advertised
 *    "<20ms Avg Latency" and "99.99% Uptime SLA" with nothing defining how
 *    either is measured. Put them back once there is a measured p50 and /sla
 *    defines the basis — and cite the basis alongside the number.
 */

type Location = {
  city: string;
  /** ISO alpha-2, passed straight to RegionFlag so no lookup is needed. */
  code: string;
  lat: number;
  lng: number;
};

const LOCATIONS: Location[] = [
  { city: "Mumbai", code: "in", lat: 19.076, lng: 72.8777 },
  { city: "Singapore", code: "sg", lat: 1.3521, lng: 103.8198 },
  { city: "Dubai", code: "ae", lat: 25.2048, lng: 55.2708 },
  { city: "Tokyo", code: "jp", lat: 35.6762, lng: 139.6503 },
  { city: "Sydney", code: "au", lat: -33.8688, lng: 151.2093 },
  { city: "London", code: "gb", lat: 51.5074, lng: -0.1278 },
  { city: "Frankfurt", code: "de", lat: 50.1109, lng: 8.6821 },
  { city: "Amsterdam", code: "nl", lat: 52.3676, lng: 4.9041 },
  { city: "Paris", code: "fr", lat: 48.8566, lng: 2.3522 },
  { city: "Madrid", code: "es", lat: 40.4168, lng: -3.7038 },
  { city: "Stockholm", code: "se", lat: 59.3293, lng: 18.0686 },
  { city: "New York", code: "us", lat: 40.7128, lng: -74.006 },
  { city: "San Francisco", code: "us", lat: 37.7749, lng: -122.4194 },
  { city: "Los Angeles", code: "us", lat: 34.0522, lng: -118.2437 },
  { city: "São Paulo", code: "br", lat: -23.5505, lng: -46.6333 },
];

/** Single source of truth — the hero and compute strip quote this same number. */
export const REGION_COUNT = LOCATIONS.length;

const COUNTRY_COUNT = new Set(LOCATIONS.map((l) => l.code)).size;

export default function GlobalNetworkSection() {
  return (
    <section
      className="px-6 py-16 sm:px-10 lg:px-12 lg:py-20"
      style={{ background: "var(--ah-bg)" }}
      aria-labelledby="network-heading"
    >
      <div className="mx-auto max-w-[1704px]">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2
              id="network-heading"
              className="ah-rise ah-h2"
            >
              Global <span className="ah-h2-hl">infrastructure</span>
            </h2>
          </div>

          <div className="ah-lbl flex items-center gap-2.5" style={{ color: "var(--ah-body)" }}>
            <span style={{ color: "var(--ah-blue-lt)" }}>{REGION_COUNT} regions</span>
            <span style={{ color: "var(--ah-line-hi)" }}>·</span>
            <span>{COUNTRY_COUNT} countries</span>
            <span style={{ color: "var(--ah-line-hi)" }}>·</span>
            <span>In-region residency</span>
          </div>
        </div>

        {/* Capped so the map informs rather than dominates. The map and its
            pin overlay share one transformed box, so the tilt and the mask
            move them together and every pin stays on its city.
            - the elliptical mask rounds off the rectangle's empty corners
              (Arctic and Antarctic dots) without touching any pin: the
              furthest pins (Sydney, San Francisco, São Paulo) sit inside the
              fully opaque zone
            - the slight rotateX reads as the surface curving away */}
        <div className="relative mx-auto max-w-[1120px]" style={{ perspective: "1600px" }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 48% 44% at 50% 52%, rgba(0,149,255,0.10), transparent 70%)" }}
          />
          <div
            className="relative"
            style={{
              transform: "rotateX(6deg)",
              transformOrigin: "50% 60%",
              maskImage: "radial-gradient(ellipse 72% 80% at 50% 50%, #000 70%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse 72% 80% at 50% 50%, #000 70%, transparent 100%)",
            }}
          >
            <WorldMap
              locations={LOCATIONS.map((l) => ({ lat: l.lat, lng: l.lng, label: l.city }))}
              dotColor="var(--ah-blue)"
            />
          </div>
        </div>

        {/* one wrapped strip instead of a three-column index */}
        <div
          className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3.5 pt-7"
          style={{ borderTop: "1px solid var(--ah-line)" }}
        >
          {LOCATIONS.map((l) => (
            <span key={l.city} className="inline-flex items-center gap-2">
              <RegionFlag code={l.code} size={17} className="shrink-0" />
              <span className="text-[13px]" style={{ color: "var(--ah-body)" }}>
                {l.city}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
