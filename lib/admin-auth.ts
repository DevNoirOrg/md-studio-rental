import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { bookingStore } from "./booking-store.ts";

/*
  Admin belépés e-mailes, egyszer használatos kóddal (Supabase Auth OTP) —
  ugyanúgy, mint az MD Dance School / MD Dance Company / Under Cover adminban.
  Admin = bejelentkezett Supabase felhasználó, AKINEK az e-mail címe szerepel a
  rental.admins táblában (a Supabase projekt közös, a belépés önmagában nem elég).
*/

export type Admin = { email: string };
type CookieList = { name: string; value: string }[];

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error("Supabase is not configured.");
  return url;
}

export function supabaseAuthEnv() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Admin authentication is not configured (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");
  return { url: supabaseUrl(), key };
}

/** Teljes jogú kliens — csak az admin felhasználó létrehozásához (szerveren). */
export function supabaseServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase is not configured.");
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const rows = await bookingStore<{ email: string }[]>(
    `admins?select=email&email=eq.${encodeURIComponent(email.toLowerCase())}`,
  );
  return rows.length > 0;
}

/** A sütikben lévő Supabase munkamenetből az admin (vagy null). Csak olvas, sütit nem ír. */
export async function adminFromCookies(cookieList: CookieList): Promise<Admin | null> {
  const { url, key } = supabaseAuthEnv();
  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => cookieList, setAll: () => {} },
  });
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return null;
  return (await isAdminEmail(email)) ? { email } : null;
}

/** Route Handlerekhez (a kérés sütijeiből). */
export function adminFromRequest(request: { cookies: { getAll(): CookieList } }): Promise<Admin | null> {
  return adminFromCookies(request.cookies.getAll());
}
