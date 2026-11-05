import { fontVariables } from "./fonts";
import "./globals.css";

/*
  Közös <html>/<body> váz. Több gyökér-layout van, hogy az oldal nyelve
  (<html lang>) a szerveren is helyes legyen:
    - app/(hu)/layout.tsx — a magyar foglaló, adatkezelés, döntési oldal
    - app/en/layout.tsx   — az angol foglaló és adatkezelés (/studio-berles/en)
    - app/admin/layout.tsx — az admin (magyar)
*/
export default function RootHtml({ lang, children }: { lang: "hu" | "en"; children: React.ReactNode }) {
  return (
    <html lang={lang} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
