import type { NextConfig } from "next";

/*
  A bérlés app a /studio-berles útvonalon fut (basePath), így:
    - az iskola oldala (hiphoptanciskola.com) a /studio-berles alatti kéréseket ide továbbítja
      (Next.js multi-zones, lásd md-dance-school/next.config.ts) — a régi, jól rangsorolt cím megmarad;
    - a saját domainen (mddancestudio.com) a főoldal a /studio-berles oldalra visz (lenti redirect),
      így ott is ugyanazon az útvonalon fut minden.
  Turbopack + Tailwind 4 (PostCSS nélkül), mint a többi MD oldalon.
*/
const nextConfig: NextConfig = {
  basePath: "/studio-berles",
  async redirects() {
    return [{ source: "/", destination: "/studio-berles", basePath: false, permanent: true }];
  },
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
