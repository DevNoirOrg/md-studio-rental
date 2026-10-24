import localFont from "next/font/local";

/*
  Saját domainről kiszolgált betűk (korábban next/font/google) — így a build
  hálózat nélkül is lefut, és nem kell külső kérés a látogatónak.
  - Inter (változó vastagságú, 100–900) — alap szöveg
  - Anton 400 — szekciócímek (.section-title)
  Mindkettő latin + latin-ext (ő, ű) karakterkészlettel; részletek: app/fonts/README.md
*/

export const inter = localFont({
  src: [{ path: "./fonts/Inter-Variable.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
});

export const anton = localFont({
  src: [{ path: "./fonts/Anton-Regular.woff2", weight: "400", style: "normal" }],
  variable: "--font-anton",
  display: "swap",
});

export const fontVariables = `${inter.variable} ${anton.variable}`;
