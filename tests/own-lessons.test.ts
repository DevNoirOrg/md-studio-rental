import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { ownSeriesDates, ownSeriesError, ownTimeError } from "../lib/own-lessons.ts";
import { buildEvent } from "../lib/google-calendar.ts";

const base = {
  name: "Hip-hop kezdő", room: "Opera - Nagy Terem", weekdays: [1, 3], hour: 17, durationMinutes: 120,
  startDate: "2099-09-01", endDate: "2099-09-30", excluded: [] as Array<{ from: string; to: string }>,
};

test("saját óra sorozat: a kiválasztott napok, a szünetek nélkül", () => {
  // 2099. szeptember: keddek 1, 8, 15, 22, 29; csütörtökök 3, 10, 17, 24
  assert.deepEqual(ownSeriesDates(base), [
    "2099-09-01", "2099-09-03", "2099-09-08", "2099-09-10", "2099-09-15", "2099-09-17", "2099-09-22", "2099-09-24", "2099-09-29",
  ]);
  assert.deepEqual(ownSeriesDates({ ...base, excluded: [{ from: "2099-09-08", to: "2099-09-17" }] }),
    ["2099-09-01", "2099-09-03", "2099-09-22", "2099-09-24", "2099-09-29"]);
  // egyszeri foglalás: azonos kezdő- és záródátum
  assert.deepEqual(ownSeriesDates({ ...base, startDate: "2099-09-08", endDate: "2099-09-08" }), ["2099-09-08"]);
});

test("saját óra: ellenőrzés", () => {
  assert.equal(ownSeriesError(base), null);
  assert.match(ownSeriesError({ ...base, name: " " })!, /nevet/);
  assert.match(ownSeriesError({ ...base, weekdays: [] })!, /napjain/);
  assert.match(ownSeriesError({ ...base, endDate: "2100-12-31" })!, /1 évre/);
  assert.match(ownSeriesError({ ...base, endDate: "2099-08-01" })!, /záródátum/);
  assert.match(ownSeriesError({ ...base, weekdays: [6], startDate: "2099-09-01", endDate: "2099-09-04" })!, /nincs egy alkalom/);
  assert.equal(ownTimeError(22.5, 90), null);
  assert.notEqual(ownTimeError(23, 120), null);
  assert.notEqual(ownTimeError(17.25, 60), null);
  assert.notEqual(ownTimeError(17, 30), null);
});

test("saját óra sorozat az adatbázisban: foglalt napokat kihagy, ár 0, jóváhagyott, a nyitvatartás nem számít", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await readFile(new URL("../supabase/studio-bookings.sql", import.meta.url), "utf8"));
    // a külön migráció is lefut a teljes séma után (újrafuttatható)
    await db.exec(await readFile(new URL("../supabase/2026-11-own-lessons.sql", import.meta.url), "utf8"));
    await db.exec("set search_path to rental, public");
    await db.query("select create_admin_studio_request($1,$2,$3,$4)", [
      { name: "Ügyfél", email: "a@b.hu", phone: "1" }, "privat", "customer",
      [{ room: "Opera - Nagy Terem", date: "2099-09-15", hour: 18, durationMinutes: 60, price: 5000 }],
    ]);
    const { rows } = await db.query<{ r: { id: string; created: number; skipped: string[] } }>(
      "select create_own_series($1,$2,$3::smallint[],$4,$5,$6,$7,$8,$9) as r",
      ["Hip-hop kezdő", "Opera - Nagy Terem", [1, 3], 17, 120, "2099-09-01", "2099-09-30", [{ from: "2099-09-22", to: "2099-09-24" }], "admin@x.hu"],
    );
    assert.equal(rows[0].r.created, 6);
    assert.deepEqual(rows[0].r.skipped, ["2099-09-15"]);
    const slots = (await db.query<{ price: number; status: string }>(
      "select price, status from studio_slots s join own_series o on o.request_id = s.request_id",
    )).rows;
    assert.equal(slots.length, 6);
    assert.ok(slots.every((s) => s.price === 0 && s.status === "approved"));
    const customer = (await db.query<{ customer: Record<string, unknown> }>(
      "select r.customer from studio_requests r join own_series o on o.request_id = r.id",
    )).rows[0].customer;
    assert.equal(customer.own, true);
    assert.equal(customer.seriesId, rows[0].r.id);
    // a saját óra fölé nem kerülhet ügyfél-foglalás
    await assert.rejects(db.query("select create_studio_request($1,$2,$3,$4)", [
      { name: "Más", email: "c@d.hu", phone: "2" }, "privat", "overlap",
      [{ room: "Opera - Nagy Terem", date: "2099-09-01", hour: 18, durationMinutes: 60, price: 5000 }],
    ]));
    // túl hosszú időszak
    await assert.rejects(db.query("select create_own_series($1,$2,$3::smallint[],$4,$5,$6,$7,$8,$9)",
      ["X", "Opera - Nagy Terem", [1], 17, 60, "2099-01-01", "2100-06-01", [], null]));
  } finally {
    await db.close();
  }
});

test("saját óra a Google Naptárban: a név a cím, szürke, ügyféladatok nélkül", () => {
  const event = buildEvent({
    id: "0f1e2d3c-4b5a-4968-8776-655443322110", room: "Astoria - Nagy Terem", date: "2099-09-01", hour: 17, durationMinutes: 120,
    price: 0, lessonType: "csoportos", customer: { name: "Hip-hop kezdő", email: "", phone: "", own: true } as never,
  });
  assert.equal(event.summary, "Hip-hop kezdő");
  assert.equal(event.colorId, "8");
  assert.ok(!event.description.includes("Telefon"));
  assert.deepEqual(event.end, { dateTime: "2099-09-01T19:00:00", timeZone: "Europe/Budapest" });
});
