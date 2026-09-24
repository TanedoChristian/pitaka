import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // quick tunnels change hostname every restart; * matches one label
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.trycloudflare.com"],
    },
  },
};

export default nextConfig;
