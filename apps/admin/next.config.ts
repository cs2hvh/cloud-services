import type { NextConfig } from "next";
import path from "path";
import { config as loadEnv } from "dotenv";

// The admin app lives in apps/admin but shares the repo root's environment.
// Next.js only auto-loads .env files from the project directory, so pull the
// root .env files in explicitly before anything reads process.env. dotenv
// never overwrites variables that are already set, so load the most specific
// file first.
loadEnv({ path: path.resolve(__dirname, "../../.env.local") });
loadEnv({ path: path.resolve(__dirname, "../../.env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is required");
}
const supabaseWs = supabaseUrl.replace("https://", "wss://");

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  // Admin views render user avatars hosted by arbitrary identity providers
  // (Google, GitHub, ...), so images are allowed from any https origin.
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];
const contentSecurityPolicy = cspDirectives.join("; ");

const nextConfig: NextConfig = {
  // Self-contained build under .next/standalone for Docker
  output: "standalone",
  // Shared lib/ pulls these native/Node-heavy packages; keep them out of the
  // bundle exactly like the main app does.
  serverExternalPackages: ["ssh2", "ioredis", "bullmq"],

  experimental: {
    // The admin app imports shared code from the repo root (lib/, components/)
    // which sits outside this project directory.
    externalDir: true,
    optimizePackageImports: [
      "lucide-react",
      "@tabler/icons-react",
      "react-icons",
      "hugeicons-react",
      "date-fns",
      "recharts",
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          // The admin panel must never be indexed, wherever it is hosted.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
