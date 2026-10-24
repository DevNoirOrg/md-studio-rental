import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { withBase } from "@/lib/base-path";

/*
  Belépés e-mailben kapott LINKKEL (a kód beírása helyett):
    ?code=…                  — a Supabase alap „Magic Link” sablonja (ugyanabban a böngészőben)
    ?token_hash=…&type=email — saját sablonnal készített link
  Siker után csak akkor enged be, ha a cím szerepel a rental.admins táblában.
*/
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  const fail = (reason: string) => NextResponse.redirect(new URL(withBase(`/admin/belepes?hiba=${reason}`), request.url));

  try {
    const supabase = await supabaseServer();
    let error: { message: string } | null = null;
    if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
    else if (tokenHash) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
    else return fail("link");
    if (error) return fail("link");
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (!email || !(await isAdminEmail(email))) {
      await supabase.auth.signOut();
      return fail("jog");
    }
  } catch (caught) {
    console.error("Admin link login failed.", { message: (caught as Error).message });
    return fail("link");
  }
  return NextResponse.redirect(new URL(withBase("/admin"), request.url));
}
