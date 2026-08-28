"use client";

import type { ComponentType } from "react";
import {
  SiAngular,
  SiAstro,
  SiDjango,
  SiDocker,
  SiExpress,
  SiFastapi,
  SiGatsby,
  SiGo,
  SiHugo,
  SiLaravel,
  SiNestjs,
  SiNextdotjs,
  SiNodedotjs,
  SiNuxt,
  SiPython,
  SiReact,
  SiRust,
  SiSpringboot,
  SiSvelte,
  SiSymfony,
} from "react-icons/si";

/**
 * The frameworks this platform detects, scrolling beside the repository picker.
 *
 * SAME MECHANISM AS THE INFERENCE MODEL WALL on the marketing pages — counter-
 * scrolling columns, fade masks so the loop dissolves rather than clipping, and
 * paused on hover so a name can actually be read. Reusing the idiom is the
 * point: this dashboard should look like one product.
 *
 * EVERY TILE IS A FRAMEWORK THAT ACTUALLY BUILDS, and most were deployed end to
 * end while the detector was being written. That constraint is why there is no
 * Rails tile and no .NET tile: a wall advertising things that do not build is
 * the same habit as v1's "99.99% uptime", except the reader is three feet from
 * the button that disproves it.
 *
 * TWO COLUMNS, AND SHORT ENOUGH TO SIT BESIDE THE FORM. A third column and a
 * 620px height ran past the bottom of the card next to it and added scroll to a
 * page whose whole job is one short form. Decoration that makes the form harder
 * to reach has stopped decorating.
 */

interface Tile {
  name: string;
  /** How it is served once built — the thing a customer is actually choosing. */
  meta: string;
  accent: string;
  Icon: ComponentType<{ className?: string }>;
}

const COLUMN_A: Tile[] = [
  { name: "next.js", meta: "node · standalone", accent: "#FFFFFF", Icon: SiNextdotjs },
  { name: "nuxt", meta: "node · nitro", accent: "#00DC82", Icon: SiNuxt },
  { name: "astro", meta: "static · nginx", accent: "#FF5D01", Icon: SiAstro },
  { name: "react", meta: "static · nginx", accent: "#61DAFB", Icon: SiReact },
  { name: "sveltekit", meta: "node · adapter", accent: "#FF3E00", Icon: SiSvelte },
  { name: "angular", meta: "static · nginx", accent: "#DD0031", Icon: SiAngular },
  { name: "gatsby", meta: "static · public/", accent: "#663399", Icon: SiGatsby },
  { name: "hugo", meta: "static · extended", accent: "#FF4088", Icon: SiHugo },
  { name: "vite", meta: "static · dist/", accent: "#A855F7", Icon: SiReact },
];

const COLUMN_B: Tile[] = [
  { name: "nestjs", meta: "node · start:prod", accent: "#E0234E", Icon: SiNestjs },
  { name: "express", meta: "node · npm start", accent: "#8CC84B", Icon: SiExpress },
  { name: "fastify", meta: "node · npm start", accent: "#8CC84B", Icon: SiNodedotjs },
  { name: "django", meta: "python · gunicorn", accent: "#0C9D58", Icon: SiDjango },
  { name: "fastapi", meta: "python · uvicorn", accent: "#059486", Icon: SiFastapi },
  { name: "laravel", meta: "php · apache", accent: "#FF2D20", Icon: SiLaravel },
  { name: "symfony", meta: "php · apache", accent: "#C084FC", Icon: SiSymfony },
  { name: "spring boot", meta: "jvm · maven", accent: "#6DB33F", Icon: SiSpringboot },
  { name: "go", meta: "static · distroless", accent: "#00ADD8", Icon: SiGo },
  { name: "rust", meta: "release · distroless", accent: "#DEA584", Icon: SiRust },
  { name: "python", meta: "3.12 · slim", accent: "#FFD43B", Icon: SiPython },
  { name: "dockerfile", meta: "built as-is", accent: "#2496ED", Icon: SiDocker },
];

const COLUMNS: Array<{ tiles: Tile[]; durationS: number; reverse: boolean }> = [
  { tiles: COLUMN_A, durationS: 40, reverse: false },
  { tiles: COLUMN_B, durationS: 52, reverse: true },
];

function FrameworkTile({ tile }: { tile: Tile }) {
  const { Icon } = tile;
  return (
    <div className="group/tile flex items-center gap-2.5 border border-white/[0.06] bg-white/[0.015] px-2.5 py-2 transition-colors duration-300 hover:border-white/[0.18] hover:bg-white/[0.05]">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center border"
        style={{
          background: `linear-gradient(135deg, ${tile.accent}22, ${tile.accent}08)`,
          borderColor: `${tile.accent}40`,
          color: tile.accent,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-mono text-[11px] font-medium text-white">{tile.name}</p>
        <p className="truncate font-mono text-[9.5px] text-white/35">{tile.meta}</p>
      </div>
    </div>
  );
}

function Column({ tiles, durationS, reverse }: { tiles: Tile[]; durationS: number; reverse: boolean }) {
  return (
    <div className="group relative h-full overflow-hidden">
      <div
        className="v2-marquee-track flex flex-col gap-2 will-change-transform group-hover:[animation-play-state:paused]"
        style={{
          animation: `${reverse ? "v2-marquee-down" : "v2-marquee-up"} ${durationS}s linear infinite`,
        }}
      >
        {/* Rendered twice: the keyframe travels 0 to -50%, so the second copy
            lands exactly where the first began and the wrap is invisible. */}
        {[...tiles, ...tiles].map((t, i) => (
          <FrameworkTile key={`${t.name}-${i}`} tile={t} />
        ))}
      </div>
    </div>
  );
}

export function FrameworkMarquee() {
  return (
    <div className="relative h-[440px]">
      {/* Fade masks, so the columns dissolve into the page rather than ending on
          a hard edge that reads as a clipping bug. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-[#08090b] to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-[#08090b] to-transparent"
      />

      <div className="grid h-full grid-cols-2 gap-2">
        {COLUMNS.map((c, i) => (
          <Column key={i} {...c} />
        ))}
      </div>

      <style jsx global>{`
        @keyframes v2-marquee-up {
          from { transform: translateY(0); }
          to   { transform: translateY(-50%); }
        }
        @keyframes v2-marquee-down {
          from { transform: translateY(-50%); }
          to   { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .v2-marquee-track { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
