import { NextResponse } from 'next/server';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="36" viewBox="0 0 200 36">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c3aed"/>
      <stop offset="100%" style="stop-color:#4f46e5"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.15"/>
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="200" height="36" rx="6" fill="url(#bg)"/>
  <!-- Shine overlay -->
  <rect width="200" height="18" rx="6" fill="url(#shine)"/>
  <!-- Rocket icon -->
  <text x="16" y="24" font-size="16" font-family="system-ui, sans-serif">🚀</text>
  <!-- Text -->
  <text x="40" y="23" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="600" fill="#ffffff" letter-spacing="0.2">Deploy on AhuraSense</text>
</svg>`;

export async function GET() {
  return new NextResponse(SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
