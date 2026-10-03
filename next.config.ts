import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  webpack(config) {
    // C also targets Node ESM, so its TS source uses emitted .js imports.
    // Resolve those imports to source files when bundled by Next.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
