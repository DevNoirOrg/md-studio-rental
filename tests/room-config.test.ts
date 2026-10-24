import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  defaultRoomsConfig, normalizeRoomConfig, openingFor, roomsConfigFromRows, weekdayIndex, weeklyRange, mediaUrl,
} from "../lib/room-config.ts";
import { bookingPrice, validateBooking, validateBookingTime } from "../lib/studio-booking.ts";

const now = new Date("2026-10-14T10:00:00Z");
const customer = { name: "Teszt Elek", email: "teszt@example.hu", phone: "+36301234567" };
// 2026-10-19 hétfő, 2026-10-25 vasárnap
const MONDAY = "2026-10-19";
const SUNDAY = "2026-10-25";

function customConfig() {
  const config = structuredClone(defaultRoomsConfig);
  const room = config["Opera - Közepes Terem"];
  room.lessonTypes = ["privat", "csoportos"];
  room.prices = { privat: 5000, kiscsoportos: 7000, csoportos: 9000 };
  room.hours = room.hours.map((day, i) => (i === 6 ? { ...day, closed: true } : { closed: false, open: 10, close: 18.5 }));
  return config;
}

test("weekday index starts on Monday", () => {
  assert.equal(weekdayIndex(MONDAY), 0);
  assert.equal(weekdayIndex(SUNDAY), 6);
});

test("empty or partial stored data falls back to the defaults", () => {
  const config = roomsConfigFromRows([
    { id: "Astoria - Kis Terem", data: { name: "Kicsi", prices: { privat: 2500 }, hours: "rossz" } },
  ]);
  assert.deepEqual(config["Astoria - Nagy Terem"], defaultRoomsConfig["Astoria - Nagy Terem"]);
  assert.equal(config["Astoria - Kis Terem"].name, "Kicsi");
  assert.equal(config["Astoria - Kis Terem"].location, "Astoria stúdió");
  assert.deepEqual(config["Astoria - Kis Terem"].prices, { privat: 2500, kiscsoportos: 2000, csoportos: 2000 });
  assert.deepEqual(config["Astoria - Kis Terem"].hours, defaultRoomsConfig["Astoria - Kis Terem"].hours);
  // érvénytelen nap → alapérték; zárt napnál megmaradnak a beírt idők
  const hours = defaultRoomsConfig["Opera - Nagy Terem"].hours.map(() => ({ closed: true, open: 9, close: 12 }));
  hours[0] = { closed: false, open: 12, close: 12.5 };
  const room = normalizeRoomConfig("Opera - Nagy Terem", { hours, lessonTypes: ["csoportos", "ismeretlen"] });
  assert.deepEqual(room.hours[0], { closed: false, open: 8, close: 22 });
  assert.deepEqual(room.hours[1], { closed: true, open: 9, close: 12 });
  assert.deepEqual(room.lessonTypes, ["csoportos"]);
});

test("old hardcoded rules are the defaults: group lessons only in Astoria big room", () => {
  for (const [id, room] of Object.entries(defaultRoomsConfig)) {
    assert.equal(room.lessonTypes.includes("csoportos"), id === "Astoria - Nagy Terem");
    assert.deepEqual(weeklyRange(room), { start: 8, end: 22 });
  }
});

test("price depends on room and lesson type", () => {
  const config = customConfig();
  const slot = { room: "Opera - Közepes Terem", date: MONDAY, hour: 10, durationMinutes: 90 };
  assert.equal(bookingPrice(slot, "privat", config), 7500);
  assert.equal(bookingPrice(slot, "csoportos", config), 13500);
  const { booking } = validateBooking({ lessonType: "csoportos", customer, slots: [{ ...slot, price: 1 }] }, now, config);
  assert.equal(booking?.total, 13500);
});

test("allowed lesson types are configurable per room", () => {
  const config = customConfig();
  const slots = [{ room: "Opera - Közepes Terem", date: MONDAY, hour: 10 }];
  assert.ok(validateBooking({ lessonType: "csoportos", customer, slots }, now, config).booking);
  assert.match(validateBooking({ lessonType: "kiscsoportos", customer, slots }, now, config).error ?? "", /óratípus/);
});

test("opening hours are checked per room and weekday", () => {
  const config = customConfig();
  const room = "Opera - Közepes Terem";
  assert.deepEqual(openingFor(config, room, MONDAY), { open: 10, close: 18.5 });
  assert.equal(openingFor(config, room, SUNDAY), null);
  assert.equal(validateBookingTime({ room, date: MONDAY, hour: 10, durationMinutes: 60 }, now, config), null);
  assert.equal(validateBookingTime({ room, date: MONDAY, hour: 17.5, durationMinutes: 60 }, now, config), null);
  assert.match(validateBookingTime({ room, date: MONDAY, hour: 9.5, durationMinutes: 60 }, now, config) ?? "", /10:00 és 18:30/);
  assert.match(validateBookingTime({ room, date: MONDAY, hour: 18, durationMinutes: 60 }, now, config) ?? "", /18:30/);
  assert.match(validateBookingTime({ room, date: SUNDAY, hour: 12, durationMinutes: 60 }, now, config) ?? "", /zárva/);
  // a többi terem változatlan (8–22)
  assert.equal(validateBookingTime({ room: "Astoria - Kis Terem", date: SUNDAY, hour: 8, durationMinutes: 60 }, now, config), null);
});

test("media paths: public folder gets the base path, storage paths the rental bucket", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co/";
  assert.equal(mediaUrl("/rooms/a.jpg"), "/studio-berles/rooms/a.jpg");
  assert.equal(mediaUrl("images/2026/a.webp"), "https://x.supabase.co/storage/v1/object/public/rental/images/2026/a.webp");
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

test("schema seeds the four rooms and allows bookings at any time of day", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    const schema = await readFile(new URL("../supabase/studio-bookings.sql", import.meta.url), "utf8");
    await db.exec(schema);
    await db.exec("update rental.rooms set data = '{\"name\":\"Átnevezve\"}' where id = 'Astoria - Kis Terem'");
    await db.exec(schema); // újrafuttatható, nem írja felül a beállításokat
    const rows = (await db.query<{ id: string; data: unknown }>("select id, data from rental.rooms order by sort")).rows;
    assert.deepEqual(rows.map((row) => row.id), Object.keys(defaultRoomsConfig));
    assert.equal(roomsConfigFromRows(rows)["Astoria - Kis Terem"].name, "Átnevezve");
    await db.exec("set search_path to rental, public");
    await db.query("select create_studio_request('{}', 'privat', 'early', $1)", [[
      { room: "Astoria - Nagy Terem", date: "2099-10-15", hour: 6.5, durationMinutes: 60, price: 1000 },
      { room: "Astoria - Nagy Terem", date: "2099-10-15", hour: 22.5, durationMinutes: 90, price: 1500 },
    ]]);
    await assert.rejects(db.query("select create_studio_request('{}', 'privat', 'late', $1)", [[
      { room: "Astoria - Nagy Terem", date: "2099-10-16", hour: 23.5, durationMinutes: 60, price: 1000 },
    ]]));
  } finally {
    await db.close();
  }
});
