import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Self-hosted in Docker: emits .next/standalone with a minimal server bundle.
  output: "standalone",
  // The agent SDK spawns a bundled CLI subprocess — keep it external so its
  // files resolve from node_modules at runtime instead of being bundled.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default withNextIntl(nextConfig);
