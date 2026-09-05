"use client";

import DottedMap from "dotted-map";
import Image from "next/image";
import { useMemo } from "react";

interface LocationPoint {
  lat: number;
  lng: number;
  label: string;
}

interface MapProps {
  locations?: LocationPoint[];
  dotColor?: string;
  /**
   * CSS mask-image applied to the dotted map ONLY (not to the pin overlay),
   * e.g. a radial ellipse that clips the world to an oval. Pins are left
   * unmasked so a city on the mask's edge keeps its full marker. Defaults to
   * the soft top/bottom fade.
   */
  bgMask?: string;
}

export default function WorldMap({
  locations = [],
  dotColor = "#0095FF",
  bgMask,
}: MapProps) {
  // Build the dotted map once. dotted-map projects with Web Mercator (proj4 GOOGLE)
  // over a clipped region (lat ~ -56..71), so we MUST use its own getPin() to place
  // markers — a hand-rolled equirectangular formula misaligns every dot.
  const { svgMap, width, height, pins } = useMemo(() => {
    const map = new DottedMap({ height: 100, grid: "diagonal" });

    const svg = map.getSVG({
      radius: 0.22,
      color: "#FFFFFF40",
      shape: "circle",
      backgroundColor: "transparent",
    });

    const { width: w, height: h } = map.image;

    // Project each location through the map's own projection → SVG coordinate space.
    const projected = locations.map((loc) => {
      const pin = map.getPin({ lat: loc.lat, lng: loc.lng });
      return { ...loc, x: pin.x, y: pin.y };
    });

    return { svgMap: svg, width: w, height: h, pins: projected };
  }, [locations]);

  return (
    // Match the container ratio to the map's real ratio so the background image and
    // the overlay <svg> fit identically (no stretch, no letterbox → no drift).
    <div
      className="relative w-full font-sans"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <Image
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className={`h-full w-full pointer-events-none select-none${bgMask ? "" : " [mask-image:linear-gradient(to_bottom,transparent,white_8%,white_92%,transparent)]"}`}
        style={bgMask ? { maskImage: bgMask, WebkitMaskImage: bgMask } : undefined}
        alt="world map"
        height={height * 5}
        width={width * 5}
        draggable={false}
        priority={false}
      />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full absolute inset-0 pointer-events-none select-none"
      >
        <defs>
          <radialGradient id="dot-glow">
            <stop offset="0%" stopColor={dotColor} stopOpacity="0.45" />
            <stop offset="100%" stopColor={dotColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {pins.map((loc, i) => (
          <g key={`loc-${i}`}>
            {/* Soft glow halo */}
            <circle cx={loc.x} cy={loc.y} r="4.5" fill="url(#dot-glow)" />

            {/* Expanding ping ring */}
            <circle
              cx={loc.x}
              cy={loc.y}
              r="1"
              fill="none"
              stroke={dotColor}
              strokeWidth="0.25"
              opacity="0.5"
            >
              <animate
                attributeName="r"
                from="1"
                to="4.5"
                dur="2.5s"
                begin={`${i * 0.18}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                from="0.5"
                to="0"
                dur="2.5s"
                begin={`${i * 0.18}s`}
                repeatCount="indefinite"
              />
            </circle>

            {/* Second ring, half-cycle offset for a continuous pulse */}
            <circle
              cx={loc.x}
              cy={loc.y}
              r="1"
              fill="none"
              stroke={dotColor}
              strokeWidth="0.25"
              opacity="0.35"
            >
              <animate
                attributeName="r"
                from="1"
                to="4.5"
                dur="2.5s"
                begin={`${i * 0.18 + 1.25}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                from="0.35"
                to="0"
                dur="2.5s"
                begin={`${i * 0.18 + 1.25}s`}
                repeatCount="indefinite"
              />
            </circle>

            {/* Bright core */}
            <circle cx={loc.x} cy={loc.y} r="0.9" fill={dotColor} />
            <circle cx={loc.x} cy={loc.y} r="0.45" fill="#FFFFFF" opacity="0.85" />
          </g>
        ))}
      </svg>
    </div>
  );
}
