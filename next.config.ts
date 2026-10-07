import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Self-hosted in Docker: emits .next/standalone with a minimal server bundle.
  output: "standalone",
};

export default withNextIntl(nextConfig);
