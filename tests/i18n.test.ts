import test from "node:test";
import assert from "node:assert/strict";
import { validateBooking, validateBookingTime } from "../lib/studio-booking.ts";
import { buildBookingEmail } from "../lib/booking-email.ts";
import {
  defaultRoomsConfig, localizeRoomsConfig, missingTranslationCount, normalizeRoomConfig,
} from "../lib/room-config.ts";
import { alternatePath } from "../lib/i18n.ts";

const now = new Date("2026-10-14T10:00:00Z");
const request = (language?: string) => ({
  ...(language ? { language } : {}),
  lessonType: "privat",
  customer: { name: "Test Customer", email: "test@example.com", phone: "+44 7700 900123" },
  slots: [{ room: "Astoria - Nagy Terem", date: "2026-10-15", hour: 14 }],
});

test("angol foglalás: a nyelv a foglaláshoz kerül, a hibák angolul jönnek", () => {
  const { booking } = validateBooking(request("en"), now);
  assert.equal(booking?.customer.language, "en");
  const bad = { ...request("en"), customer: { ...request().customer, phone: "123" } };
  assert.equal(validateBooking(bad, now).error, "Please enter a valid phone number starting with a country code.");
  assert.equal(validateBookingTime({ room: "Astoria - Nagy Terem", date: "2026-10-15", hour: 23, durationMinutes: 60 }, now, undefined, "en"),
    "On this day the room can be booked between 08:00 and 22:00.");
});

test("nyelv nélkül vagy ismeretlen nyelvvel minden marad magyar", () => {
  assert.equal(validateBooking(request(), now).booking?.customer.language, "hu");
  assert.equal(validateBooking(request("de"), now).booking?.customer.language, "hu");
  const bad = { ...request("de"), customer: { ...request().customer, phone: "123" } };
  assert.equal(validateBooking(bad, now).error, "Adj meg országkóddal kezdődő, érvényes telefonszámot.");
});

test("a stúdió e-mailje magyar marad, de jelzi az angol foglalást", () => {
  const { booking } = validateBooking(request("en"), now);
  const email = buildBookingEmail(
    { ...booking!, slots: booking!.slots.map((s) => ({ ...s, id: "00000000-0000-4000-8000-000000000001" })) },
    { token: "a".repeat(64), baseUrl: "http://localhost:3000" },
  );
  assert.ok(email.subject.startsWith("[EN] Új stúdiófoglalási igény"));
  assert.ok(email.text.includes("Nyelv: angol"));
  assert.ok(email.html.includes("Nyelv: angol"));
  const hu = validateBooking(request(), now).booking!;
  assert.ok(!buildBookingEmail(hu, { token: "a".repeat(64), baseUrl: "http://localhost:3000" }).text.includes("Nyelv: angol"));
});

test("terem angol szövegei: üres mező → magyar, kitöltött → angol", () => {
  const room = normalizeRoomConfig("Astoria - Nagy Terem", {
    en: { name: "Large Room", description: "  ", extras: ["Changing room and shower", ""], unknown: "x" },
  });
  assert.deepEqual(room.en, { name: "Large Room", description: "  ", extras: ["Changing room and shower"] });
  const config = localizeRoomsConfig({ ...defaultRoomsConfig, "Astoria - Nagy Terem": room }, "en");
  const en = config["Astoria - Nagy Terem"];
  assert.equal(en.name, "Large Room");
  assert.equal(en.description, defaultRoomsConfig["Astoria - Nagy Terem"].description);
  assert.equal(en.location, "Astoria stúdió");
  assert.deepEqual(en.extras, ["Changing room and shower", "Ingyenes Wi-Fi", "Ivóvíz-adagoló"]);
  // a magyar oldal érintetlen
  assert.equal(localizeRoomsConfig(config, "hu"), config);
  assert.equal(missingTranslationCount(room), 6 + 2);
});

test("régi adat (angol szöveg nélkül) változatlanul olvasható", () => {
  assert.equal("en" in normalizeRoomConfig("Opera - Nagy Terem", {}), false);
  assert.deepEqual(normalizeRoomConfig("Opera - Nagy Terem", {}), defaultRoomsConfig["Opera - Nagy Terem"]);
});

test("nyelvváltó: ugyanaz az oldal a másik nyelven", () => {
  assert.equal(alternatePath("/", "hu"), "/en");
  assert.equal(alternatePath("/adatkezeles", "hu"), "/en/privacy");
  assert.equal(alternatePath("/en", "en"), "/");
  assert.equal(alternatePath("/en/privacy", "en"), "/adatkezeles");
});

test("szövegek: hiányzó adat → alapérték, angolul üres → magyar", async () => {
  const { defaultPageContent, localizePageContent, normalizePageContent } = await import("../lib/page-content.ts");
  assert.deepEqual(normalizePageContent(undefined), defaultPageContent);
  const saved = normalizePageContent({
    hu: { lessonTitle: "Új cím", lessons: { privat: { capacity: "4 fő" } }, intro: ["Egy bekezdés"] },
    en: { lessonTitle: "", intro: ["", " "], studios: [] },
  });
  assert.equal(saved.hu.lessons.privat.capacity, "4 fő");
  assert.equal(saved.hu.lessons.privat.title, "Privát óra");
  const en = localizePageContent(saved, "en");
  assert.equal(en.lessonTitle, "Új cím");
  assert.deepEqual(en.intro, ["Egy bekezdés"]);
  assert.equal(en.studios, saved.hu.studios);
  assert.equal(en.approvalTitle, "Booking approval");
  assert.equal(localizePageContent(saved, "hu"), saved.hu);
});
