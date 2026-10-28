import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { buildEvent, eventIdFor, signedJwt, syncCalendar } from "../lib/google-calendar.ts";

const customer = { name: "Teszt Elek", email: "teszt@example.hu", phone: "+36301234567" };
const SLOT_ID = "0f1e2d3c-4b5a-4968-8776-655443322110";

async function freshDb() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile(new URL("../supabase/studio-bookings.sql", import.meta.url), "utf8"));
  await db.exec("set search_path to rental, public");
  return db;
}

const slot = (date: string, hour: number, room = "Opera - Közepes Terem") =>
  ({ room, date, hour, durationMinutes: 90, price: 6000 });

test("event: title, booking details, Budapest local time, stable id", () => {
  const event = buildEvent({
    id: SLOT_ID, room: "Opera - Közepes Terem", date: "2099-10-15", hour: 22.5, durationMinutes: 90,
    price: 6000, lessonType: "privat", customer,
  }, "https://x.hu/studio-berles/admin?datum=2099-10-15&terem=3");
  assert.equal(event.id, "0f1e2d3c4b5a49688776655443322110");
  assert.match(event.id, /^[0-9a-v]{5,1024}$/);
  // egy közös naptár: a cím elején a terem, a színe termenként más (Opera Közepes = zöld)
  assert.equal(event.summary, "Opera Közepes · Privát óra – Teszt Elek");
  assert.equal(event.colorId, "10");
  assert.deepEqual(event.start, { dateTime: "2099-10-15T22:30:00", timeZone: "Europe/Budapest" });
  // 24:00-kor záródó idősáv → következő nap 00:00
  assert.deepEqual(event.end, { dateTime: "2099-10-16T00:00:00", timeZone: "Europe/Budapest" });
  for (const part of ["+36301234567", "teszt@example.hu", "90 perc", "6000", "datum=2099-10-15"]) {
    assert.ok(event.description.replace(/\s/g, "").includes(part.replace(/\s/g, "")), part);
  }
  assert.ok(!event.description.includes("Állapot"));
});

test("service account JWT is signed with RS256", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwt = signedJwt({ client_email: "robot@x.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) as string }, 1000);
  const [header, claims, signature] = jwt.split(".");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${claims}`);
  assert.ok(verifier.verify(publicKey, Buffer.from(signature, "base64url")));
  const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(payload.scope, "https://www.googleapis.com/auth/calendar.events");
  assert.equal(payload.exp, 4600);
});

test("triggers: only approved slots and their later changes need syncing; deletions are queued", async () => {
  const db = await freshDb();
  try {
    await db.query("select create_studio_request($1,'privat','pending-1',$2)", [customer, [slot("2099-10-15", 10)]]);
    const dirty = async () => (await db.query<{ hour: string; status: string; gcal_dirty: boolean }>(
      "select hour, status, gcal_dirty from studio_slots order by date, hour")).rows;
    assert.equal((await dirty())[0].gcal_dirty, false); // jóváhagyásra vár → nem kerül be
    await db.query("select decide_studio_request('pending-1','approve-all',null)");
    assert.equal((await dirty())[0].gcal_dirty, true); // jóváhagyva → be kell írni
    await db.exec("update studio_slots set gcal_dirty=false, gcal_synced_at=now()"); // a szinkron ezt írja
    assert.equal((await dirty())[0].gcal_dirty, false);
    await db.exec("update studio_slots set hour=12"); // átfoglalás → frissíteni kell
    assert.equal((await dirty())[0].gcal_dirty, true);
    await db.exec("delete from studio_slots"); // törlés → az eseményt is törölni kell
    assert.equal((await db.query("select count(*)::int as n from gcal_deletions")).rows[0].n, 1);

    // admin által felvett foglalás azonnal jóváhagyott → be kell írni; elutasított igény nem
    await db.query("select create_admin_studio_request($1,'privat','admin-1',$2)", [customer, [slot("2099-10-16", 10)]]);
    await db.query("select create_studio_request($1,'privat','pending-2',$2)", [customer, [slot("2099-10-17", 10)]]);
    const second = (await db.query<{ id: string }>("select id from studio_slots where date='2099-10-17'")).rows[0];
    await db.query("select decide_studio_request('pending-2','reject',$1)", [second.id]);
    assert.deepEqual((await dirty()).map((row) => row.gcal_dirty), [true, false]);
    // elutasított (soha be nem írt) igény törlése nem kerül a törlési sorba
    await db.query("delete from studio_requests where token_hash='pending-2'");
    assert.equal((await db.query("select count(*)::int as n from gcal_deletions")).rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test("sync writes approved slots, removes deleted ones and is safe to repeat", async () => {
  const db = await freshDb();
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    APP_BASE_URL: "https://www.example.hu",
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "robot@x.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
    GOOGLE_CALENDAR_ID: "info.mddancestudio@gmail.com",
  };
  const original = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const events = new Map<string, { status: string; summary: string; start: { dateTime: string } }>();
  const calls: string[] = [];
  let googleDown = false;
  Object.assign(process.env, env);
  globalThis.fetch = (async (input: string | URL, options: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    const body = typeof options.body === "string" ? JSON.parse(options.body) : undefined;
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "token", expires_in: 3600 });
    if (url.hostname === "www.googleapis.com") {
      calls.push(`${method} ${decodeURIComponent(url.pathname)}`);
      assert.equal((options.headers as Record<string, string>).Authorization, "Bearer token");
      if (googleDown) return Response.json({ error: { message: "backend error" } }, { status: 503 });
      const id = url.pathname.split("/events/")[1] ?? body?.id;
      if (method === "PUT") {
        if (!events.has(id)) return Response.json({}, { status: 404 });
        events.set(id, body);
        return Response.json(body);
      }
      if (method === "POST") {
        events.set(id, body);
        return Response.json(body);
      }
      if (method === "DELETE") {
        if (!events.delete(id)) return Response.json({}, { status: 410 });
        return new Response(null, { status: 204 });
      }
    }
    // Supabase PostgREST (csak a szinkron által használt kérések)
    assert.equal(url.hostname, "test.supabase.co");
    const table = url.pathname.split("/rest/v1/")[1];
    const q = url.searchParams;
    if (table === "gcal_deletions" && method === "GET") {
      return Response.json((await db.query("select slot_id, room from gcal_deletions order by created_at")).rows);
    }
    if (table === "gcal_deletions" && method === "DELETE") {
      await db.query("delete from gcal_deletions where slot_id=$1", [q.get("slot_id")!.slice(3)]);
      return new Response(null, { status: 204 });
    }
    if (table === "studio_slots" && method === "GET") {
      const rows = (await db.query(`select s.id, s.room, to_char(s.date,'YYYY-MM-DD') as date, s.hour::float as hour, s.duration_minutes, s.price, s.status,
        jsonb_build_object('customer', r.customer, 'lesson_type', r.lesson_type) as studio_requests
        from studio_slots s join studio_requests r on r.id = s.request_id where s.gcal_dirty order by s.date, s.hour`)).rows;
      return Response.json(rows);
    }
    if (table === "studio_slots" && method === "PATCH") {
      const where = ["id", "room", "date", "hour", "duration_minutes", "status"].filter((key) => q.has(key));
      const values = where.map((key) => q.get(key)!.slice(3));
      const sets = Object.keys(body);
      await db.query(
        `update studio_slots set ${sets.map((key, i) => `${key}=$${i + 1}`).join(",")} where ${where.map((key, i) => `${key}=$${sets.length + i + 1}`).join(" and ")}`,
        [...sets.map((key) => body[key]), ...values],
      );
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected request ${method} ${url}`);
  }) as typeof fetch;
  try {
    await db.query("select create_admin_studio_request($1,'kiscsoportos','a1',$2)", [customer, [slot("2099-10-15", 10), slot("2099-10-15", 14)]]);
    await db.query("select create_studio_request($1,'privat','p1',$2)", [customer, [slot("2099-10-16", 10)]]);

    let result = await syncCalendar();
    assert.deepEqual(result, { configured: true, written: 2, removed: 0, failed: 0 });
    assert.equal(events.size, 2); // a jóváhagyásra váró igény nem került be
    const [first] = (await db.query<{ id: string }>("select id from studio_slots where date='2099-10-15' and hour=10")).rows;
    assert.equal(events.get(eventIdFor(first.id))?.summary, "Opera Közepes · Kiscsoportos óra – Teszt Elek");
    assert.ok(calls.every((call) => call.includes("/calendars/info.mddancestudio@gmail.com/events")));

    // ismételt szinkron: nincs teendő
    calls.length = 0;
    assert.deepEqual(await syncCalendar(), { configured: true, written: 0, removed: 0, failed: 0 });
    assert.equal(calls.length, 0);

    // átfoglalás → ugyanaz az esemény frissül; törlés → az esemény törlődik
    await db.query("update studio_slots set hour=11 where id=$1", [first.id]);
    await db.exec("delete from studio_slots where date='2099-10-15' and hour=14");
    result = await syncCalendar();
    assert.deepEqual(result, { configured: true, written: 1, removed: 1, failed: 0 });
    assert.equal(events.size, 1);
    assert.equal(events.get(eventIdFor(first.id))?.start.dateTime, "2099-10-15T11:00:00");

    // a Google nem elérhető: a foglalás megmarad, a hiba eltárolódik, később pótolódik
    await db.query("select decide_studio_request('p1','approve-all',null)");
    googleDown = true;
    result = await syncCalendar();
    assert.equal(result.failed, 1);
    assert.match(result.error ?? "", /503/);
    const pending = (await db.query<{ gcal_dirty: boolean; gcal_error: string }>("select gcal_dirty, gcal_error from studio_slots where date='2099-10-16'")).rows[0];
    assert.equal(pending.gcal_dirty, true);
    assert.match(pending.gcal_error, /503/);
    googleDown = false;
    assert.deepEqual(await syncCalendar(), { configured: true, written: 1, removed: 0, failed: 0 });
    assert.equal(events.size, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.close();
  }
});

test("without configuration the sync does nothing", async () => {
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  assert.deepEqual(await syncCalendar(), { configured: false, written: 0, removed: 0, failed: 0 });
});
