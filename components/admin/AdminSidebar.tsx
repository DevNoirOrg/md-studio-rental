"use client";

/* eslint-disable @next/next/no-img-element -- logó */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAdmin } from "@/app/admin/actions";
import { adminNav } from "@/lib/admin-nav";
import { withBase } from "@/lib/base-path";

/** Admin menü: asztalon bal oldali sáv, telefonon felső, vízszintesen görgethető sor. */
function NavLinks() {
  const path = usePathname() ?? "/admin";
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  return adminNav.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={active(item.href) ? "page" : undefined}
      className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-[13px] font-bold transition-colors ${
        active(item.href) ? "bg-white text-ink" : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {item.label}
    </Link>
  ));
}

export default function AdminSidebar({ email }: { email: string }) {
  return (
    <aside className="bg-ink text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 md:block md:px-6 md:pt-8">
        <Link href="/admin" className="flex items-center gap-3">
          <img src={withBase("/brand/logo-md-black-trim.png")} alt="MD Dance School" className="h-11 w-auto invert" />
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-md-cyan">
            Admin
          </span>
        </Link>
        <a
          href={withBase("/")}
          target="_blank"
          rel="noopener"
          className="text-[10px] font-extrabold uppercase tracking-widest text-white/50 hover:text-white md:mt-6 md:inline-block"
        >
          Oldal megnyitása ↗
        </a>
      </div>
      <p className="hidden px-6 pt-2 text-[10px] font-extrabold uppercase tracking-widest text-white/40 md:block">Stúdió bérlés</p>

      <nav className="mt-4 flex gap-1 overflow-x-auto px-3 pb-3 md:mt-4 md:flex-1 md:flex-col md:overflow-y-auto md:px-3 md:pb-6">
        <NavLinks />
      </nav>

      <div className="hidden border-t border-white/10 px-6 py-5 text-xs md:block">
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-white/40">Bejelentkezve</p>
        <span className="block truncate text-white/70">{email}</span>
        <form action={logoutAdmin} className="mt-3">
          <button type="submit" className="text-[11px] font-extrabold uppercase tracking-widest text-md-cyan hover:text-white">
            Kijelentkezés
          </button>
        </form>
      </div>
      <form action={logoutAdmin} className="px-5 pb-4 md:hidden">
        <button type="submit" className="text-[10px] font-extrabold uppercase tracking-widest text-md-cyan">
          Kijelentkezés
        </button>
      </form>
    </aside>
  );
}
