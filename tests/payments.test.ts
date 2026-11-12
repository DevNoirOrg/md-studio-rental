import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  budapestInstant, checkoutExpiry, computeDue, firstStart, overdueNoticeAt, paymentToken, reminderDue, verifyPaymentToken,
} from "../lib/payment-rules.ts";
import { formEncode, verifyStripeSignature } from "../lib/stripe.ts";
import {
  codeFor, defaultPaymentSettings, hasCodePlaceholder, normalizePaymentSettings, renderAccessText, studioOf,
} from "../lib/payment-settings.ts";
import { documentPayload, partnerPayload } from "../lib/billingo.ts";
import {
  accessEmail, dayReminderEmail, decisionEmail, expiredEmail, overdueEmail, receivedEmail, reminderEmail, studioNoticeEmail,
} from "../lib/customer-emails.ts";

const HOUR = 3_600_000;

test("budapesti idő → UTC (téli és nyári időszámítás)", () => {
  assert.equal(new Date(budapestInstant("2026-01-15", 14)).toISOString(), "2026-01-15T13:00:00.000Z");
  assert.equal(new Date(budapestInstant("2026-07-15", 14.5)).toISOString(), "2026-07-15T12:30:00.000Z");
  assert.equal(firstStart([{ date: "2026-07-16", hour: 9 }, { date: "2026-07-15", hour: 18 }]), budapestInstant("2026-07-15", 18));
  assert.equal(firstStart([]), null);
});

test("fizetési határidő: közeli foglalásnál nincs, különben 24 óra (legkésőbb az időpontig); kikapcsolva nincs", () => {
  const now = Date.parse("2026-11-10T10:00:00Z");
  const settings = { deadlineEnabled: true, nearHours: 48, payWithinHours: 24 };
  assert.equal(computeDue(now, now + 10 * 24 * HOUR, settings), now + 24 * HOUR);
  assert.equal(computeDue(now, now + 49 * HOUR, settings), now + 24 * HOUR);
  // 48 órán belül: nincs határidő, nem szabadul fel
  assert.equal(computeDue(now, now + 48 * HOUR, settings), null);
  assert.equal(computeDue(now, now + 2 * HOUR, settings), null);
  // a fizetési idő nem nyúlhat az időpont kezdete utánra
  assert.equal(computeDue(now, now + 30 * HOUR, { deadlineEnabled: true, nearHours: 12, payWithinHours: 48 }), now + 30 * HOUR);
  assert.equal(computeDue(now, now + 10 * 24 * HOUR, { ...settings, deadlineEnabled: false }), null);
});

test("„még nem rendezted” e-mail: az utolsó időpont utáni nap 10:00 (Budapest)", () => {
  assert.equal(new Date(overdueNoticeAt("2026-11-20")).toISOString(), "2026-11-21T09:00:00.000Z");
  assert.equal(new Date(overdueNoticeAt("2026-07-31")).toISOString(), "2026-08-01T08:00:00.000Z");
  assert.equal(new Date(overdueNoticeAt("2026-12-31")).toISOString(), "2027-01-01T09:00:00.000Z");
});

test("havi bejutási kód: a foglalás napjának hónapja szerint, hiányzó kódnál „hamarosan küldjük”", () => {
  const settings = normalizePaymentSettings({
    codes: { opera: [{ month: "2026-12", code: "5678" }, { month: "2026-11", code: " 1234 " }, { month: "rossz", code: "x" }] },
  });
  assert.deepEqual(settings.codes.opera.map((c) => c.month), ["2026-11", "2026-12"]);
  assert.deepEqual(settings.codes.astoria, []);
  assert.equal(codeFor(settings, "opera", "2026-11-30"), "1234");
  assert.equal(codeFor(settings, "opera", "2026-12-01"), "5678");
  assert.equal(codeFor(settings, "opera", "2027-01-05"), null);
  assert.equal(codeFor(settings, "astoria", "2026-11-30"), null);

  assert.deepEqual(renderAccessText("Kapukód: {KÓD}, majd {kód}#", "1234", "hu"), { text: "Kapukód: 1234, majd 1234#", missing: false });
  assert.deepEqual(renderAccessText("Door code: {CODE}", null, "en"), { text: "Door code: (we'll send you the entry code separately shortly)", missing: true });
  assert.deepEqual(renderAccessText("Csengess a 3-ason", null, "hu"), { text: "Csengess a 3-ason", missing: false });
  assert.equal(hasCodePlaceholder("kód: { KOD }"), true);
  assert.equal(hasCodePlaceholder("kód nélkül"), false);
});

test("Stripe fizetési oldal lejárata: 30 perc – 24 óra, nem a határidő után", () => {
  const now = Date.parse("2026-11-10T10:00:00Z");
  assert.equal(checkoutExpiry(now, now + 72 * HOUR), Math.floor((now + 23.5 * HOUR) / 1000));
  assert.equal(checkoutExpiry(now, now + 5 * HOUR), Math.floor((now + 5 * HOUR) / 1000));
  assert.equal(checkoutExpiry(now, now + 20 * 60_000), null);
  // határidő nélkül (közeli foglalás): az időpont után is lehet fizetni
  assert.equal(checkoutExpiry(now, Number.POSITIVE_INFINITY), Math.floor((now + 23.5 * HOUR) / 1000));
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
  const s = normalizePaymentSettings({ enabled: true, deadlineHours: 72, nearHours: 0, payWithinHours: 12.4, billingoBlockId: "12", access: { opera: { hu: "Kapukód: 1234" } } });
  assert.equal(s.enabled, true);
  assert.equal(s.nearHours, 1);
  assert.equal(s.payWithinHours, 12);
  assert.equal("deadlineHours" in s, false);
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
  assert.ok(!access.text.includes("24 órával"));

  // fizetés után, a későbbi napok bejutási infói 24 órával előtte mennek
  const later = accessEmail({ locale: "hu", name: "Elek", slots, paid: true, invoiceByEmail: false, access: [], laterNote: true });
  assert.ok(later.text.includes("A bejutási infókat az időpont előtt 24 órával e-mailben küldjük."));
  assert.ok(!later.text.includes("BEJUTÁSI"));

  // emlékeztető 24 órával előtte: fizetve → bejutási infók; nincs fizetve → fizetési link, kód nélkül
  const paidDay = dayReminderEmail({ locale: "hu", name: "Elek", slots: [slots[1]], access: [{ studio: "Opera stúdió", text: "Kapukód: 1234" }], paymentUrl: null });
  assert.ok(paidDay.text.includes("Kapukód: 1234"));
  assert.ok(!paidDay.text.includes("Fizetés:"));
  const unpaidDay = dayReminderEmail({ locale: "en", name: "Alex", slots: [slots[1]], access: null, paymentUrl: "https://x.test/p" });
  assert.ok(unpaidDay.text.includes("Pay now: https://x.test/p"));
  assert.ok(!/tomorrow/i.test(unpaidDay.subject));
  assert.ok(overdueEmail({ locale: "hu", name: "Elek", slots, paymentUrl: "https://x.test/p" }).text.includes("Fizetés: https://x.test/p"));

  // a felhasználói adat nem kerülhet HTML-ként az e-mailbe
  const xss = receivedEmail({ locale: "hu", name: "<img src=x onerror=alert(1)>", slots, paymentsEnabled: true });
  assert.ok(!xss.html.includes("<img src=x"));
});

test("stúdió értesítő: magyar, az angol foglalás jelölve", () => {
  const notice = studioNoticeEmail({ kind: "paid", customer: { name: "Alex", email: "a@b.com", phone: "+44", language: "en" }, slots });
  assert.ok(notice.subject.startsWith("Fizetés érkezett – Alex (EN)"));
  assert.ok(notice.text.includes("Nyelv: angol"));
});
