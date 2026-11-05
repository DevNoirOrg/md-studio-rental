"use client";

import { createContext, useContext } from "react";
import { t, type Dictionary, type Locale } from "@/lib/i18n";

/** Az oldal nyelve a kliens komponenseknek (a foglaló, a termek, a fejléc). */
const LocaleContext = createContext<Locale>("hu");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): { locale: Locale; d: Dictionary } {
  const locale = useContext(LocaleContext);
  return { locale, d: t(locale) };
}
