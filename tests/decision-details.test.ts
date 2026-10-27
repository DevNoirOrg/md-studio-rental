import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { tokenHash } from "../lib/booking-store.ts";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/rooms-store") return nextResolve(new URL("./stubs/rooms-store.ts", import.meta.url).href, context);
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
const { GET } = await import("../app/api/studio-bookings/decision/route.ts");
hooks.deregister();

test("decision page lookup shows which request and slots the link refers to, without the token", async () => {
  const db = new PGlite();
  const originalFetch = globalThis.fetch;
  const original = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  Object.assign(process.env, { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" });
  const token = "b".repeat(64);
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await readFile(new URL("../supabase/studio-bookings.sql", import.meta.url), "utf8"));
    await db.exec("set search_path to rental, public");
    const customer = { name: "Teszt Elek", email: "teszt@example.hu", phone: "+36301234567" };
    await db.query("select create_studio_request($1,'kiscsoportos',$2,$3)", [customer, tokenHash(token), [
      { room: "Opera - Közepes Terem", date: "2099-10-16", hour: 18, durationMinutes: 60, price: 4000 },
      { room: "Astoria - Kis Terem", date: "2099-10-15", hour: 10.5, durationMinutes: 90, price: 3000 },
    ]]);
    globalThis.fetch = (async (input: string) => {
      const url = new URL(input);
      assert.equal(url.pathname, "/rest/v1/studio_requests");
      assert.ok(!url.searchParams.get("select")!.includes("token_hash"));
      const hash = url.searchParams.get("token_hash")!.slice(3);
      const rows = (await db.query(`select r.lesson_type, r.customer, jsonb_agg(jsonb_build_object('id', s.id, 'room', s.room,
        'date', to_char(s.date,'YYYY-MM-DD'), 'hour', s.hour, 'duration_minutes', s.duration_minutes, 'price', s.price, 'status', s.status)) as studio_slots
        from studio_requests r join studio_slots s on s.request_id = r.id where r.token_hash = $1 group by r.id`, [hash])).rows;
      return Response.json(rows);
    }) as typeof fetch;
    const get = (t: string) => GET(new Request(`http://localhost/api/studio-bookings/decision?token=${t}`));
    assert.equal((await get("nope")).status, 400);
    assert.equal((await get("c".repeat(64))).status, 404);
    const response = await get(token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.lessonType, "kiscsoportos");
    assert.deepEqual(body.customer, customer);
    assert.deepEqual(body.slots.map((slot: { date: string; hour: number; roomLabel: string; status: string }) =>
      [slot.date, slot.hour, slot.roomLabel, slot.status]), [
      ["2099-10-15", 10.5, "Astoria stúdió · Kis Terem", "pending"],
      ["2099-10-16", 18, "Opera stúdió · Közepes Terem", "pending"],
    ]);
    assert.ok(!JSON.stringify(body).includes(tokenHash(token)));
  } finally {
    globalThis.fetch = originalFetch;
    if (original.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = original.url;
    if (original.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = original.key;
    await db.close();
  }
});
