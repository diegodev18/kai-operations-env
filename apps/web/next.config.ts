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
      {
        source: "/api/agents-testing/:path*",
        destination: `${API_INTERNAL_URL}/api/agents-testing/:path*`,
      },
      {
        source: "/api/prompt/:path*",
        destination: `${API_INTERNAL_URL}/api/prompt/:path*`,
      },
      {
        source: "/api/organization/:path*",
        destination: `${API_INTERNAL_URL}/api/organization/:path*`,
      },
    ];
  },
};

export default nextConfig;
