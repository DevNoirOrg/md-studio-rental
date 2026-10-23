import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { NextRequest } from "next/server.js";
import { createAdminSession, adminCookie } from "../lib/admin-auth.ts";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
const { GET, POST, DELETE, PATCH } = await import("../app/admin/api/bookings/route.ts");
hooks.deregister();

test("admin rescheduling preserves room, duration, price and status and atomically checks overlaps", async () => {
  const keys = ["ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  const db = new PGlite();
  try {
    Object.assign(process.env, { ADMIN_USERNAME: "test", ADMIN_PASSWORD: "test",
      ADMIN_SESSION_SECRET: "test-secret", SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" });
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await readFile(new URL("../supabase/studio-bookings.sql", import.meta.url), "utf8"));
    const customer = { name: "Test Name", email: "test@example.hu", phone: "+36301234567" };
    const interval = { room: "Opera - Közepes Terem", date: "2099-10-15", hour: 10, durationMinutes: 90, price: 6000 };
    await db.query("select create_studio_request($1,$2,$3,$4)", [
      customer, "privat", "reschedule-pending", [interval, { ...interval, hour: 14 }],
    ]);
    await db.query("select create_admin_studio_request($1,$2,$3,$4)", [
      customer, "privat", "reschedule-approved", [{ ...interval, date: "2099-10-16", hour: 16 }],
    ]);
    const records = (await db.query("select * from studio_slots order by date,hour")).rows;
    let calls = 0;
    let changeDuringLookup = false;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.ok(url.startsWith("https://test.supabase.co/rest/v1/studio_slots?"));
      const params = new URL(url).searchParams;
      assert.equal(params.get("status"), "in.(pending,approved)");
      const id = params.get("id").slice(3);
      if (options.method === "GET") {
        const result = await db.query("select id,date::text,hour,duration_minutes from studio_slots where id=$1 and status in ('pending','approved')", [id]);
        if (changeDuringLookup) {
          await db.query("update studio_slots set hour=9 where id=$1", [id]);
          changeDuringLookup = false;
        }
        return Response.json(result.rows.map((row) => ({ ...row, hour: Number(row.hour) })));
      }
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers.Prefer, "return=representation");
      const body = JSON.parse(options.body);
      assert.deepEqual(Object.keys(body).sort(), ["date", "hour"]);
      try {
        const result = await db.query(`update studio_slots set date=$1,hour=$2
          where id=$3 and status in ('pending','approved') and date=$4 and hour=$5 and duration_minutes=$6
          returning id,date::text,hour`, [
          body.date, body.hour, id, params.get("date").slice(3), params.get("hour").slice(3),
          params.get("duration_minutes").slice(3),
        ]);
        return Response.json(result.rows.map((row) => ({ ...row, hour: Number(row.hour) })));
      } catch (error) {
        return Response.json({ code: error.code }, { status: 409 });
      }
    };
    const token = createAdminSession();
    const patch = (id, body, cookie = token, origin = "http://localhost") => PATCH(new NextRequest(
      `http://localhost/admin/api/bookings?id=${id}`, {
        method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { cookie: `${adminCookie}=${cookie}`, origin, "Content-Type": "application/json" },
      },
    ));
    const target = { date: "2099-10-15", hour: 10.5 };
    assert.equal((await patch(records[0].id, target, "forged")).status, 401);
    assert.equal((await patch(records[0].id, target, token, "https://untrusted.example")).status, 403);
    assert.equal((await patch("bad-id", target)).status, 400);
    assert.equal((await patch(records[0].id, "{")).status, 400);
    for (const field of ["room", "price", "durationMinutes", "duration_minutes", "status", "customer"]) {
      assert.equal((await patch(records[0].id, { ...target, [field]: "changed" })).status, 400);
    }
    assert.equal(calls, 0);
    for (const invalid of [
      {}, null, [], { date: "2099-02-30", hour: 10 }, { date: "2020-01-01", hour: 10 },
      { ...target, hour: 7.5 }, { ...target, hour: 21 }, { ...target, hour: 10.25 }, { ...target, hour: "10" },
    ]) assert.equal((await patch(records[0].id, invalid)).status, 400);
    const moved = await patch(records[0].id, target);
    assert.equal(moved.status, 200);
    assert.equal(moved.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await moved.json(), { success: true, slot: { id: records[0].id, ...target } });
    let updated = (await db.query("select * from studio_slots where id=$1", [records[0].id])).rows[0];
    assert.deepEqual(updated, { ...records[0], hour: "10.5" });
    assert.deepEqual((await db.query("select minute from studio_slot_units where slot_id=$1 order by minute", [records[0].id])).rows,
      [{ minute: 630 }, { minute: 660 }, { minute: 690 }]);
    console.error = () => {};
    assert.equal((await patch(records[0].id, { ...target, hour: 13.5 })).status, 409);
    assert.deepEqual((await db.query("select * from studio_slots where id=$1", [records[0].id])).rows[0], updated);
    assert.deepEqual((await db.query("select minute from studio_slot_units where slot_id=$1 order by minute", [records[0].id])).rows,
      [{ minute: 630 }, { minute: 660 }, { minute: 690 }]);
    const nextDay = { date: "2099-11-20", hour: 20.5 };
    assert.equal((await patch(records[2].id, nextDay)).status, 200);
    updated = (await db.query("select * from studio_slots where id=$1", [records[2].id])).rows[0];
    assert.deepEqual(updated, { ...records[2], date: new Date("2099-11-20T00:00:00Z"), hour: "20.5" });
    assert.equal((await db.query("select count(*)::int as n from studio_slot_units where date='2099-10-16'")).rows[0].n, 0);
    assert.deepEqual((await db.query("select * from studio_slots where id=$1", [records[1].id])).rows[0], records[1]);
    assert.deepEqual((await db.query("select customer from studio_requests")).rows.map((row) => row.customer), [customer, customer]);
    changeDuringLookup = true;
    assert.equal((await patch(records[0].id, { ...target, hour: 12 })).status, 409);
    assert.equal((await db.query("select hour from studio_slots where id=$1", [records[0].id])).rows[0].hour, "9.0");
    await db.query("update studio_slots set status='rejected' where id=$1", [records[0].id]);
    assert.equal((await patch(records[0].id, target)).status, 404);
    await db.query("delete from studio_slots where id=$1", [records[2].id]);
    assert.equal((await patch(records[2].id, target)).status, 404);
    globalThis.fetch = async () => Response.json({ code: "outage" }, { status: 503 });
    assert.equal((await patch(records[1].id, target)).status, 503);
  } finally {
    await db.close();
    globalThis.fetch = originalFetch;
    console.error = originalLog;
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

test("admin bookings reject unauthenticated access and expose only intended fields", async () => {
  const keys = ["ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  try {
    Object.assign(process.env, { ADMIN_USERNAME: "test", ADMIN_PASSWORD: "test",
      ADMIN_SESSION_SECRET: "test-secret", SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" });
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls++;
      assert.ok(url.includes("studio_requests!inner(customer,lesson_type)"));
      assert.ok(!url.includes("token_hash"));
      return Response.json([{
        id: "slot-id", room: "Astoria - Nagy Terem", date: "2026-10-22",
        hour: 10.5, duration_minutes: 90, price: 1500, status: "pending",
        studio_requests: { customer: { name: "Test Name", email: "test@example.hu", phone: "+36301234567", unexpected: "private" }, lesson_type: "privat" },
      }]);
    };
    const request = (token, query = "from=2026-10-19&to=2026-10-25") => new NextRequest(`http://localhost/admin/api/bookings?${query}`, {
      headers: token ? { cookie: `${adminCookie}=${token}` } : {},
    });
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request("forged"))).status, 401);
    assert.equal(calls, 0);
    const token = createAdminSession();
    assert.equal((await GET(request(token, "from=bad&to=2026-10-25"))).status, 400);
    const response = await GET(request(token));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const { slots } = await response.json();
    assert.deepEqual(slots[0].customer, { name: "Test Name", email: "test@example.hu", phone: "+36301234567" });
    assert.equal(slots[0].durationMinutes, 90);
    assert.equal(slots[0].lessonType, "privat");
    assert.equal(slots[0].studio_requests, undefined);
    const db = new PGlite();
    try {
      await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
      await db.exec(await readFile(new URL("../supabase/studio-bookings.sql", import.meta.url), "utf8"));
      let rpcCalls = 0;
      globalThis.fetch = async (url, options) => {
        assert.equal(url, "https://test.supabase.co/rest/v1/rpc/create_admin_studio_request");
        rpcCalls++;
        const body = JSON.parse(options.body);
        try {
          await db.query("select create_admin_studio_request($1,$2,$3,$4)", [
            body.p_customer, body.p_lesson_type, body.p_token_hash, body.p_slots,
          ]);
          return Response.json({ id: "test-id" });
        } catch (error) {
          return Response.json({ code: error.code }, { status: 409 });
        }
      };
      const input = { lessonType: "privat", customer: { name: "Test Admin", email: "test@example.hu", phone: "+36301234567" },
        slots: [{ room: "Astoria - Nagy Terem", date: "2099-10-15", hour: 10.5, durationMinutes: 90, price: 1 }] };
      const post = (body = input, cookie = token, origin = "http://localhost") => POST(new NextRequest("http://localhost/admin/api/bookings", {
        method: "POST", body: JSON.stringify(body),
        headers: { cookie: `${adminCookie}=${cookie}`, origin, "Content-Type": "application/json" },
      }));
      assert.equal((await post(input, "forged")).status, 401);
      assert.equal((await post(input, token, "https://untrusted.example")).status, 403);
      assert.equal((await post({ ...input, slots: [] })).status, 400);
      assert.equal(rpcCalls, 0);
      assert.equal((await post()).status, 200);
      const created = (await db.query("select status, price, duration_minutes, decided_at from studio_slots")).rows[0];
      assert.equal(created.status, "approved");
      assert.equal(created.price, 1500);
      assert.equal(created.duration_minutes, 90);
      assert.ok(created.decided_at);
      console.error = () => {};
      assert.equal((await post({ ...input, slots: [
        { ...input.slots[0], hour: 9 }, { ...input.slots[0], hour: 11 },
      ] })).status, 409);
      assert.equal((await db.query("select count(*)::int as n from studio_requests")).rows[0].n, 1);
      await db.exec("set role anon");
      await assert.rejects(db.query("select create_admin_studio_request('{}','privat','x','[]')"), /permission denied/);
      await db.exec("reset role");
      await db.query("select create_studio_request($1,$2,$3,$4)", [
        input.customer, "privat", "pending-delete-test", [
          { ...input.slots[0], hour: 14, price: 1500 },
          { ...input.slots[0], hour: 16, price: 1500 },
        ],
      ]);
      const records = (await db.query("select id, status from studio_slots order by hour")).rows;
      let deleteCalls = 0;
      globalThis.fetch = async (url, options) => {
        deleteCalls++;
        assert.equal(options.method, "DELETE");
        assert.equal(options.headers.Prefer, "return=representation");
        const params = new URL(url).searchParams;
        assert.equal(params.get("status"), "in.(pending,approved)");
        const result = await db.query("delete from studio_slots where id=$1 and status in ('pending','approved') returning id", [params.get("id").slice(3)]);
        return Response.json(result.rows);
      };
      const remove = (id, cookie = token, origin = "http://localhost") => DELETE(new NextRequest(
        `http://localhost/admin/api/bookings?id=${id}`, {
          method: "DELETE", headers: { cookie: `${adminCookie}=${cookie}`, origin },
        },
      ));
      assert.equal((await remove(records[0].id, "forged")).status, 401);
      assert.equal((await remove(records[0].id, token, "https://untrusted.example")).status, 403);
      assert.equal((await remove("invalid")).status, 400);
      assert.equal(deleteCalls, 0);
      assert.equal(records[0].status, "approved");
      assert.equal(records[1].status, "pending");
      for (const record of records.slice(0, 2)) {
        const response = await remove(record.id);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).success, true);
        assert.equal((await db.query("select count(*)::int as n from studio_slot_units where slot_id=$1", [record.id])).rows[0].n, 0);
        assert.equal((await remove(record.id)).status, 404);
      }
      assert.equal((await db.query("select id from studio_slots")).rows[0].id, records[2].id);
      assert.equal((await db.query("select count(*)::int as n from studio_slot_units")).rows[0].n, 3);
      await db.query("select create_admin_studio_request($1,$2,$3,$4)", [
        input.customer, "privat", "rebook-after-delete", [{ ...input.slots[0], price: 1500 }],
      ]);
      globalThis.fetch = async () => Response.json({ code: "outage" }, { status: 503 });
      assert.equal((await remove(records[2].id)).status, 503);
    } finally {
      await db.close();
    }
    console.error = () => {};
    globalThis.fetch = async () => Response.json({ code: "outage" }, { status: 503 });
    assert.equal((await GET(request(token))).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalLog;
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
