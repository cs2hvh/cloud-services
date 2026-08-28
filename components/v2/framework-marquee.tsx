"use client";

/**
 * The frameworks this platform detects, scrolling beside the repository picker.
 *
 * SAME MECHANISM AS THE INFERENCE MODEL WALL on the marketing pages — counter-
 * scrolling columns, a tinted left rail per ecosystem, fade masks top and bottom
 * so the loop dissolves rather than clipping, and paused on hover so a name can
 * actually be read. Reusing the idiom is the point: this dashboard should look
 * like one product.
 *
 * EVERY ENTRY IS A FRAMEWORK THE DETECTOR ACTUALLY HANDLES, and most of them
 * were deployed end to end while the detector was being built. That constraint
 * is why there is no Rails tile and no .NET tile: a wall of logos advertising
 * things that do not build is the exact habit this rebuild exists to break, and
 * the person reading it is three feet from the button that would prove it wrong.
 *
 * The right column carries languages rather than frameworks, so the eye gets
 * "and the runtime underneath" rather than a third helping of JavaScript.
 */

interface Tile {
  name: string;
  /** How it is served once built — the thing a customer is actually choosing. */
  meta: string;
  tag: string;
  accent: string;
}

const NODE = "#8CC84B";
const REACTISH = "#61DAFB";
const STATIC = "#F7A41D";
const BACKEND = "#0095FF";
const OTHER = "#C084FC";

const COLUMN_A: Tile[] = [
  { name: "next.js", meta: "node · standalone server", tag: "REACT", accent: REACTISH },
  { name: "nuxt", meta: "node · nitro server", tag: "VUE", accent: "#00DC82" },
  { name: "astro", meta: "static · nginx", tag: "STATIC", accent: STATIC },
  { name: "sveltekit", meta: "node · adapter-node", tag: "SVELTE", accent: "#FF3E00" },
  { name: "react", meta: "static · nginx", tag: "VITE / CRA", accent: REACTISH },
  { name: "angular", meta: "static · nginx", tag: "ANGULAR", accent: "#DD0031" },
  { name: "gatsby", meta: "static · public/", tag: "REACT", accent: "#663399" },
  { name: "hugo", meta: "static · extended build", tag: "GO", accent: "#FF4088" },
];

const COLUMN_B: Tile[] = [
  { name: "nestjs", meta: "node · start:prod", tag: "NODE", accent: "#E0234E" },
  { name: "express", meta: "node · npm start", tag: "NODE", accent: NODE },
  { name: "fastify", meta: "node · npm start", tag: "NODE", accent: NODE },
  { name: "django", meta: "python · gunicorn", tag: "PYTHON", accent: "#092E20" },
  { name: "fastapi", meta: "python · uvicorn", tag: "PYTHON", accent: "#059486" },
  { name: "laravel", meta: "php · apache", tag: "PHP", accent: "#FF2D20" },
  { name: "symfony", meta: "php · apache", tag: "PHP", accent: OTHER },
  { name: "spring boot", meta: "jvm · maven", tag: "JAVA", accent: "#6DB33F" },
];

const COLUMN_C: Tile[] = [
  { name: "go", meta: "static binary · distroless", tag: "GO", accent: "#00ADD8" },
  { name: "rust", meta: "release binary · distroless", tag: "RUST", accent: "#DEA584" },
  { name: "python", meta: "3.12 · slim", tag: "RUNTIME", accent: "#FFD43B" },
  { name: "node", meta: "18 · 20 · 22 · 24", tag: "RUNTIME", accent: NODE },
  { name: "ruby", meta: "bundler · rails", tag: "RUNTIME", accent: "#CC342D" },
  { name: "docusaurus", meta: "static · build/", tag: "DOCS", accent: BACKEND },
  { name: "dockerfile", meta: "built as-is", tag: "ANY", accent: "#2496ED" },
  { name: "vite", meta: "static · dist/", tag: "BUNDLER", accent: OTHER },
];

const COLUMNS: Array<{ tiles: Tile[]; durationS: number; reverse: boolean }> = [
  { tiles: COLUMN_A, durationS: 42, reverse: false },
  { tiles: COLUMN_B, durationS: 52, reverse: true },
  { tiles: COLUMN_C, durationS: 46, reverse: false },
];

function FrameworkTile({ tile }: { tile: Tile }) {
  return (
    <div className="group/tile relative overflow-hidden border border-white/[0.06] bg-white/[0.015] px-3 py-2.5 transition-colors duration-300 hover:border-white/[0.18] hover:bg-white/[0.05]">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px] opacity-60 transition-opacity duration-300 group-hover/tile:opacity-100"
        style={{ background: `linear-gradient(180deg, ${tile.accent}, transparent)` }}
      />
      <div className="flex items-baseline justify-between gap-2 pl-2">
        <p className="truncate font-mono text-[11.5px] font-medium text-white">{tile.name}</p>
        <p
          className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: `${tile.accent}cc` }}
        >
          {tile.tag}
        </p>
      </div>
      <p className="mt-1 truncate pl-2 font-mono text-[10px] text-white/40">{tile.meta}</p>
    </div>
  );
}

function Column({ tiles, durationS, reverse }: { tiles: Tile[]; durationS: number; reverse: boolean }) {
  return (
    <div className="group relative h-full overflow-hidden">
      <div
        className="v2-marquee-track flex flex-col gap-2.5 will-change-transform group-hover:[animation-play-state:paused]"
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
    <div className="relative h-[620px]">
      {/* Fade masks, so the columns dissolve into the page rather than ending
          on a hard edge that reads as a clipping bug. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#08090b] to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#08090b] to-transparent"
      />

      <div className="grid h-full grid-cols-2 gap-2.5 xl:grid-cols-3">
        {COLUMNS.map((c, i) => (
          // The third column is the one that goes when the viewport narrows, so
          // it holds languages: losing it costs the least.
          <div key={i} className={i === 2 ? "hidden xl:block" : undefined}>
            <Column {...c} />
          </div>
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
