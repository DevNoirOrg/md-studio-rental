/* eslint-disable @next/next/no-img-element -- logó */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-session";
import { withBase } from "@/lib/base-path";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Belépés | Stúdió bérlés admin",
  robots: { index: false, follow: false },
};

const LINK_ERRORS: Record<string, string> = {
  link: "A belépési link lejárt vagy hibás. Kérj új kódot, és a levélben lévő linket ugyanebben a böngészőben nyisd meg.",
  jog: "Ehhez a címhez nincs admin jogosultság.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ hiba?: string }> }) {
  if (await currentAdmin()) redirect("/admin");
  const { hiba } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-5 py-16">
      <div className="w-full max-w-md">
        <img src={withBase("/brand/logo-md-black-trim.png")} alt="MD Dance School" className="mx-auto mb-8 h-24 w-auto invert" />
        <div className="rounded-[2rem] bg-white p-8 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] md:p-10">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-md-teal">Stúdió bérlés · Admin</p>
          <h1 className="mt-1 text-3xl font-black text-ink">Belépés</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Add meg az e-mail címed, és küldünk egy egyszer használatos belépési kódot.
          </p>
          <LoginForm linkError={hiba ? LINK_ERRORS[hiba] : undefined} />
        </div>
        <a href={withBase("/")} className="mt-6 block text-center text-sm font-semibold text-white/60 underline hover:text-white">
          Vissza a weboldalra
        </a>
      </div>
    </main>
  );
}
