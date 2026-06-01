import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is required");
}
const supabaseWs = supabaseUrl.replace("https://", "wss://");

// Inference gateway origin — the dashboard's Playground page fetches against
// this from the browser, so it must be in connect-src. Override via env when
// the gateway moves to ahurasense.com (see docs/inference/migration-ahurasense.md).
const inferenceApiOrigin =
  process.env.NEXT_PUBLIC_INFERENCE_API_ORIGIN ?? "https://api.cs2hvh.com";

// Content-Security-Policy: restrict script sources and data exfiltration targets.
// 'unsafe-inline' is required because Next.js injects inline scripts for hydration.
// connect-src is the key defense: even if XSS runs, stolen cookies cannot be sent
// to any domain not listed here.
const cspDirectives = [
  "default-src 'self'",
  // Next.js needs 'unsafe-inline' for inline scripts; 'unsafe-eval' only in dev for HMR/source maps
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  // Block inline event-handler attributes (onclick, onerror, etc.) even when inline scripts are allowed.
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://samatva.blr1.cdn.digitaloceanspaces.com https://flagsapi.com https://cdn.jsdelivr.net https://flagcdn.com",
  "font-src 'self'",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} ${inferenceApiOrigin}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];
const contentSecurityPolicy = cspDirectives.join("; ");

const nextConfig: NextConfig = {
  // Produces a self-contained build under .next/standalone for Docker
  output: 'standalone',
  // Keep native Node.js modules out of the webpack bundle
  serverExternalPackages: ["ssh2", "ioredis", "bullmq"],

  // Disable compression to prevent SSE buffering in dev mode
  compress: false,

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "samatva.blr1.cdn.digitaloceanspaces.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "flagsapi.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "flagcdn.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
