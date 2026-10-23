import Link from "next/link";
import { cookies } from "next/headers";
import { LockKeyhole, LogOut } from "lucide-react";
import { adminCookie, validAdminSession } from "@/lib/admin-auth";
import LoginForm from "./LoginForm";
import { logoutAdmin } from "./actions";
import AdminCalendar from "./AdminCalendar";

export const metadata = {
  title: "Admin | MD Dance School",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const session = (await cookies()).get(adminCookie)?.value;
  let authenticated = false;
  let unavailable = false;
  try {
    authenticated = validAdminSession(session);
  } catch (caught) {
    console.error("Admin session verification failed.", { message: (caught as Error).message });
    unavailable = true;
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f7f7f7] px-4 py-12">
      <Link href="/" className="mb-8 text-sm font-extrabold uppercase tracking-[0.25em] text-black">
        MD Dance School · Stúdió bérlés
      </Link>
      <section aria-labelledby="admin-heading"
        className={`w-full ${authenticated ? "max-w-7xl" : "max-w-md"} rounded-3xl border-t-4 border-[#40CFD5] bg-white p-6 shadow-[0_10px_36px_rgba(0,0,0,0.09)] sm:p-10`}>
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-black text-[#40CFD5]">
          <LockKeyhole size={30} aria-hidden="true" />
        </div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#087c81]">Adminisztráció</p>
        <div className="flex items-center justify-between gap-3">
          <h1 id="admin-heading" className={`section-title ${authenticated ? "text-3xl" : "text-4xl"} text-black sm:text-5xl`}>
            {authenticated ? "Üdvözlünk!" : "Bejelentkezés"}
          </h1>
          {authenticated && (
            <form action={logoutAdmin} className="shrink-0">
              <button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-3 text-xs font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300 sm:px-5 sm:text-sm">
                <LogOut size={18} aria-hidden="true" className="hidden sm:block" /> Kijelentkezés
              </button>
            </form>
          )}
        </div>
        {unavailable ? (
          <p role="alert" className="mt-6 text-sm text-red-800">A bejelentkezés jelenleg nem elérhető. Ellenőrizd a szerver adminbeállításait.</p>
        ) : authenticated ? (
          <>
            <p className="mt-5 text-sm leading-relaxed text-gray-600">
              Sikeresen bejelentkeztél az admin felületre.
            </p>
            <AdminCalendar />
          </>
        ) : (
          <>
            <p className="mt-5 text-sm leading-relaxed text-gray-600">A folytatáshoz add meg az admin belépési adataidat.</p>
            <LoginForm />
          </>
        )}
      </section>
      <Link href="/" className="mt-6 text-sm font-semibold text-gray-600 underline hover:text-black">Vissza a weboldalra</Link>
    </main>
  );
}
