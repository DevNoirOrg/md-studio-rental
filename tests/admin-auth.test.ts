import test from "node:test";
import assert from "node:assert/strict";
import { adminFromCookies, isAdminEmail } from "../lib/admin-auth.ts";

test("admin check: only e-mails listed in rental.admins, queried through the rental schema", async () => {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  try {
    Object.assign(process.env, {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable",
    });
    globalThis.fetch = (async (url: string, options: RequestInit & { headers: Record<string, string> }) => {
      seen.push(url);
      assert.equal(options.headers["Accept-Profile"], "rental");
      const email = new URL(url).searchParams.get("email");
      return Response.json(email === "eq.boss@example.hu" ? [{ email: "boss@example.hu" }] : []);
    }) as typeof fetch;
    assert.equal(await isAdminEmail("Boss@Example.hu"), true);
    assert.equal(await isAdminEmail("someone@example.hu"), false);
    assert.ok(seen[0].startsWith("https://test.supabase.co/rest/v1/admins?"));
    // munkamenet-süti nélkül nincs admin (és nem is kérdez le semmit)
    seen.length = 0;
    assert.equal(await adminFromCookies([]), null);
    assert.equal(seen.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of keys) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  }
});
