import type { Metadata } from "next";
import { canonicalUrl, CANONICAL_ORIGIN } from "@/lib/base-path";
import { t } from "@/lib/i18n";
import RootHtml from "../root-html";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  alternates: { canonical: canonicalUrl("/en") },
  title: t("en").meta.title,
  description: t("en").meta.description,
};

export default function EnglishRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootHtml lang="en">{children}</RootHtml>;
}
