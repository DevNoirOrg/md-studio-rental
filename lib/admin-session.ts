import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminFromCookies, type Admin } from "./admin-auth.ts";

/*
  Az admin oldalak és műveletek jogosultság-ellenőrzése (a Supabase munkamenet
  sütijeiből; admin = a rental.admins táblában szereplő e-mail cím).
*/

/** A bejelentkezett admin (kérésenként egyszer ellenőrizve), vagy null. */
export const currentAdmin = cache(async (): Promise<Admin | null> => {
  // a cookies() a try-on kívül: a Next.js saját (dinamikus renderelési) jelzését nem nyeljük el
  const cookieList = (await cookies()).getAll();
  try {
    return await adminFromCookies(cookieList);
  } catch (caught) {
    console.error("Admin session verification failed.", { message: (caught as Error).message });
    return null;
  }
});

/** Oldalakhoz: ha nincs belépve, a belépő oldalra irányít. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/belepes");
  return admin;
}

/** Server actionökhöz: ha nincs belépve, hibát dob. */
export async function assertAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) throw new Error("A munkamenet lejárt. Jelentkezz be újra.");
  return admin;
}
