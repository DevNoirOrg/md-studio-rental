import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAuthEnv } from "../admin-auth.ts";

/** Supabase kliens a bejelentkezett admin munkamenetéhez (Server Action / oldal; sütiket is írhat). */
export async function supabaseServer() {
  const { url, key } = supabaseAuthEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Componentből nem lehet sütit írni — a proxy frissíti a munkamenetet.
        }
      },
    },
  });
}
