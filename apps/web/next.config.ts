import type { NextConfig } from "next";

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${API_INTERNAL_URL}/api/auth/:path*`,
      },
      {
        source: "/api/agents/:path*",
        destination: `${API_INTERNAL_URL}/api/agents/:path*`,
      },
    ];
  },
};

export default nextConfig;
