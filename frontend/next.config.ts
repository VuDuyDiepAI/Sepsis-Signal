import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permit both loopback names for browser preview and Playwright in development.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Authenticated clinical pages resolve session/route state at request time.
  // Avoid partial prerender/prefetch hydration races in production.
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
