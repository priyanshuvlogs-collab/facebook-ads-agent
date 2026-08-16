import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yta/shared"],
  eslint: {
    // Linting runs separately; keep builds deterministic.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
