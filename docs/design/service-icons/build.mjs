// Service icon sources. One file holds every icon as an SVG body on a 64-unit
// grid; running it writes the standalone .svg files, the React component the
// site uses (components/icons/service-icons.tsx), the design canvas artboards
// (.dc.html), canvas.json and a preview page.
//
//   node docs/design/service-icons/build.mjs
//
// The system, shared by every service icon so they read as one family
// (Harshit picked this language, the front-facing package, on 2026-09-05):
//   - the plate: the site's notched card (8-unit cut, top-left and
//     bottom-right, the same corners .ah-notch cuts), #1c1c24 -> #0c0c10,
//     a 1-unit hairline at 10% white and a brighter line on the top edge,
//     a blue glow behind the glyph
//   - the glyph: one front-facing package per service in the blue ramp
//     #8fd0ff -> #0095ff -> #1d4ed8 (--ah-blue-lt / --ah-blue / --ah-blue-dp),
//     a lit ink core (#fafaf4), pins or memory as the signature, a soft
//     blue drop shadow for depth
//   - one amber LED (#f5b324, --ah-amber) per icon, the "live" mark the
//     GPU rail and the rack slots already use
//   - safe area 12..52; nothing but the plate touches the edge
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");

/** Plate + glow + filters, shared. `p` prefixes ids so icons can share a page. */
const plate = (p) => `
  <linearGradient id="${p}-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1c24"/><stop offset="1" stop-color="#0c0c10"/></linearGradient>
  <radialGradient id="${p}-glow" cx="32" cy="30" r="26" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0095ff" stop-opacity="0.36"/><stop offset="1" stop-color="#0095ff" stop-opacity="0"/></radialGradient>
  <filter id="${p}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="${p}-drop" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#0095ff" flood-opacity="0.45"/></filter>`;

const plateBody = (p) => `
  <path d="M8 0H64V56L56 64H0V8Z" fill="url(#${p}-tile)"/>
  <path d="M8 0H64V56L56 64H0V8Z" fill="url(#${p}-glow)"/>
  <path d="M8.5 0.5H63.5V55.8L55.8 63.5H0.5V8.2Z" fill="none" stroke="#ffffff" stroke-opacity="0.10"/>
  <path d="M9 1H63" stroke="#ffffff" stroke-opacity="0.14"/>`;

/** Compute: a processor package, pins on all four sides, a lit core. */
const compute = `
<defs>${plate("cp")}
  <linearGradient id="cp-chip" x1="17" y1="17" x2="47" y2="47" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2ea8ff"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
  <linearGradient id="cp-core" x1="27" y1="27" x2="37" y2="37" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8fd0ff"/><stop offset="1" stop-color="#0095ff"/></linearGradient>
</defs>${plateBody("cp")}
  <g fill="#7fc7ff" fill-opacity="0.9">
    <rect x="20.7" y="11.5" width="1.6" height="6.5"/><rect x="27.7" y="11.5" width="1.6" height="6.5"/><rect x="34.7" y="11.5" width="1.6" height="6.5"/><rect x="41.7" y="11.5" width="1.6" height="6.5"/>
    <rect x="20.7" y="46" width="1.6" height="6.5"/><rect x="27.7" y="46" width="1.6" height="6.5"/><rect x="34.7" y="46" width="1.6" height="6.5"/><rect x="41.7" y="46" width="1.6" height="6.5"/>
    <rect x="11.5" y="20.7" width="6.5" height="1.6"/><rect x="11.5" y="27.7" width="6.5" height="1.6"/><rect x="11.5" y="34.7" width="6.5" height="1.6"/><rect x="11.5" y="41.7" width="6.5" height="1.6"/>
    <rect x="46" y="20.7" width="6.5" height="1.6"/><rect x="46" y="27.7" width="6.5" height="1.6"/><rect x="46" y="34.7" width="6.5" height="1.6"/><rect x="46" y="41.7" width="6.5" height="1.6"/>
  </g>
  <rect x="17" y="17" width="30" height="30" rx="4" fill="url(#cp-chip)" filter="url(#cp-drop)"/>
  <rect x="17.5" y="17.5" width="29" height="29" rx="3.5" fill="none" stroke="#ffffff" stroke-opacity="0.22"/>
  <path d="M21 17.5H43" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.8"/>
  <rect x="24" y="24" width="16" height="16" rx="2" fill="#fafaf4" filter="url(#cp-soft)"/>
  <rect x="27.5" y="27.5" width="9" height="9" rx="1" fill="url(#cp-core)"/>
  <circle cx="43" cy="21" r="1.25" fill="#f5b324" filter="url(#cp-soft)"/>`;

/**
 * GPU Pods: an accelerator module, memory stacks either side of a lit die,
 * edge fingers along the bottom, and a second module behind it: the pod.
 */
const gpuPods = `
<defs>${plate("gp")}
  <linearGradient id="gp-card" x1="12" y1="20" x2="48" y2="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2ea8ff"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
  <linearGradient id="gp-back" x1="16" y1="13" x2="52" y2="39" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2757c9"/><stop offset="1" stop-color="#163b9c"/></linearGradient>
  <linearGradient id="gp-core" x1="26" y1="28" x2="34" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8fd0ff"/><stop offset="1" stop-color="#0095ff"/></linearGradient>
</defs>${plateBody("gp")}
  <rect x="16" y="13" width="36" height="26" rx="3" fill="url(#gp-back)" filter="url(#gp-drop)"/>
  <rect x="16.5" y="13.5" width="35" height="25" rx="2.5" fill="none" stroke="#ffffff" stroke-opacity="0.16"/>
  <g fill="#7fc7ff" fill-opacity="0.9">
    <rect x="16" y="46" width="1.6" height="4.5"/><rect x="19.5" y="46" width="1.6" height="4.5"/><rect x="23" y="46" width="1.6" height="4.5"/><rect x="26.5" y="46" width="1.6" height="4.5"/>
    <rect x="30" y="46" width="1.6" height="4.5"/><rect x="33.5" y="46" width="1.6" height="4.5"/><rect x="37" y="46" width="1.6" height="4.5"/><rect x="40.5" y="46" width="1.6" height="4.5"/>
  </g>
  <rect x="12" y="20" width="36" height="26" rx="3" fill="url(#gp-card)" filter="url(#gp-drop)"/>
  <rect x="12.5" y="20.5" width="35" height="25" rx="2.5" fill="none" stroke="#ffffff" stroke-opacity="0.22"/>
  <path d="M16 20.5H44" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.8"/>
  <g fill="#8fd0ff" fill-opacity="0.9">
    <rect x="15.5" y="26" width="6" height="5" rx="0.8"/><rect x="15.5" y="33" width="6" height="5" rx="0.8"/>
    <rect x="38.5" y="26" width="6" height="5" rx="0.8"/><rect x="38.5" y="33" width="6" height="5" rx="0.8"/>
  </g>
  <rect x="24" y="25" width="12" height="14" rx="1.5" fill="#fafaf4" filter="url(#gp-soft)"/>
  <rect x="26.5" y="28" width="7" height="8" rx="0.8" fill="url(#gp-core)"/>
  <circle cx="44.5" cy="23" r="1.25" fill="#f5b324" filter="url(#gp-soft)"/>`;

const ICONS = {
  compute: { body: compute, name: "Compute", component: "ComputeIcon" },
  "gpu-pods": { body: gpuPods, name: "GPU Pods", component: "GpuPodsIcon" },
};

const svgFile = (key) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${ICONS[key].name}">${ICONS[key].body}\n</svg>\n`;

const symbols = (keys) =>
  `<svg width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true">` +
  keys.map((k) => `<symbol id="ico-${k}" viewBox="0 0 64 64">${ICONS[k].body}</symbol>`).join("") +
  `</svg>`;

const ico = (k, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><use href="#ico-${k}"></use></svg>`;

// ── the React component: the same bodies, attributes camel-cased for JSX
const JSX_ATTRS = ["stop-color", "stop-opacity", "stroke-opacity", "fill-opacity", "stroke-width", "stroke-linejoin", "stroke-linecap", "flood-color", "flood-opacity"];
const toJsx = (svg) =>
  JSX_ATTRS.reduce(
    (s, a) => s.replaceAll(`${a}=`, `${a.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}=`),
    svg
  );

const componentFile = () => `// GENERATED by docs/design/service-icons/build.mjs. Edit the icon there and
// re-run it; do not edit this file by hand.
//
// The service icons: one front-facing package per service on the site's
// notched plate, in the blue ramp, with a lit ink core and one amber LED.
// Drawn on a 64-unit grid; render at any size from 16 px up.
import type { SVGProps } from "react";

export type ServiceIconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
    /** Rendered width and height in px. */
    size?: number;
    /** Accessible name; pass an empty string for a purely decorative icon. */
    title?: string;
};

function frame(size: number, title: string, rest: Omit<ServiceIconProps, "size" | "title">) {
    return {
        viewBox: "0 0 64 64",
        width: size,
        height: size,
        role: title ? "img" : undefined,
        "aria-label": title || undefined,
        "aria-hidden": title ? undefined : true,
        ...rest,
    } as const;
}
${Object.entries(ICONS)
  .map(
    ([, icon]) => `
/** ${icon.name}. */
export function ${icon.component}({ size = 40, title = "${icon.name}", ...rest }: ServiceIconProps) {
    return (
        <svg {...frame(size, title, rest)}>${toJsx(icon.body).replace(/\n/g, "\n        ")}
        </svg>
    );
}`
  )
  .join("\n")}
`;

// ── the design canvas
const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">`;

const STYLE = `
  body { margin: 0; background: #101013; font-family: 'Instrument Sans', system-ui, sans-serif; color: #fafaf4; }
  a { color: #7fc7ff; } a:hover { color: #0095ff; }
  .lbl { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; line-height: 1.4; text-transform: uppercase; color: #6d6d78; letter-spacing: 0; }
  .notch { clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px); }`;

const dc = (title, w, h, inner) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${FONTS}
  <style>${STYLE}
  </style>
</helmet>
<div style="width: ${w}px; height: ${h}px; box-sizing: border-box; background: #101013; color: #fafaf4; padding: 40px; display: flex; flex-direction: column; gap: 28px; overflow: hidden;">
${inner}
</div>
</x-dc>
</body>
</html>
`;

const ramp = (k, sizes) =>
  `<div style="display: flex; align-items: flex-end; gap: 22px;">` +
  sizes
    .map(
      (s) =>
        `<div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">${ico(k, s)}<span class="lbl">${s}</span></div>`
    )
    .join("") +
  `</div>`;

const swatch = (hex, name) =>
  `<div style="display: flex; align-items: center; gap: 8px;"><span style="width: 14px; height: 14px; background: ${hex}; display: inline-block; border: 1px solid rgba(255,255,255,0.12);"></span><span class="lbl" style="color: #9a9aa2; text-transform: none;">${hex} ${name}</span></div>`;

/** The full sheet for one icon: hero, size ramp, both grounds, a card, the construction rules. */
const sheet = (k, index, blurb, cardLine) => `
${symbols([k])}
<div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;">
  <div style="display: flex; flex-direction: column; gap: 10px;">
    <span class="lbl">Service icons · ${index}</span>
    <h1 style="margin: 0; font-size: 30px; font-weight: 500; line-height: 1; letter-spacing: -0.02em;">${ICONS[k].name}</h1>
  </div>
  <span class="lbl" style="color: #9a9aa2;">${ICONS[k].component} · 64 grid</span>
</div>

<div style="display: flex; gap: 48px; align-items: flex-start;">
  <div style="display: flex; flex-direction: column; gap: 18px; width: 260px; flex-shrink: 0;">
    ${ico(k, 192)}
    <p style="margin: 0; font-size: 14px; line-height: 1.55; color: #9a9aa2;">${blurb}</p>
  </div>

  <div style="display: flex; flex-direction: column; gap: 28px; flex-grow: 1;">
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <span class="lbl">Size ramp</span>
      ${ramp(k, [96, 64, 48, 32, 24, 16])}
    </div>

    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px;">
      <div class="notch" style="background: #f3f2ea; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px;">
        <span class="lbl" style="color: #6b6b72;">On the light band</span>
        <div style="display: flex; align-items: flex-end; gap: 18px;">${ico(k, 64)}${ico(k, 40)}${ico(k, 24)}</div>
      </div>
      <div class="notch" style="background: #141419; border: 1px solid #27272b; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px;">
        <span class="lbl">In a service card</span>
        <div style="display: flex; align-items: center; gap: 16px;">
          ${ico(k, 44)}
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span style="font-size: 16px; font-weight: 500; line-height: 1.2;">${ICONS[k].name}</span>
            <span style="font-size: 13px; line-height: 1.4; color: #9a9aa2;">${cardLine}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<div style="border-top: 1px solid #27272b; padding-top: 22px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px;">
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <span class="lbl">Plate</span>
    <span style="font-size: 13px; line-height: 1.5; color: #9a9aa2;">The site's notched card on a 64 grid: 8-unit cut, hairline at 10% white, a brighter top edge, a blue glow behind the glyph.</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <span class="lbl">Glyph</span>
    <span style="font-size: 13px; line-height: 1.5; color: #9a9aa2;">One front-facing package per service inside the 12 to 52 safe area. Pins or memory are the signature; a soft blue drop shadow is the depth.</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <span class="lbl">Blue ramp</span>
    <div style="display: flex; flex-direction: column; gap: 6px;">${swatch("#8fd0ff", "light")}${swatch("#0095ff", "blue")}${swatch("#1d4ed8", "deep")}</div>
  </div>
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <span class="lbl">Accent</span>
    <div style="display: flex; flex-direction: column; gap: 6px;">${swatch("#f5b324", "amber, one LED")}${swatch("#fafaf4", "ink, the lit core")}</div>
  </div>
</div>`;

/** Both icons side by side, so the family reads as one. */
const familyInner = `
${symbols(Object.keys(ICONS))}
<div style="display: flex; flex-direction: column; gap: 10px;">
  <span class="lbl">Service icons · the family so far</span>
  <h1 style="margin: 0; font-size: 30px; font-weight: 500; line-height: 1; letter-spacing: -0.02em;">Side by side</h1>
</div>
<div style="display: flex; gap: 40px; align-items: flex-end;">
  ${Object.keys(ICONS)
    .map(
      (k) =>
        `<div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">${ico(k, 128)}<span class="lbl" style="color: #9a9aa2;">${ICONS[k].name}</span></div>`
    )
    .join("")}
</div>
<div style="display: flex; gap: 12px; align-items: center;">
  ${Object.keys(ICONS).map((k) => ico(k, 32)).join("")}
  <span style="width: 16px;"></span>
  ${Object.keys(ICONS).map((k) => ico(k, 20)).join("")}
</div>`;

const out = (path, text) => {
  writeFileSync(path, text);
  console.log(`wrote ${path.replace(repo, "").replace(/^[\\/]/, "")}`);
};

mkdirSync(here, { recursive: true });
for (const k of Object.keys(ICONS)) out(join(here, `${k}.svg`), svgFile(k));
mkdirSync(join(repo, "components/icons"), { recursive: true });
out(join(repo, "components/icons/service-icons.tsx"), componentFile());
out(
  join(here, "Main.dc.html"),
  dc("GPU Pods", 1040, 700, sheet("gpu-pods", "01", "An accelerator module: memory stacks either side of a lit die, fingers along the edge, and a second module behind it. The pair is the pod.", "B300, H200 and H100 by the hour."))
);
out(
  join(here, "Compute.dc.html"),
  dc("Compute", 1040, 700, sheet("compute", "02", "A processor package, pins on all four sides, a lit core. Shared, VDS and bare metal all sit under it.", "Shared, VDS and bare metal servers."))
);
out(join(here, "Family.dc.html"), dc("Service icons, side by side", 520, 420, familyInner));
out(
  join(here, "canvas.json"),
  JSON.stringify(
    {
      artboards: [
        { file: "Main.dc.html", x: 0, y: 0, w: 1040, h: 700, title: "GPU Pods" },
        { file: "Compute.dc.html", x: 0, y: 860, w: 1040, h: 700, title: "Compute" },
        { file: "Family.dc.html", x: 1160, y: 0, w: 520, h: 420, title: "Side by side" },
      ],
      annotations: [
        {
          id: "how-siblings",
          x: 1160,
          y: 560,
          w: 300,
          text: "How the family stays related.\nSame plate, same blue ramp, same lit core, one amber LED each; only the package changes. Next up, in the same language: a rack face for bare metal, a die with brackets for the inference API, a stacked platter for storage.",
        },
      ],
      launch: { view: "canvas" },
    },
    null,
    2
  ) + "\n"
);
out(
  join(here, "preview.html"),
  `<!doctype html><html><head><meta charset="utf-8">${FONTS.replace(/&amp;/g, "&")}<style>${STYLE} .row{display:flex;align-items:flex-end;gap:24px;padding:24px} .cream{background:#f3f2ea}</style></head><body>${symbols(Object.keys(ICONS))}${Object.keys(ICONS)
    .map((k) => `<div class="row">${[192, 96, 64, 48, 32, 24, 16].map((s) => ico(k, s)).join("")}</div><div class="row cream">${[64, 32].map((s) => ico(k, s)).join("")}</div>`)
    .join("")}</body></html>\n`
);
