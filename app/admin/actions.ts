"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminEmail, supabaseServiceClient } from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { withBase } from "@/lib/base-path";

/*
  Admin belépés egyszer használatos e-mailes kóddal (Supabase Auth OTP).
  Kódot CSAK a rental.admins táblában szereplő címek kapnak; másoknak ugyanazt
  az üzenetet mutatjuk, hogy ne lehessen kitalálgatni az admin címeket.
*/

export type LoginState = { step: "email" | "code"; email: string; message?: string; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Létrehozza a Supabase Auth felhasználót, ha még nincs (a "már létezik" hibát elnyeljük). */
async function ensureAuthUser(email: string) {
  const { error } = await supabaseServiceClient().auth.admin.createUser({ email, email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) {
    console.error("[login] felhasználó létrehozása sikertelen:", error.message);
  }
}

const unavailable = (email: string): LoginState => ({
  step: "email",
  email,
  error: "A bejelentkezés jelenleg nem elérhető. Ellenőrizd a szerver adminbeállításait.",
});

async function requestLoginCode(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) return { step: "email", email, error: "Adj meg egy érvényes e-mail címet." };
  try {
    if (await isAdminEmail(email)) {
      await ensureAuthUser(email);
      const supabase = await supabaseServer();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${await requestOrigin()}${withBase("/admin/auth/callback")}` },
      });
      if (error) {
        console.error("[login] OTP küldési hiba:", error.message);
        const tooMany = error.status === 429 || /rate|seconds/i.test(error.message);
        return {
          step: "email",
          email,
          error: tooMany
            ? "Túl sok kódot kértél rövid idő alatt. Várj egy percet, és próbáld újra."
            : "Nem sikerült elküldeni a kódot. Próbáld újra pár perc múlva.",
        };
      }
    }
  } catch (caught) {
    console.error("Admin login failed.", { message: (caught as Error).message });
    return unavailable(email);
  }
  return {
    step: "code",
    email,
    message:
      "Ha ez a cím admin jogosultságú, elküldtük rá a belépési kódot (vagy linket). Írd be a kódot, vagy kattints a levélben lévő linkre ugyanebben a böngészőben.",
  };
}

async function verifyLoginCode(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!EMAIL_RE.test(email)) return { step: "email", email: "", error: "Kezdd újra az e-mail cím megadásával." };
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "A kód 6 számjegyből áll." };
  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) return { step: "code", email, error: "Hibás vagy lejárt kód. Kérj újat, ha kell." };
    if (!(await isAdminEmail(email))) {
      await supabase.auth.signOut();
      return { step: "email", email: "", error: "Ehhez a címhez nincs admin jogosultság." };
    }
  } catch (caught) {
    console.error("Admin login failed.", { message: (caught as Error).message });
    return unavailable(email);
  }
  redirect("/admin");
}

/** Egyetlen belépési action: kódkérés, vagy (ha van "code" mező) a kód ellenőrzése. */
export async function loginAdmin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  return formData.has("code") ? verifyLoginCode(formData) : requestLoginCode(formData);
}

export async function logoutAdmin() {
  try {
    await (await supabaseServer()).auth.signOut();
  } catch (caught) {
    console.error("Admin logout failed.", { message: (caught as Error).message });
  }
  redirect("/admin/belepes");
}
