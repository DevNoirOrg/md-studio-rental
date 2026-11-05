import type { Metadata } from "next";
import { canonicalUrl, CANONICAL_ORIGIN } from "@/lib/base-path";
import { t } from "@/lib/i18n";
import RootHtml from "../root-html";

// Az admin saját gyökér-layoutja (mindig magyar) — a nyelvenként külön layoutok miatt kell.
export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  alternates: { canonical: canonicalUrl("/") },
  title: t("hu").meta.title,
  description: t("hu").meta.description,
};

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootHtml lang="hu">{children}</RootHtml>;
}
