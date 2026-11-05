import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SCHOOL_URL } from "@/lib/site";
import { withBase } from "@/lib/base-path";
import { homePath, t, type Locale } from "@/lib/i18n";
import LanguageSwitch from "./LanguageSwitch";

/*
  A stúdiófoglaló oldal saját, egyszerű fejléce: MD logó, „Stúdió bérlés” felirat,
  HU/EN nyelvváltó és egy link vissza az MD Dance School oldalra (angolul az angol
  főoldalra). Ugyanaz a halványuló, enyhén elmosott háttér, mint a tánciskola menüjénél.
*/
export default function SiteHeader({ locale = "hu" }: { locale?: Locale }) {
  const d = t(locale);
  const schoolHref = locale === "en" ? `${SCHOOL_URL}/en` : SCHOOL_URL;
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[104px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/80 to-transparent backdrop-blur-[6px] h-[160px]"
        style={{
          maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, #000 55%, transparent 100%)",
        }}
      />
      <div className="mx-auto flex h-full max-w-[1366px] items-center gap-3 px-5 sm:gap-4 sm:px-8">
        <Link
          href={homePath(locale)}
          className="flex shrink-0 items-center gap-3"
          aria-label={d.homeAria}
        >
          <Image
            src={withBase("/brand/logo-md-black-trim.png")}
            alt="MD Dance School"
            width={273}
            height={219}
            priority
            className="h-14 w-auto sm:h-20"
          />
          <span className="hidden border-l-2 border-black/15 pl-3 text-xs font-extrabold uppercase tracking-[0.25em] text-black sm:block">
            {d.studioRental}
          </span>
        </Link>
        {/* A nyelvváltó és a vissza-gomb azonos magasságú (h-10) pirula */}
        <span className="ml-auto flex h-10 items-center rounded-full bg-black/80 px-4 backdrop-blur-sm">
          <LanguageSwitch locale={locale} />
        </span>
        <a
          href={schoolHref}
          className="flex h-10 items-center gap-2 rounded-full bg-black/80 px-4 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-[#40CFD5] hover:text-black sm:text-sm"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{d.backToSchool}</span>
          <span className="sm:hidden">MD Dance School</span>
        </a>
      </div>
    </header>
  );
}
