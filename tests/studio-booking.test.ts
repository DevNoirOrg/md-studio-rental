import test from "node:test";
import assert from "node:assert/strict";
import { validateBooking, emailPattern, overlaps, formatBookingHour, canRescheduleBooking } from "../lib/studio-booking.ts";
import { buildBookingEmail } from "../lib/booking-email.ts";

const now = new Date("2026-10-14T10:00:00Z");
const emailOptions = { token: "a".repeat(64), baseUrl: "http://localhost:3000" };
const withSlotIds = (booking) => ({
  ...booking, slots: booking.slots.map((slot, index) => ({
    ...slot, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  })),
});
const request = () => ({
  lessonType: "privat",
  customer: { name: "Teszt Elek", email: "teszt@example.hu", phone: "+36 (30) 123-4567" },
  slots: [
    { room: "Astoria - Nagy Terem", date: "2026-10-15", hour: 14, price: 1 },
    { room: "Opera - Közepes Terem", date: "2026-10-15", hour: 14, price: 1 },
  ],
  total: 2,
});

test("prices come from the server catalogue, not client prices", () => {
  const { booking, error } = validateBooking(request(), now);
  assert.equal(error, undefined);
  assert.deepEqual(booking.slots.map((slot) => slot.price), [1000, 4000]);
  assert.equal(booking.total, 5000);
});

test("contact validation requires name, domain extension and international phone", () => {
  for (const change of [
    { name: " " }, { email: "teszt@example" }, { email: "teszt@.hu" },
    { email: "teszt@example..hu" }, { email: "teszt@example.c" },
    { email: "a b@example.hu" }, { phone: "06301234567" }, { phone: "+" },
  ]) {
    const input = request();
    Object.assign(input.customer, change);
    assert.ok(validateBooking(input, now).error);
  }
  for (const email of ["teszt@example.com", "a+b@studio.example.org", "teszt@example.co.uk"]) {
    const input = request();
    input.customer.email = email;
    assert.ok(validateBooking(input, now).booking);
    assert.ok(new RegExp(`^(?:${emailPattern})$`, "v").test(email));
  }
});

test("rejects invalid dates, past/duplicate slots and capacity mismatch", () => {
  for (const change of [
    { date: "2026-02-30" }, { date: "2026-10-13" },
    { date: "2026-10-14", hour: 12 },
    { room: "Unknown room" }, { hour: 22 }, { hour: 8.25 }, { hour: "10.5" }, { date: "0000-00-00" },
  ]) {
    const input = request();
    Object.assign(input.slots[0], change);
    assert.ok(validateBooking(input, now).error);
  }
  const duplicate = request();
  duplicate.slots.push(duplicate.slots[0]);
  assert.ok(validateBooking(duplicate, now).error);
  const group = request();
  group.lessonType = "csoportos";
  assert.ok(validateBooking(group, now).error);
  group.slots = [group.slots[0]];
  assert.ok(validateBooking(group, now).booking);
  assert.ok(validateBooking({ ...request(), slots: [] }, now).error);
  assert.ok(validateBooking(null, now).error);
});

test("half-hour starts and duration pricing respect minimum, closing and overlap", () => {
  const input = request();
  input.slots = [{ room: "Astoria - Nagy Terem", date: "2026-10-15", hour: 10.5, durationMinutes: 90 }];
  const { booking } = validateBooking(input, now);
  assert.equal(booking.total, 1500);
  assert.ok(buildBookingEmail(withSlotIds(booking), emailOptions).text.includes("10:30–12:00"));
  assert.equal(formatBookingHour(21.5), "21:30");
  for (const change of [
    { durationMinutes: 30 }, { durationMinutes: 75 }, { durationMinutes: -60 },
    { hour: 21.5 }, { hour: 21, durationMinutes: 90 },
  ]) {
    assert.ok(validateBooking({ ...input, slots: [{ ...input.slots[0], ...change }] }, now).error);
  }
  assert.ok(validateBooking({ ...input, slots: [{ ...input.slots[0], hour: 20.5 }] }, now).booking);
  const adjacent = { ...input.slots[0], hour: 12, durationMinutes: 60 };
  assert.equal(overlaps(input.slots[0], adjacent), false);
  assert.ok(validateBooking({ ...input, slots: [input.slots[0], adjacent] }, now).booking);
  assert.ok(validateBooking({ ...input, slots: [input.slots[0], { ...adjacent, hour: 11.5 }] }, now).error);
  const today = { ...input.slots[0], date: "2026-10-14", hour: 12.5 };
  assert.ok(validateBooking({ ...input, slots: [today] }, now).booking);
});

test("calendar rescheduling checks the entire original duration and ignores only the original booking", () => {
  const booking = { id: "original", room: "Opera - Közepes Terem", date: "2026-10-15", hour: 10, durationMinutes: 90 };
  const occupied = { ...booking, id: "other", hour: 14 };
  const slots = [booking, occupied];
  const target = { ...booking, hour: 10.5 };
  assert.equal(canRescheduleBooking(booking, target, slots, now), true);
  assert.equal(canRescheduleBooking(booking, { ...target, hour: 12.5 }, slots, now), true);
  assert.equal(canRescheduleBooking(booking, { ...target, hour: 13 }, slots, now), false);
  assert.equal(canRescheduleBooking(booking, { ...target, hour: 14.5 }, slots, now), false);
  assert.equal(canRescheduleBooking(booking, { ...target, hour: 15.5 }, slots, now), true);
  assert.equal(canRescheduleBooking(booking, { ...target, hour: 20.5 }, slots, now), true);
  for (const change of [
    { room: "Astoria - Nagy Terem" }, { durationMinutes: 60 }, { hour: 21 },
    { hour: 7.5 }, { hour: 10.25 }, { date: "2026-10-13" }, { date: "2026-02-30" },
  ]) assert.equal(canRescheduleBooking(booking, { ...target, ...change }, slots, now), false);
  assert.equal(canRescheduleBooking(booking, { ...target, date: "2026-10-16", hour: 14 }, slots, now), true);
  assert.equal(canRescheduleBooking(booking, target, [...slots, { ...target, id: "new-conflict" }], now), false);
});

test("previously demo-occupied slots pass validation for all rooms and hours", () => {
  for (const room of ["Astoria - Nagy Terem", "Astoria - Kis Terem", "Opera - Nagy Terem", "Opera - Közepes Terem"]) {
    for (let hour = 8; hour <= 21; hour++) {
      const input = request();
      input.slots = [{ room, date: "2026-10-15", hour }];
      assert.ok(validateBooking(input, now).booking);
    }
  }
});

test("email includes all validated lesson types in HTML and plain text", () => {
  for (const [lessonType, label] of [
    ["privat", "Privát óra"],
    ["kiscsoportos", "Kiscsoportos óra"],
    ["csoportos", "Csoportos óra"],
  ]) {
    const input = request();
    input.lessonType = lessonType;
    input.slots = [input.slots[0]];
    const { booking, error } = validateBooking(input, now);
    assert.equal(error, undefined);
    assert.equal(booking.lessonType, lessonType);
    const email = buildBookingEmail(withSlotIds(booking), emailOptions);
    assert.ok(email.text.includes(`Óratípus: ${label}`));
    assert.ok(email.html.includes(`<strong>Óratípus:</strong> ${label}`));
  }
});

test("email has separate slots, contacts, total and protected decision links", () => {
  const input = request();
  input.customer.name = '<img src=x onerror="alert(1)">';
  const { booking } = validateBooking(input, now);
  const email = buildBookingEmail(withSlotIds(booking), emailOptions);
  for (const room of booking.slots.map((slot) => slot.room)) {
    assert.ok(email.html.includes(room));
    assert.ok(email.text.includes(room));
  }
  assert.ok(email.text.includes("14:00–15:00"));
  assert.ok(email.text.includes("2026. október 15."));
  assert.ok(email.text.includes(booking.customer.email));
  assert.ok(email.text.includes(booking.customer.phone));
  assert.ok(email.text.includes(new Intl.NumberFormat("hu-HU", {
    style: "currency", currency: "HUF", maximumFractionDigits: 0,
  }).format(5000)));
  assert.equal((email.html.match(/>Jóváhagyás</g) || []).length, 2);
  assert.equal((email.html.match(/>Elutasítás</g) || []).length, 2);
  assert.ok(email.html.includes("Összes Foglalás Jóváhagyása"));
  assert.ok(email.html.includes("&lt;img"));
  assert.ok(!email.html.includes("<img"));
  assert.ok(!/<button|<form/.test(email.html));
  assert.equal((email.html.match(/href=/g) || []).length, 5);
  assert.ok(email.text.includes("action=approve-all"));
  assert.ok(email.text.includes("action=reject&slot=00000000-0000-4000-8000-000000000002"));
  assert.ok(email.text.includes(`token=${emailOptions.token}`));
});
