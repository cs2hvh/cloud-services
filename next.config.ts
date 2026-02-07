import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable compression to prevent SSE buffering in dev mode
  compress: false,
  
  // Exclude email rendering packages from server bundle (Next.js 15+)
  serverExternalPackages: ['@react-email/components', '@react-email/render'],
  
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Completely exclude @react-email from webpack analysis
      config.externals = [...(config.externals || []), '@react-email/components', '@react-email/render'];
    }
    return config;
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
    ],
  },
};

export default nextConfig;
