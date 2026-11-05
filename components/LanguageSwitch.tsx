"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { alternatePath, t, type Locale } from "@/lib/i18n";

/** HU · EN váltó — a kiválasztott nyelv primary (türkiz) színű, a másik ugyanarra az oldalra visz a másik nyelven. */
export default function LanguageSwitch({ locale, className = "" }: { locale: Locale; className?: string }) {
  const pathname = usePathname();
  const href = alternatePath(pathname, locale);
  const item = (code: Locale, label: string) =>
    code === locale ? (
      <span aria-current="true" lang={code} className="text-[#40CFD5]">{label}</span>
    ) : (
      <Link href={href} lang={code} hrefLang={code} title={t(code).langName} className="text-white/60 transition-colors hover:text-white">
        {label}
      </Link>
    );
  return (
    <span role="group" aria-label={t(locale).switchLabel} className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.2em] ${className}`}>
      {item("hu", "HU")}
      <span aria-hidden="true" className="text-white/40">·</span>
      {item("en", "EN")}
    </span>
  );
}
