"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Böngészős Supabase kliens — csak az egyszer használatos képfeltöltési linkekhez. */
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
