import type { NextConfig } from "next";

// Ugyanaz a felépítés, mint az Under Cover oldalon: Turbopack + Tailwind 4 (PostCSS nélkül).
const nextConfig: NextConfig = {
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
