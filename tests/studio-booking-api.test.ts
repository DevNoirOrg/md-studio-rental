import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/rooms-store") return nextResolve(new URL("./stubs/rooms-store.ts", import.meta.url).href, context);
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
const { POST, GET } = await import("../app/api/studio-bookings/route.ts");
const { POST: decide } = await import("../app/api/studio-bookings/decision/route.ts");
hooks.deregister();

const input = (hour = 14) => ({
  lessonType: "privat",
  customer: { name: "Test Customer", email: "test@example.hu", phone: "+36301234567" },
  slots: [
    { room: "Astoria - Nagy Terem", date: "2099-10-15", hour },
    { room: "Astoria - Kis Terem", date: "2099-10-15", hour },
    { room: "Opera - Közepes Terem", date: "2099-10-15", hour },
  ],
});
const request = (body) => new Request("http://localhost/api/studio-bookings", {
  method: "POST", body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});
const calendarRequest = () => new Request("http://localhost/api/studio-bookings?from=2099-10-01&to=2099-10-31");

test("single SQL script upgrades legacy bookings and can be rerun without data loss", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table studio_requests (
        id uuid primary key default gen_random_uuid(), customer jsonb not null,
        lesson_type text not null, token_hash text not null unique, created_at timestamptz default now()
      );
      create table studio_slots (
        id uuid primary key default gen_random_uuid(),
        request_id uuid not null references studio_requests(id) on delete cascade,
        room text not null, date date not null, hour integer not null check (hour between 8 and 21),
        price integer not null, status text not null default 'pending', decided_at timestamptz
      );
      insert into studio_requests(customer, lesson_type, token_hash) values ('{}', 'privat', 'legacy');
      insert into studio_slots(request_id, room, date, hour, price)
        select id, 'Astoria - Nagy Terem', '2099-10-15', 10, 1000 from studio_requests;
    `);
    const schema = await readFile(new URL("../supabase/studio-bookings.sql", import.meta.url), "utf8");
    await db.exec(schema);
    await db.exec("set search_path to rental, public");
    // a régi public sémás táblák adatvesztés nélkül átkerültek a rental sémába
    assert.equal((await db.query("select to_regclass('public.studio_slots') is null as moved")).rows[0].moved, true);
    assert.equal((await db.query("select count(*)::integer as n from rental.studio_requests")).rows[0].n, 1);
    assert.equal((await db.query("select duration_minutes from studio_slots")).rows[0].duration_minutes, 60);
    assert.equal((await db.query("select count(*)::integer as n from studio_slot_units")).rows[0].n, 2);
    const slot = (await db.query("select id from studio_slots")).rows[0];
    await db.query("select decide_studio_request('legacy', 'reject', $1)", [slot.id]);
    assert.equal((await db.query("select count(*)::integer as n from studio_slot_units")).rows[0].n, 0);
    await db.query("select create_studio_request('{}', 'privat', 'new', $1)", [[{
      room: "Astoria - Nagy Terem", date: "2099-10-15", hour: 10.5, durationMinutes: 90, price: 1500,
    }]]);
    await db.exec(schema);
    const saved = (await db.query("select hour::float as hour, duration_minutes, price from studio_slots where status='pending'")).rows[0];
    assert.deepEqual(saved, { hour: 10.5, duration_minutes: 90, price: 1500 });
    assert.equal((await db.query("select count(*)::integer as n from studio_slots")).rows[0].n, 2);
    assert.equal((await db.query("select count(*)::integer as n from studio_slot_units")).rows[0].n, 3);
  } finally {
    await db.close();
  }
});

test("booking API and real PostgreSQL transactions cover decisions, conflicts and failure handling", async (t) => {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile(new URL("../supabase/studio-bookings.sql", import.meta.url), "utf8"));
    await db.exec("set search_path to rental, public");
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  const envKeys = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "BOOKING_NOTIFICATION_EMAIL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_BASE_URL"];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  let mailMode = "accepted";
  let mailCount = 0;
  let payload;
  let failReads = false;
  console.error = () => {};
  globalThis.fetch = async (url, options = {}) => {
    if (url === "https://api.resend.com/emails") {
      mailCount++;
      payload = JSON.parse(options.body);
      if (mailMode === "network") throw new Error("test network failure");
      if (mailMode === "rejected") return Response.json({ name: "validation_error" }, { status: 422 });
      return Response.json({ id: "test-message-id" });
    }
    assert.equal(options.headers.apikey, "test-service-key");
    assert.equal(options.cache, "no-store");
    const parsed = new URL(url);
    const body = options.body && JSON.parse(options.body);
    try {
      if (parsed.pathname.endsWith("/rpc/create_studio_request")) {
        const result = await db.query("select create_studio_request($1, $2, $3, $4) as result",
          [body.p_customer, body.p_lesson_type, body.p_token_hash, body.p_slots]);
        return Response.json(result.rows[0].result);
      }
      if (parsed.pathname.endsWith("/rpc/decide_studio_request")) {
        const result = await db.query("select decide_studio_request($1, $2, $3) as result",
          [body.p_token_hash, body.p_action, body.p_slot_id]);
        return Response.json(result.rows[0].result);
      }
      if (options.method === "DELETE") {
        await db.query("delete from studio_requests where id = $1", [parsed.searchParams.get("id").slice(3)]);
        return new Response(null, { status: 204 });
      }
      assert.ok(parsed.pathname.endsWith("/studio_slots"));
      if (failReads) return Response.json({ code: "test_outage" }, { status: 503 });
      assert.equal(parsed.searchParams.get("select"), "room,date,hour,duration_minutes");
      const dates = parsed.searchParams.getAll("date").map((value) => value.slice(4));
      const result = await db.query(
        "select room, to_char(date, 'YYYY-MM-DD') as date, hour::float as hour, duration_minutes from studio_slots where date >= $1 and date <= $2 and status in ('pending', 'approved') order by date, hour, room limit $3 offset $4",
        [dates[0], dates[1], Number(parsed.searchParams.get("limit")), Number(parsed.searchParams.get("offset"))],
      );
      return Response.json(result.rows);
    } catch (error) {
      return Response.json({ code: error.code }, { status: 409 });
    }
  };
  try {
    for (const key of envKeys) delete process.env[key];
    await t.test("missing config and invalid input fail explicitly", async () => {
      assert.equal((await POST(request(input()))).status, 503);
      assert.equal((await POST(request({ ...input(), slots: [] }))).status, 400);
      assert.equal((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
    });
    Object.assign(process.env, {
      RESEND_API_KEY: "re_test_not_real", RESEND_FROM_EMAIL: "booking@example.hu",
      BOOKING_NOTIFICATION_EMAIL: "notifications@example.hu",
      SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
      APP_BASE_URL: "http://localhost:3000",
    });

    await t.test("missing or invalid recipient prevents saving and sending", async () => {
      for (const recipient of [undefined, "", "invalid@example", "a\nb@example.hu"]) {
        if (recipient === undefined) delete process.env.BOOKING_NOTIFICATION_EMAIL;
        else process.env.BOOKING_NOTIFICATION_EMAIL = recipient;
        assert.equal((await POST(request(input()))).status, 503);
      }
      assert.equal(mailCount, 0);
      assert.equal((await db.query("select count(*)::integer as n from studio_requests")).rows[0].n, 0);
      process.env.BOOKING_NOTIFICATION_EMAIL = "notifications@example.hu";
    });

    await t.test("RLS and RPC permissions block anonymous access", async () => {
      await db.exec("set role anon;");
      await assert.rejects(db.query("select * from rental.studio_requests"), /permission denied/);
      await assert.rejects(db.query("select rental.decide_studio_request('bad', 'approve-all', null)"), /permission denied/);
      await db.exec("reset role;");
      await db.exec("set role service_role;");
      assert.equal((await db.query("select count(*)::integer as n from studio_requests")).rows[0].n, 0);
      assert.equal((await db.query("select decide_studio_request('unknown', 'approve-all', null) as result")).rows[0].result, null);
      await db.exec("reset role;");
    });

    await t.test("stores pending slots and sends slot-specific decision links", async () => {
      assert.equal((await POST(request(input()))).status, 200);
      assert.deepEqual(payload.to, ["notifications@example.hu"]);
      assert.equal(payload.reply_to, "test@example.hu");
      assert.ok(payload.html.includes("Óratípus:</strong> Privát óra"));
      const available = await (await GET(calendarRequest())).json();
      assert.equal(available.slots.length, 3);
      // a látogató nem látja az állapotot (jóváhagyásra vár / jóváhagyva) — csak hogy foglalt
      assert.ok(available.slots.every((slot) => Object.keys(slot).sort().join(",") === "date,durationMinutes,hour,room"));
      const stored = (await db.query("select token_hash from studio_requests")).rows[0];
      const rawToken = new URL(payload.text.match(/Jóváhagyás: (\S+)/)[1]).searchParams.get("token");
      assert.equal(stored.token_hash.length, 64);
      assert.notEqual(stored.token_hash, rawToken);
    });

    await t.test("atomic duplicate request is rejected without an orphan request or extra email", async () => {
      assert.equal((await POST(request(input()))).status, 409);
      assert.equal(mailCount, 1);
      assert.equal((await db.query("select count(*)::integer as n from studio_requests")).rows[0].n, 1);
    });

    await t.test("individual approve/reject, replay and approve-all preserve final decisions", async () => {
      const links = [...payload.text.matchAll(/(?:Jóváhagyás|Elutasítás): (http\S+)/g)].map((match) => {
        const params = new URL(match[1]).searchParams;
        return Object.fromEntries(params);
      });
      const invalid = await decide(request({ ...links[0], token: "b".repeat(64) }));
      assert.equal(invalid.status, 404);
      assert.equal((await decide(request({ ...links[0], action: "delete" }))).status, 400);
      assert.equal((await decide(request({ ...links[0], slot: "00000000-0000-4000-8000-000000000000" }))).status, 404);
      assert.equal((await (await decide(request(links[0]))).json()).changed, 1);
      assert.equal((await (await decide(request(links[3]))).json()).changed, 1);
      assert.equal((await (await decide(request(links[1]))).json()).changed, 0);
      const all = { token: links[0].token, action: "approve-all" };
      assert.equal((await (await decide(request(all))).json()).changed, 1);
      assert.equal((await (await decide(request(all))).json()).changed, 0);
      const states = (await db.query("select status from studio_slots order by room")).rows.map((row) => row.status);
      assert.deepEqual(states.sort(), ["approved", "approved", "rejected"]);
      const publicSlots = (await (await GET(calendarRequest())).json()).slots;
      assert.equal(publicSlots.length, 2);
      assert.ok(publicSlots.every((slot) => slot.status === undefined)); // az elutasított nem foglal, az állapot rejtett
      const rejected = (await db.query("select room, to_char(date, 'YYYY-MM-DD') as date, hour::float as hour from studio_slots where status='rejected'")).rows[0];
      assert.equal((await POST(request({ ...input(), slots: [rejected] }))).status, 200);
      assert.equal((await db.query("select count(*)::integer as n from studio_slots where status='pending'")).rows[0].n, 1);
    });

    await t.test("half-hour intervals persist and overlapping starts are rejected atomically", async () => {
      const booking = { ...input(), slots: [
        { room: "Opera - Nagy Terem", date: "2099-10-16", hour: 10.5, durationMinutes: 90 },
      ] };
      assert.equal((await POST(request(booking))).status, 200);
      assert.ok(payload.text.includes("10:30–12:00"));
      const stored = (await db.query("select price, duration_minutes from studio_slots where date='2099-10-16'")).rows[0];
      assert.equal(stored.price, 4500);
      assert.equal(stored.duration_minutes, 90);
      const before = mailCount;
      for (const slot of [
        { hour: 10, durationMinutes: 60 }, { hour: 11.5, durationMinutes: 60 },
        { hour: 9, durationMinutes: 240 },
      ]) {
        assert.equal((await POST(request({ ...booking, slots: [{ ...booking.slots[0], ...slot }] }))).status, 409);
      }
      assert.equal(mailCount, before);
      assert.equal((await POST(request({ ...booking, slots: [{ ...booking.slots[0], hour: 12 }] }))).status, 200);
      assert.equal((await db.query("select count(*)::integer as n from studio_slot_units where date='2099-10-16'")).rows[0].n, 6);
    });

    await t.test("explicit send rejection releases slots; uncertain sending retains pending slots", async () => {
      mailMode = "rejected";
      assert.equal((await POST(request(input(20)))).status, 502);
      assert.equal((await db.query("select count(*)::integer as n from studio_slots where hour=20")).rows[0].n, 0);
      mailMode = "network";
      assert.equal((await POST(request(input(21)))).status, 502);
      assert.equal((await db.query("select count(*)::integer as n from studio_slots where hour=21 and status='pending'")).rows[0].n, 3);
    });

    await t.test("invalid calendar ranges and database outage never return empty success", async () => {
      assert.equal((await GET(new Request("http://localhost/api/studio-bookings?from=2099-02-30&to=2099-03-01"))).status, 400);
      failReads = true;
      assert.equal((await GET(calendarRequest())).status, 503);
      failReads = false;
    });

    await t.test("calendar pagination includes more than 500 bookings", async () => {
      const result = await db.query(
        "insert into studio_requests(customer,lesson_type,token_hash) values ('{}', 'privat', 'pagination-test') returning id",
      );
      const id = result.rows[0].id;
      await db.query(
        "insert into studio_slots(request_id,room,date,hour,price) select $1, 'Pagination test ' || value, '2099-10-15', 8, 1000 from generate_series(1, 501) as value",
        [id],
      );
      const slots = (await (await GET(calendarRequest())).json()).slots;
      assert.equal(slots.filter((slot) => slot.room.startsWith("Pagination test ")).length, 501);
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalLog;
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    await db.close();
  }
});
