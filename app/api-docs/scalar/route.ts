import { NextResponse } from "next/server";

const SCALAR_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";

export async function GET() {
  try {
    const upstream = await fetch(SCALAR_SCRIPT_URL, {
      headers: {
        Accept: "application/javascript, text/javascript, */*",
      },
      cache: "force-cache",
    });

    if (!upstream.ok) {
      return new NextResponse("Failed to load Scalar script", {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const body = await upstream.text();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("Failed to load Scalar script", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}