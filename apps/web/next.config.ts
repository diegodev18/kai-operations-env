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
      /** Incluye p. ej. `GET /api/agents/:agentId/whatsapp-integration-status` (integración WhatsApp por agente). */
      {
        source: "/api/agents/:path*",
        destination: `${API_INTERNAL_URL}/api/agents/:path*`,
      },
      {
        source: "/api/agents-testing/:path*",
        destination: `${API_INTERNAL_URL}/api/agents-testing/:path*`,
      },
      {
        source: "/api/agent_configurations/:path*",
        destination: `${API_INTERNAL_URL}/api/agent_configurations/:path*`,
      },
      {
        source: "/api/prompt/:path*",
        destination: `${API_INTERNAL_URL}/api/prompt/:path*`,
      },
      {
        source: "/api/organization/:path*",
        destination: `${API_INTERNAL_URL}/api/organization/:path*`,
      },
      {
        source: "/api/database/:path*",
        destination: `${API_INTERNAL_URL}/api/database/:path*`,
      },
      {
        source: "/api/dynamic-table-schemas/:path*",
        destination: `${API_INTERNAL_URL}/api/dynamic-table-schemas/:path*`,
      },
      {
        source: "/api/blog/:path*",
        destination: `${API_INTERNAL_URL}/api/blog/:path*`,
      },
      {
        source: "/api/favorites/:path*",
        destination: `${API_INTERNAL_URL}/api/favorites/:path*`,
      },
      {
        source: "/api/builder/:path*",
        destination: `${API_INTERNAL_URL}/api/builder/:path*`,
      },
      {
        source: "/api/changelogs/:path*",
        destination: `${API_INTERNAL_URL}/api/changelogs/:path*`,
      },
      {
        source: "/api/crm/:path*",
        destination: `${API_INTERNAL_URL}/api/crm/:path*`,
      },
    ];
  },
};

export default nextConfig;
