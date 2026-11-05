import type { Metadata } from "next";
import { canonicalUrl, CANONICAL_ORIGIN } from "@/lib/base-path";
import { t } from "@/lib/i18n";
import RootHtml from "../root-html";

export const metadata: Metadata = {
  // A foglaló a mddancestudio.com-on is elérhető, de az elsődleges (kanonikus) cím a
  // hiphoptanciskola.com/studio-berles — a Google ezt indexeli (lib/base-path.ts).
  metadataBase: new URL(CANONICAL_ORIGIN),
  alternates: { canonical: canonicalUrl("/") },
  title: t("hu").meta.title,
  description: t("hu").meta.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootHtml lang="hu">{children}</RootHtml>;
}
