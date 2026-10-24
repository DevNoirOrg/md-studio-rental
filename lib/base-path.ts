/*
  A bérlés app a /studio-berles útvonalon fut (next.config.ts → basePath), így két címen is elérhető:
    - https://www.hiphoptanciskola.com/studio-berles  — az iskola oldala ide továbbít (multi-zones),
      ez a KANONIKUS (elsődleges) cím, mert erre van a régi, jól rangsorolt SEO;
    - https://mddancestudio.com                         — ugyanez a foglaló, saját domainen.
  A next/link és a router magától kezeli a basePath-t; a fetch, a sima <a>, a képek és a CSS url()
  viszont nem — ezekhez kell a withBase().
*/
export const BASE_PATH = "/studio-berles";

/** "/api/x" → "/studio-berles/api/x"; "/" → "/studio-berles". */
export function withBase(path: string): string {
  return path === "/" ? BASE_PATH : `${BASE_PATH}${path}`;
}

/** A kanonikus (elsődleges) domain — a Google ezt indexeli. */
export const CANONICAL_ORIGIN = (process.env.NEXT_PUBLIC_CANONICAL_ORIGIN || "https://www.hiphoptanciskola.com").replace(/\/+$/, "");

/** Kanonikus teljes cím egy oldalhoz, pl. canonicalUrl("/adatkezeles"). */
export const canonicalUrl = (path = "/") => `${CANONICAL_ORIGIN}${withBase(path)}`;
