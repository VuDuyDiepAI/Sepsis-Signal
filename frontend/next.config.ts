import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permit both loopback names for browser preview and Playwright in development.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Production E2E reproduced React #418 with PPR/partial prefetch enabled and
  // passes with them disabled. The internal mismatch cause is not yet isolated.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
