import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted in Docker: emits .next/standalone with a minimal server bundle.
  output: "standalone",
};

export default nextConfig;
