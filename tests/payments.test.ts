import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  budapestInstant, checkoutExpiry, computeDue, firstStart, paymentToken, reminderDue, verifyPaymentToken,
} from "../lib/payment-rules.ts";
import { formEncode, verifyStripeSignature } from "../lib/stripe.ts";
import { normalizePaymentSettings, studioOf, defaultPaymentSettings } from "../lib/payment-settings.ts";
import { documentPayload, partnerPayload } from "../lib/billingo.ts";
import {
  accessEmail, decisionEmail, expiredEmail, receivedEmail, reminderEmail, studioNoticeEmail,
} from "../lib/customer-emails.ts";

const HOUR = 3_600_000;

test("budapesti idő → UTC (téli és nyári időszámítás)", () => {
  assert.equal(new Date(budapestInstant("2026-01-15", 14)).toISOString(), "2026-01-15T13:00:00.000Z");
  assert.equal(new Date(budapestInstant("2026-07-15", 14.5)).toISOString(), "2026-07-15T12:30:00.000Z");
  assert.equal(firstStart([{ date: "2026-07-16", hour: 9 }, { date: "2026-07-15", hour: 18 }]), budapestInstant("2026-07-15", 18));
  assert.equal(firstStart([]), null);
});

test("fizetési határidő: N óra, de legkésőbb 2 órával az első időpont előtt; kikapcsolva nincs", () => {
  const now = Date.parse("2026-11-10T10:00:00Z");
  const settings = { deadlineEnabled: true, deadlineHours: 48 };
  assert.equal(computeDue(now, now + 10 * 24 * HOUR, settings), now + 48 * HOUR);
  assert.equal(computeDue(now, now + 20 * HOUR, settings), now + 18 * HOUR);
  // nagyon közeli időpont: legalább 1 óra jár a fizetésre, de nem az időpont kezdete után
  assert.equal(computeDue(now, now + 2 * HOUR, settings), now + HOUR);
  assert.equal(computeDue(now, now + 30 * 60_000, settings), now + 30 * 60_000);
  assert.equal(computeDue(now, now + 10 * 24 * HOUR, { deadlineEnabled: false, deadlineHours: 48 }), null);
});

test("Stripe fizetési oldal lejárata: 30 perc – 24 óra, nem a határidő után", () => {
  const now = Date.parse("2026-11-10T10:00:00Z");
  assert.equal(checkoutExpiry(now, now + 72 * HOUR), Math.floor((now + 23.5 * HOUR) / 1000));
  assert.equal(checkoutExpiry(now, now + 5 * HOUR), Math.floor((now + 5 * HOUR) / 1000));
  assert.equal(checkoutExpiry(now, now + 20 * 60_000), null);
});

test("emlékeztető: 12 órával a határidő előtt, csak ha elég hosszú volt a fizetési idő", () => {
  const notified = Date.parse("2026-11-10T10:00:00Z");
  const due = notified + 48 * HOUR;
  assert.equal(reminderDue(due - 13 * HOUR, due, notified), false);
  assert.equal(reminderDue(due - 11 * HOUR, due, notified), true);
  assert.equal(reminderDue(due + 1, due, notified), false);
  // rövid (pl. 10 órás) határidőnél nincs külön emlékeztető
  assert.equal(reminderDue(notified + HOUR, notified + 10 * HOUR, notified), false);
});

test("fizetési link token: aláírt, nem hamisítható", () => {
  const id = "3f2c1e0a-1b2c-4d5e-8f90-0123456789ab";
  const token = paymentToken(id, "secret");
  assert.equal(verifyPaymentToken(id, token, "secret"), true);
  assert.equal(verifyPaymentToken(id, token, "other"), false);
  assert.equal(verifyPaymentToken("3f2c1e0a-1b2c-4d5e-8f90-0123456789ac", token, "secret"), false);
  assert.equal(verifyPaymentToken(id, "x".repeat(64), "secret"), false);
  assert.equal(verifyPaymentToken("not-a-uuid", token, "secret"), false);
});

test("Stripe webhook aláírás ellenőrzése", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_800_000_000;
  const sig = createHmac("sha256", "whsec_test").update(`${now}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${now},v1=${sig}`, "whsec_test", now), true);
  assert.equal(verifyStripeSignature(payload, `t=${now},v1=${sig}`, "whsec_other", now), false);
  assert.equal(verifyStripeSignature(payload + " ", `t=${now},v1=${sig}`, "whsec_test", now), false);
  assert.equal(verifyStripeSignature(payload, `t=${now},v1=${sig}`, "whsec_test", now + 600), false);
  assert.equal(verifyStripeSignature(payload, null, "whsec_test", now), false);
});

test("Stripe form-kódolás beágyazott mezőkkel", () => {
  const body = formEncode({ mode: "payment", line_items: [{ quantity: 1, price_data: { currency: "huf", unit_amount: 1500000 } }], metadata: { request_id: "x" } });
  const params = new URLSearchParams(body);
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "1500000");
  assert.equal(params.get("metadata[request_id]"), "x");
});

test("fizetési beállítások: hiányzó adat → alapérték, hibás érték kiszűrve", () => {
  assert.deepEqual(normalizePaymentSettings(undefined), defaultPaymentSettings);
  const s = normalizePaymentSettings({ enabled: true, deadlineHours: 0, billingoBlockId: "12", access: { opera: { hu: "Kapukód: 1234" } } });
  assert.equal(s.enabled, true);
  assert.equal(s.deadlineHours, 1);
  assert.equal(s.billingoBlockId, null);
  assert.equal(s.access.opera.hu, "Kapukód: 1234");
  assert.equal(s.access.astoria.hu, "");
  assert.equal(studioOf("Opera - Közepes Terem"), "opera");
  assert.equal(studioOf("Astoria - Kis Terem"), "astoria");
});

test("Billingo: magánszemély / cég / külföldi vevő és bruttó óradíjas tételek", () => {
  const base = { name: "Teszt Elek", email: "a@b.hu", country: "HU", postCode: "1052", city: "Budapest", address: "Semmelweis u. 1." };
  assert.equal(partnerPayload(base).tax_type, "NO_TAX_NUMBER");
  assert.equal(partnerPayload({ ...base, taxNumber: "12345678-1-42" }).tax_type, "HAS_TAX_NUMBER");
  assert.equal(partnerPayload({ ...base, country: "de" }).tax_type, "FOREIGN");
  const doc = documentPayload({
    type: "invoice", partnerId: 1, blockId: 2, bankAccountId: null, vat: "27%", language: "hu", date: "2026-11-10",
    lines: [{ name: "Teremhasználat", grossPrice: 4500, hours: 1.5 }], comment: "",
  });
  assert.equal(doc.paid, true);
  assert.equal(doc.items[0].unit_price, 3000);
  assert.equal(doc.items[0].quantity, 1.5);
  assert.equal(doc.items[0].unit_price_type, "gross");
  assert.equal("bank_account_id" in doc, false);
  // teszt üzemmód: díjbekérő, „fizetve” jelölés nélkül
  const proforma = documentPayload({
    type: "proforma", partnerId: 1, blockId: 3, bankAccountId: null, vat: "TAM", language: "hu", date: "2026-11-10",
    lines: [{ name: "Teremhasználat", grossPrice: 4000, hours: 1 }], comment: "",
  });
  assert.equal(proforma.type, "proforma");
  assert.equal("paid" in proforma, false);
  assert.equal(proforma.items[0].vat, "TAM");
});

const slots = [
  { roomLabel: "Astoria stúdió · Nagy Terem", date: "2026-11-20", hour: 14, durationMinutes: 90, price: 15000 },
  { roomLabel: "Opera stúdió · Nagy Terem", date: "2026-11-21", hour: 10, durationMinutes: 60, price: 9000 },
];

test("ügyfél-e-mailek: magyarul és angolul, a dinamikus részekkel", () => {
  const received = receivedEmail({ locale: "hu", name: "Elek", slots, paymentsEnabled: true });
  assert.ok(received.text.includes("14:00–15:30"));
  assert.match(received.text, /Összesen: 24\s000/);
  assert.ok(received.text.includes("fizetési linket"));
  assert.ok(receivedEmail({ locale: "en", name: "Alex", slots, paymentsEnabled: false }).subject.startsWith("We've received"));

  const accepted = decisionEmail({ locale: "hu", name: "Elek", approved: [slots[0]], rejected: [slots[1]], paymentUrl: "https://x.test/fizetes?r=1&t=2", due: "2026-11-12T10:00:00Z" });
  assert.ok(accepted.text.includes("Fizetés: https://x.test/fizetes?r=1&t=2"));
  assert.ok(accepted.text.includes("nem tudjuk vállalni"));
  assert.ok(accepted.html.includes("line-through"));
  const noLink = decisionEmail({ locale: "en", name: "Alex", approved: slots, rejected: [], paymentUrl: null, due: null });
  assert.ok(noLink.text.includes("We'll send you payment details separately."));
  assert.ok(!noLink.text.includes("Pay now"));
  const rejected = decisionEmail({ locale: "hu", name: "Elek", approved: [], rejected: slots, paymentUrl: null, due: null });
  assert.ok(rejected.subject.includes("nem tudjuk elfogadni"));

  assert.ok(reminderEmail({ locale: "en", name: "Alex", slots, paymentUrl: "https://x.test/p", due: "2026-11-12T10:00:00Z" }).text.includes("https://x.test/p"));
  assert.ok(expiredEmail({ locale: "hu", name: "Elek", slots }).subject.startsWith("Lejárt"));

  const access = accessEmail({
    locale: "hu", name: "Elek", slots, paid: true, invoiceByEmail: true,
    access: [{ studio: "Astoria stúdió", text: "Kapukód: 1234\n2. emelet" }, { studio: "Opera stúdió", text: "Csengess" }],
  });
  assert.ok(access.html.includes("Kapukód: 1234<br>2. emelet"));
  assert.ok(access.text.includes("A számlát külön e-mailben küldjük."));
  assert.ok(access.subject.startsWith("Sikeres fizetés"));

  // a felhasználói adat nem kerülhet HTML-ként az e-mailbe
  const xss = receivedEmail({ locale: "hu", name: "<img src=x onerror=alert(1)>", slots, paymentsEnabled: true });
  assert.ok(!xss.html.includes("<img src=x"));
});

test("stúdió értesítő: magyar, az angol foglalás jelölve", () => {
  const notice = studioNoticeEmail({ kind: "paid", customer: { name: "Alex", email: "a@b.com", phone: "+44", language: "en" }, slots });
  assert.ok(notice.subject.startsWith("Fizetés érkezett – Alex (EN)"));
  assert.ok(notice.text.includes("Nyelv: angol"));
});
