import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

/**
 * The link-preview image for docs pages.
 *
 * GET /docs/og?k=<kicker>&t=<title>&s=<summary>
 *
 * Until this existed every docs URL unfurled as the site's home card: the
 * platform headline, the platform blurb and the isometric server picture,
 * which told a reader nothing about the page they were sent. Each docs page
 * now asks for its own card through components/docs/metadata.ts.
 *
 * Text comes from the query string, so it is clamped and never trusted for
 * anything but drawing. 1200x630 is what every unfurler expects.
 */

export const runtime = "edge";

const clamp = (v: string | null, max: number, fallback: string) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return (s || fallback).slice(0, max);
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const kicker = clamp(q.get("k"), 40, "Documentation");
  const title = clamp(q.get("t"), 70, "AhuraSense Docs");
  const summary = clamp(q.get("s"), 150, "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(160deg, #141419 0%, #0a0a0d 100%)",
          color: "#fafaf4",
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
          position: "relative",
        }}
      >
        {/* The notch the site cuts into its cards, top-left and bottom-right. */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, borderTop: "28px solid #0e0f0f", borderRight: "28px solid transparent" }} />
        <div style={{ position: "absolute", bottom: 0, right: 0, width: 0, height: 0, borderBottom: "28px solid #0e0f0f", borderLeft: "28px solid transparent" }} />
        {/* A blue glow off the top-right, like the hero. */}
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -160,
            width: 620,
            height: 620,
            borderRadius: 999,
            background: "radial-gradient(closest-side, rgba(0,149,255,0.28), rgba(0,149,255,0))",
          }}
        />
        {/* The blue hairline along the top edge. */}
        <div style={{ position: "absolute", top: 0, left: 28, right: 0, height: 3, background: "#0095ff" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            <span>Ahura</span>
            <span style={{ color: "#0095ff" }}>Sense</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#8a8a94",
              fontFamily: "ui-monospace, Menlo, Consolas, monospace",
            }}
          >
            {kicker}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 1000 }}>
          <div style={{ display: "flex", fontSize: title.length > 40 ? 60 : 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5 }}>
            {title}
          </div>
          {summary ? (
            <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: "#b4b4bc" }}>{summary}</div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#8a8a94",
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          }}
        >
          <span>ahurasense.com/docs</span>
          <span style={{ color: "#7fc7ff" }}>https://api.ahurasense.com/v1</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
