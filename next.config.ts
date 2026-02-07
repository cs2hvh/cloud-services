import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable compression to prevent SSE buffering in dev mode
  compress: false,
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
    ],
  },
};

export default nextConfig;
