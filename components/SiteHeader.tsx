import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SCHOOL_URL } from "@/lib/site";

/*
  A stúdiófoglaló oldal saját, egyszerű fejléce: MD logó, „Stúdió bérlés” felirat,
  és egy link vissza az MD Dance School oldalra. Ugyanaz a halványuló, enyhén
  elmosott háttér, mint a tánciskola menüjénél.
*/
export default function SiteHeader() {
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
      <div className="mx-auto flex h-full max-w-[1366px] items-center gap-4 px-5 sm:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3"
          aria-label="Stúdió bérlés – kezdőoldal"
        >
          <Image
            src="/brand/logo-md-black-trim.png"
            alt="MD Dance School"
            width={273}
            height={219}
            priority
            className="h-14 w-auto sm:h-20"
          />
          <span className="hidden border-l-2 border-black/15 pl-3 text-xs font-extrabold uppercase tracking-[0.25em] text-black sm:block">
            Stúdió bérlés
          </span>
        </Link>
        <a
          href={SCHOOL_URL}
          className="ml-auto flex items-center gap-2 rounded-full bg-black/80 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-[#40CFD5] hover:text-black sm:text-sm"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Vissza az MD Dance Schoolhoz</span>
          <span className="sm:hidden">MD Dance School</span>
        </a>
      </div>
    </header>
  );
}
