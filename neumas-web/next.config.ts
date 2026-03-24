import type { NextConfig } from "next";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://neumas-production.up.railway.app";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disable double-invoke in dev; remove once re-render loop is confirmed fixed
  async rewrites() {
    return [
      {
        // Proxy /api/* → Railway backend /api/*
        // Keeps backend URL out of browser network tab in production
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
