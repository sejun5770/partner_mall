import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained build under .next/standalone for Docker deployments.
  output: "standalone",
};

export default nextConfig;
