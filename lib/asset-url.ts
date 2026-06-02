// Resolve a static `public/` asset path to its serving URL.
//
// When NEXT_PUBLIC_ASSET_BASE_URL is set (e.g. the R2 CDN base
// https://ahurasense.cs2hvh.com), public assets are served from there instead
// of bundled into the app image. When it's unset, paths fall through unchanged
// so they serve from /public — so this is always safe and reversible (flip the
// env, rebuild). next/image can still optimize the CDN-sourced images because
// the host is allowlisted in next.config images.remotePatterns.
//
//   assetUrl("/images/hero.png")
//     base set   -> "https://ahurasense.cs2hvh.com/images/hero.png"
//     base unset -> "/images/hero.png"
//
// Absolute URLs (http(s)://, data:, blob:) and already-CDN'd paths pass through.

const BASE = (process.env.NEXT_PUBLIC_ASSET_BASE_URL || "").replace(/\/+$/, "");

export function assetUrl(p: string): string {
  if (!p) return p;
  if (/^(https?:)?\/\//i.test(p) || p.startsWith("data:") || p.startsWith("blob:")) {
    return p;
  }
  if (!BASE) return p;
  const path = p.startsWith("/") ? p : `/${p}`;
  // Encode literal spaces only. Do NOT use encodeURI(): some refs are already
  // percent-encoded (e.g. "/os/Windows%2011.png"), and encodeURI would re-encode
  // the "%" -> "%25" ("%2011" -> "%252011"), producing a 404. The browser /
  // next-image encode any remaining characters when fetching.
  return BASE + path.replace(/ /g, "%20");
}
