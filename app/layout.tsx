import type { Metadata } from "next";
import { canonicalUrl, CANONICAL_ORIGIN } from "@/lib/base-path";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // A foglaló a mddancestudio.com-on is elérhető, de az elsődleges (kanonikus) cím a
  // hiphoptanciskola.com/studio-berles — a Google ezt indexeli (lib/base-path.ts).
  metadataBase: new URL(CANONICAL_ORIGIN),
  alternates: { canonical: canonicalUrl("/") },
  title: "Stúdió bérlés – MD Dance School",
  description:
    "Bérelj táncstúdiót Budapesten: négy felszerelt terem az Astoria és az Opera közelében, online időpontfoglalással.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
