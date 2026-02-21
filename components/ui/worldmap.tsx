"use client";

import DottedMap from "dotted-map";
import Image from "next/image";

interface LocationPoint {
  lat: number;
  lng: number;
  label: string;
}

interface MapProps {
  locations?: LocationPoint[];
  dotColor?: string;
}

export default function WorldMap({
  locations = [],
  dotColor = "#0095FF",
}: MapProps) {
  const map = new DottedMap({ height: 100, grid: "diagonal" });

  const svgMap = map.getSVG({
    radius: 0.22,
    color: "#FFFFFF40",
    shape: "circle",
    backgroundColor: "transparent",
  });

  const projectPoint = (lat: number, lng: number) => {
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  };

  return (
    <div className="w-full aspect-[2/1] relative font-sans">
      <Image
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className="h-full w-full [mask-image:linear-gradient(to_bottom,transparent,white_10%,white_90%,transparent)] pointer-events-none select-none"
        alt="world map"
        height="495"
        width="1056"
        draggable={false}
      />
      <svg
        viewBox="0 0 800 400"
        className="w-full h-full absolute inset-0 pointer-events-none select-none"
      >
        <defs>
          <radialGradient id="dot-glow">
            <stop offset="0%" stopColor={dotColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor={dotColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {locations.map((loc, i) => {
          const point = projectPoint(loc.lat, loc.lng);
          return (
            <g key={`loc-${i}`}>
              {/* Glow background */}
              <circle
                cx={point.x}
                cy={point.y}
                r="14"
                fill="url(#dot-glow)"
              />

              {/* Pulsing ring */}
              <circle
                cx={point.x}
                cy={point.y}
                r="3"
                fill="none"
                stroke={dotColor}
                strokeWidth="0.5"
                opacity="0.5"
              >
                <animate
                  attributeName="r"
                  from="3"
                  to="12"
                  dur="2.5s"
                  begin={`${i * 0.2}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  from="0.5"
                  to="0"
                  dur="2.5s"
                  begin={`${i * 0.2}s`}
                  repeatCount="indefinite"
                />
              </circle>

              {/* Second pulsing ring (delayed) */}
              <circle
                cx={point.x}
                cy={point.y}
                r="3"
                fill="none"
                stroke={dotColor}
                strokeWidth="0.5"
                opacity="0.35"
              >
                <animate
                  attributeName="r"
                  from="3"
                  to="12"
                  dur="2.5s"
                  begin={`${i * 0.2 + 1.25}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  from="0.35"
                  to="0"
                  dur="2.5s"
                  begin={`${i * 0.2 + 1.25}s`}
                  repeatCount="indefinite"
                />
              </circle>

              {/* Core dot */}
              <circle
                cx={point.x}
                cy={point.y}
                r="2.5"
                fill={dotColor}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
