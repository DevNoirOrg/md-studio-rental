import { after } from "next/server";
import { bookingStore } from "./booking-store.ts";
import { withBase } from "./base-path.ts";
import { loadRoomsConfig } from "./rooms-store.ts";
import { defaultRoomsConfig, localizeRoomsConfig, roomLabel, type RoomsConfig } from "./room-config.ts";
import type { Customer } from "./studio-booking.ts";
import type { Locale } from "./i18n.ts";
import { codeFor, renderAccessText, studioOf, STUDIO_NAMES, type PaymentSettings, type Studio } from "./payment-settings.ts";
import { loadPaymentSettings } from "./payment-settings-store.ts";
import {
  ACCESS_REMINDER_BEFORE_MS, budapestInstant, checkoutExpiry, computeDue, firstStart, overdueNoticeAt, paymentToken, reminderDue,
} from "./payment-rules.ts";
import { createCheckoutSession, expireCheckoutSession, retrieveCheckoutSession, stripeConfigured, stripeTestMode, type CheckoutSession } from "./stripe.ts";
import { billingoConfigured, createInvoice, sendInvoice, type BillingAddress } from "./billingo.ts";
import { mailConfigured, sendMail, studioRecipient, studioReplyTo } from "./mailer.ts";
import {
  accessEmail, dayReminderEmail, decisionEmail, expiredEmail, formatDay, overdueEmail, receivedEmail, reminderEmail, studioNoticeEmail,
  type EmailSlot,
} from "./customer-emails.ts";
import { formatBookingHour } from "./studio-booking.ts";
import { scheduleCalendarSync } from "./calendar-schedule.ts";

/*
  A foglalás → döntés → fizetés → számla → bejutási infók folyamata.

    1) foglalás után:   „Beérkezett” e-mail az ügyfélnek (sendReceivedEmail)
    2) ha az igény minden időpontjáról döntöttek (notifyDecisionIfComplete):
         elfogadott időpont(ok) → „Elfogadtuk” e-mail fizetési linkkel (ha az online fizetés be van
         kapcsolva; ilyenkor payment_status = awaiting + határidő), minden elutasítva → „Elutasítva”
    3) Stripe webhook (handleCheckoutCompleted) → fizetve → visszaigazoló e-mail (a 24 órán belüli napok
       bejutási infóival), Billingo számla (a Billingo küldi), értesítő a stúdiónak (runPostPayment)
    4) időzített teendők (runPaymentJobs, óránként): lejárt határidő → időpontok felszabadítása + e-mailek;
       emlékeztető 12 órával a határidő előtt; minden foglalási nap előtt 24 órával emlékeztető (fizetve:
       bejutási infókkal, a hónap kódjával; nincs fizetve: fizetési linkkel); határidő nélküli, ki nem
       fizetett foglalásnál az utolsó időpont utáni nap 10:00-kor „még nem rendezted” e-mail;
       a félbemaradt utófeladatok (számla, e-mail) újrapróbálása

  Minden lépés „lefoglalja” magát egy feltételes adatbázis-frissítéssel (pl. csak ha még nincs
  elküldve), így ugyanaz az e-mail kétszer nem megy ki, akárhányszor fut le a folyamat.
*/

export const REQUEST_SELECT = [
  "id", "customer", "lesson_type", "created_at", "decision_notified_at", "payment_status", "payment_due",
  "payment_reminded_at", "stripe_session_id", "stripe_session_expires_at", "stripe_payment_intent", "paid_at",
  "paid_via", "paid_amount", "billing", "invoice_status", "invoice_id", "invoice_number", "invoice_error",
  "invoice_attempts", "invoice_claimed_at", "access_sent_at", "studio_paid_notified_at", "access_reminders_enabled",
  "payment_overdue_notified_at",
  "studio_slots(id,room,date,hour,duration_minutes,price,status)",
].join(",");

export interface SlotRow {
  id: string;
  room: string;
  date: string;
  hour: number;
  duration_minutes: number;
  price: number;
  status: string;
}

export interface RequestRow {
  id: string;
  customer: Customer;
  lesson_type: string;
  created_at: string;
  decision_notified_at: string | null;
  payment_status: "awaiting" | "paid" | "expired" | null;
  payment_due: string | null;
  payment_reminded_at: string | null;
  stripe_session_id: string | null;
  stripe_session_expires_at: string | null;
  stripe_payment_intent: string | null;
  paid_at: string | null;
  paid_via: "stripe" | "manual" | null;
  paid_amount: number | null;
  billing: BillingAddress | null;
  invoice_status: "pending" | "issued" | "error" | "skipped" | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_error: string | null;
  invoice_attempts: number;
  invoice_claimed_at: string | null;
  access_sent_at: string | null;
  studio_paid_notified_at: string | null;
  access_reminders_enabled: boolean;
  payment_overdue_notified_at: string | null;
  studio_slots: SlotRow[];
}

const nowIso = () => new Date().toISOString();
export const requestLocale = (r: { customer: Customer }): Locale => (r.customer?.language === "en" ? "en" : "hu");
const sortSlots = (slots: SlotRow[]) =>
  [...slots].sort((a, b) => a.date.localeCompare(b.date) || Number(a.hour) - Number(b.hour) || a.room.localeCompare(b.room));
export const approvedSlots = (r: RequestRow) => sortSlots(r.studio_slots.filter((s) => s.status === "approved"));
export const amountOf = (slots: SlotRow[]) => slots.reduce((sum, s) => sum + s.price, 0);

export async function loadRequest(id: string): Promise<RequestRow | null> {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return null;
  const rows = await bookingStore<RequestRow[]>(`studio_requests?select=${REQUEST_SELECT}&id=eq.${id}`);
  return rows?.[0] ?? null;
}

/** Feltételes frissítés: csak akkor ír, ha a feltétel még igaz; visszaadja, hogy sikerült-e (lefoglalás). */
async function claim(id: string, conditions: Record<string, string>, body: Record<string, unknown>): Promise<boolean> {
  const params = new URLSearchParams({ id: `eq.${id}`, ...conditions, select: "id" });
  const rows = await bookingStore<Array<{ id: string }>>(`studio_requests?${params}`, { method: "PATCH", body, returnRepresentation: true });
  return Array.isArray(rows) && rows.length > 0;
}

async function update(id: string, body: Record<string, unknown>): Promise<void> {
  await bookingStore(`studio_requests?id=eq.${id}`, { method: "PATCH", body });
}

/** A naptáresemény címe a fizetési állapottól függ („fizetésre vár”) → újraírás. */
async function refreshCalendar(id: string): Promise<void> {
  try {
    await bookingStore(`studio_slots?request_id=eq.${id}&status=eq.approved`, { method: "PATCH", body: { gcal_dirty: true } });
    scheduleCalendarSync();
  } catch (err) {
    console.error("Calendar refresh after payment change failed.", { message: (err as Error).message });
  }
}

async function roomsFor(locale: Locale): Promise<RoomsConfig> {
  let config = defaultRoomsConfig;
  try {
    config = await loadRoomsConfig();
  } catch {
    // a terem azonosítójával is érthető
  }
  return localizeRoomsConfig(config, locale);
}

export function toEmailSlots(slots: SlotRow[], config: RoomsConfig): EmailSlot[] {
  return slots.map((s) => ({
    roomLabel: roomLabel(config, s.room), date: s.date, hour: Number(s.hour), durationMinutes: s.duration_minutes, price: s.price,
  }));
}

function appBase(): string {
  return (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
}

export function paymentPagePath(locale: Locale): string {
  return locale === "en" ? "/en/payment" : "/fizetes";
}

export function paymentUrl(requestId: string, locale: Locale): string {
  return `${appBase()}${withBase(paymentPagePath(locale))}?r=${requestId}&t=${paymentToken(requestId)}`;
}

/** Az online fizetés működik-e most (bekapcsolva az adminban és van Stripe kulcs). */
export function paymentsActive(settings: PaymentSettings): boolean {
  return settings.enabled && stripeConfigured();
}

async function mailCustomer(r: RequestRow, rendered: { subject: string; html: string; text: string }): Promise<void> {
  await sendMail({ to: r.customer.email, replyTo: studioReplyTo(), ...rendered });
}

async function mailStudio(kind: "paid" | "expired" | "problem", r: RequestRow, slots: SlotRow[], detail?: string): Promise<void> {
  const to = studioRecipient();
  if (!to) return;
  const config = await roomsFor("hu");
  await sendMail({ to, replyTo: r.customer.email, ...studioNoticeEmail({ kind, customer: r.customer, slots: toEmailSlots(slots, config), detail }) });
}

// ---------------------------------------------------------------------
//  1) Beérkezett a foglalás
// ---------------------------------------------------------------------
export async function sendReceivedEmail(input: {
  customer: Customer;
  slots: Array<{ room: string; date: string; hour: number; durationMinutes: number; price: number }>;
}): Promise<void> {
  if (!mailConfigured()) return;
  const locale: Locale = input.customer.language === "en" ? "en" : "hu";
  const [config, settings] = await Promise.all([roomsFor(locale), loadPaymentSettings()]);
  const slots = input.slots.map((s) => ({ roomLabel: roomLabel(config, s.room), date: s.date, hour: s.hour, durationMinutes: s.durationMinutes, price: s.price }));
  await sendMail({
    to: input.customer.email, replyTo: studioReplyTo(),
    ...receivedEmail({ locale, name: input.customer.name, slots, paymentsEnabled: paymentsActive(settings) }),
  });
}

// ---------------------------------------------------------------------
//  2) Döntés után: elfogadva (fizetési linkkel) / elutasítva
// ---------------------------------------------------------------------
export async function notifyDecisionIfComplete(requestId: string): Promise<void> {
  const r = await loadRequest(requestId);
  if (!r || r.decision_notified_at || r.payment_status) return;
  if (r.studio_slots.some((s) => s.status === "pending")) return; // még van döntésre váró időpont
  const approved = approvedSlots(r);
  const rejected = sortSlots(r.studio_slots.filter((s) => s.status === "rejected"));
  if (!approved.length && !rejected.length) return;
  if (!(await claim(r.id, { decision_notified_at: "is.null" }, { decision_notified_at: nowIso() }))) return;

  const settings = await loadPaymentSettings();
  const locale = requestLocale(r);
  let link: string | null = null;
  let due: string | null = null;
  try {
    if (approved.length && paymentsActive(settings)) {
      const start = firstStart(approved)!;
      const dueMs = computeDue(Date.now(), start, settings);
      due = dueMs ? new Date(dueMs).toISOString() : null;
      await update(r.id, { payment_status: "awaiting", payment_due: due, access_reminders_enabled: true });
      link = paymentUrl(r.id, locale);
      await refreshCalendar(r.id);
    }
    const config = await roomsFor(locale);
    await mailCustomer(r, decisionEmail({
      locale, name: r.customer.name, approved: toEmailSlots(approved, config), rejected: toEmailSlots(rejected, config),
      paymentUrl: link, due,
    }));
  } catch (err) {
    // a következő döntésnél / admin műveletnél újra megpróbálja
    console.error("Decision email failed.", { message: (err as Error).message });
    await update(r.id, { decision_notified_at: null, payment_status: null, payment_due: null }).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------
//  Az adminban felvett foglalás: fizetési link és/vagy bejutási infók
// ---------------------------------------------------------------------
export async function startAdminBookingFlow(requestId: string, options: { sendPaymentLink: boolean; sendAccess: boolean }): Promise<void> {
  const r = await loadRequest(requestId);
  if (!r) return;
  const settings = await loadPaymentSettings();
  const locale = requestLocale(r);
  const approved = approvedSlots(r);
  const config = await roomsFor(locale);
  if (options.sendPaymentLink && paymentsActive(settings) && approved.length) {
    const dueMs = computeDue(Date.now(), firstStart(approved)!, settings);
    const due = dueMs ? new Date(dueMs).toISOString() : null;
    if (!(await claim(r.id, { decision_notified_at: "is.null" }, {
      decision_notified_at: nowIso(), payment_status: "awaiting", payment_due: due, access_reminders_enabled: true,
    }))) return;
    await refreshCalendar(r.id);
    await mailCustomer(r, decisionEmail({
      locale, name: r.customer.name, approved: toEmailSlots(approved, config), rejected: [], paymentUrl: paymentUrl(r.id, locale), due,
    }));
    return;
  }
  if (options.sendAccess) {
    await update(r.id, { access_reminders_enabled: true });
    await sendAccessInfo(r, settings, { paid: false });
  }
}

// ---------------------------------------------------------------------
//  Bejutási infók: a foglalási nap előtt 24 órával (havi kóddal)
// ---------------------------------------------------------------------
interface BookingDay {
  day: string;
  slots: SlotRow[];
  startMs: number;
  endMs: number;
}

/** Az igény elfogadott időpontjai foglalási naponként (a nap első kezdetével és utolsó végével). */
export function bookingDays(slots: SlotRow[]): BookingDay[] {
  const byDay = new Map<string, SlotRow[]>();
  for (const s of sortSlots(slots)) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  return [...byDay].map(([day, list]) => ({
    day,
    slots: list,
    startMs: Math.min(...list.map((s) => budapestInstant(s.date, Number(s.hour)))),
    endMs: Math.max(...list.map((s) => budapestInstant(s.date, Number(s.hour)) + s.duration_minutes * 60_000)),
  }));
}

/** A nap bejutási infói most esedékesek-e (24 órán belül kezdődik, és még nem ért véget). */
const accessDueNow = (d: BookingDay, now: number) => d.startMs - now <= ACCESS_REMINDER_BEFORE_MS && d.endMs > now;

/** Egy nap bejutási szövegei stúdiónként, a hónap kódjával; missing: a hiányzó kódú stúdiók. */
function accessBlocksFor(settings: PaymentSettings, locale: Locale, d: BookingDay, labelDay: boolean) {
  const studios = [...new Set(d.slots.map((s) => studioOf(s.room)))];
  const missing: Studio[] = [];
  const blocks = studios.map((studio) => {
    const raw = (locale === "en" ? settings.access[studio].en.trim() : "") || settings.access[studio].hu;
    const rendered = renderAccessText(raw, codeFor(settings, studio, d.day), locale);
    if (rendered.missing) missing.push(studio);
    return { studio: labelDay ? `${STUDIO_NAMES[studio]} – ${formatDay(d.day, locale)}` : STUDIO_NAMES[studio], text: rendered.text };
  });
  return { blocks, missing };
}

async function warnMissingCodes(r: RequestRow, d: BookingDay, missing: Studio[]): Promise<void> {
  if (!missing.length) return;
  const month = d.day.slice(0, 7);
  await mailStudio("problem", r, d.slots,
    `Hiányzik a(z) ${missing.map((s) => STUDIO_NAMES[s]).join(", ")} ${month} havi bejutási kódja. Az ügyfél a kód helyett „hamarosan külön küldjük” szöveget kapott — küldd el neki a kódot, és add meg az adminban (Fizetés és e-mailek → Havi kódok).`,
  ).catch((err) => console.error("Missing code notice failed.", { message: (err as Error).message }));
}

type DayClaim = "inserted" | "upgraded" | null;

/** Egy foglalási nap emlékeztetőjének „lefoglalása” (kétszer ne menjen ki); withAccess: a bejutási infókkal. */
async function claimDay(requestId: string, day: string, withAccess: boolean): Promise<DayClaim> {
  const inserted = await bookingStore<Array<{ day: string }>>("access_reminders?on_conflict=request_id,day&select=day", {
    method: "POST", body: { request_id: requestId, day, with_access: withAccess },
    returnRepresentation: true, prefer: "resolution=ignore-duplicates",
  });
  if (Array.isArray(inserted) && inserted.length) return "inserted";
  if (!withAccess) return null;
  // korábban fizetési linkes (kód nélküli) emlékeztető ment → most mehetnek a bejutási infók
  const upgraded = await bookingStore<Array<{ day: string }>>(
    `access_reminders?request_id=eq.${requestId}&day=eq.${day}&with_access=is.false&select=day`,
    { method: "PATCH", body: { with_access: true, sent_at: nowIso() }, returnRepresentation: true },
  );
  return Array.isArray(upgraded) && upgraded.length ? "upgraded" : null;
}

async function releaseDay(requestId: string, day: string, claimed: DayClaim): Promise<void> {
  if (claimed === "inserted") await bookingStore(`access_reminders?request_id=eq.${requestId}&day=eq.${day}`, { method: "DELETE" }).catch(() => {});
  if (claimed === "upgraded") await bookingStore(`access_reminders?request_id=eq.${requestId}&day=eq.${day}`, { method: "PATCH", body: { with_access: false } }).catch(() => {});
}

/**
 * Visszaigazoló e-mail (fizetés után, vagy az admin „bejutási infók küldése”): a 24 órán belüli
 * napok bejutási infóival; a későbbi napokét az időpont előtt 24 órával küldjük (runPaymentJobs).
 */
async function sendAccessInfo(r: RequestRow, settings: PaymentSettings, { paid }: { paid: boolean }): Promise<void> {
  if (!(await claim(r.id, { access_sent_at: "is.null" }, { access_sent_at: nowIso() }))) return;
  const claimed: Array<{ day: string; claim: DayClaim }> = [];
  try {
    const now = Date.now();
    const locale = requestLocale(r);
    const slots = approvedSlots(r);
    const days = bookingDays(slots);
    const soon = days.filter((d) => accessDueNow(d, now));
    const blocks: Array<{ studio: string; text: string }> = [];
    const warnings: Array<{ d: BookingDay; missing: Studio[] }> = [];
    for (const d of soon) {
      const c = await claimDay(r.id, d.day, true);
      if (!c) continue; // ennek a napnak a bejutási infói már kimentek
      claimed.push({ day: d.day, claim: c });
      const rendered = accessBlocksFor(settings, locale, d, soon.length > 1);
      blocks.push(...rendered.blocks);
      warnings.push({ d, missing: rendered.missing });
    }
    const config = await roomsFor(locale);
    await mailCustomer(r, accessEmail({
      locale, name: r.customer.name, slots: toEmailSlots(slots, config), access: blocks, paid,
      invoiceByEmail: paid && billingoConfigured() && !!settings.billingoBlockId,
      laterNote: days.some((d) => d.startMs - now > ACCESS_REMINDER_BEFORE_MS),
    }));
    for (const w of warnings) await warnMissingCodes(r, w.d, w.missing);
  } catch (err) {
    await update(r.id, { access_sent_at: null }).catch(() => {});
    for (const c of claimed) await releaseDay(r.id, c.day, c.claim);
    throw err;
  }
}

/** Emlékeztetők a foglalási napok előtt 24 órával: fizetve → bejutási infókkal, nincs fizetve → fizetési linkkel. */
async function runDayReminders(settings: PaymentSettings, now: number): Promise<number> {
  const from = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now + 2 * 86_400_000).toISOString().slice(0, 10);
  const upcoming = await bookingStore<Array<{ request_id: string }>>(
    `studio_slots?select=request_id&status=eq.approved&date=gte.${from}&date=lte.${to}&limit=500`,
  );
  const ids = [...new Set(upcoming.map((s) => s.request_id).filter(Boolean))];
  if (!ids.length) return 0;
  let sent = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const requests = await bookingStore<RequestRow[]>(
      `studio_requests?select=${REQUEST_SELECT}&access_reminders_enabled=is.true&id=in.(${ids.slice(i, i + 50).join(",")})`,
    );
    for (const r of requests) {
      if (r.payment_status === "expired") continue;
      const withAccess = r.payment_status === "paid" || r.payment_status === null;
      const days = bookingDays(approvedSlots(r)).filter((d) => accessDueNow(d, now));
      for (const d of days) {
        // fizetési linkes emlékeztető ne menjen közvetlenül a (fizetési linket tartalmazó) jóváhagyó e-mail után
        if (!withAccess && (!r.decision_notified_at || Date.parse(r.decision_notified_at) > d.startMs - ACCESS_REMINDER_BEFORE_MS)) continue;
        let c: DayClaim = null;
        try {
          c = await claimDay(r.id, d.day, withAccess);
          if (!c) continue;
          const locale = requestLocale(r);
          const config = await roomsFor(locale);
          const rendered = withAccess ? accessBlocksFor(settings, locale, d, false) : null;
          await mailCustomer(r, dayReminderEmail({
            locale, name: r.customer.name, slots: toEmailSlots(d.slots, config),
            access: rendered?.blocks ?? null, paymentUrl: withAccess ? null : paymentUrl(r.id, locale),
          }));
          sent++;
          if (rendered) await warnMissingCodes(r, d, rendered.missing);
        } catch (err) {
          await releaseDay(r.id, d.day, c);
          console.error("Day reminder failed.", { requestId: r.id, day: d.day, message: (err as Error).message });
        }
      }
    }
  }
  return sent;
}

/** Határidő nélküli, ki nem fizetett foglalás: az utolsó időpont utáni napon 10:00-kor egy „még nem rendezted” e-mail. */
async function runOverdueNotices(now: number): Promise<number> {
  const rows = await bookingStore<RequestRow[]>(
    `studio_requests?select=${REQUEST_SELECT}&payment_status=eq.awaiting&payment_due=is.null&payment_overdue_notified_at=is.null&limit=200`,
  );
  let sent = 0;
  for (const r of rows) {
    const slots = approvedSlots(r);
    if (!slots.length || now < overdueNoticeAt(slots[slots.length - 1].date)) continue;
    try {
      if (!(await claim(r.id, { payment_overdue_notified_at: "is.null", payment_status: "eq.awaiting" }, { payment_overdue_notified_at: nowIso() }))) continue;
      const locale = requestLocale(r);
      const config = await roomsFor(locale);
      try {
        await mailCustomer(r, overdueEmail({ locale, name: r.customer.name, slots: toEmailSlots(slots, config), paymentUrl: paymentUrl(r.id, locale) }));
      } catch (err) {
        await update(r.id, { payment_overdue_notified_at: null }).catch(() => {});
        throw err;
      }
      sent++;
    } catch (err) {
      console.error("Overdue notice failed.", { requestId: r.id, message: (err as Error).message });
    }
  }
  return sent;
}

// ---------------------------------------------------------------------
//  Fizetési oldal → Stripe Checkout
// ---------------------------------------------------------------------
export type CheckoutResult = { url: string } | { error: "not-awaiting" | "expired" | "too-late" | "nothing-to-pay" | "failed" };

export async function startCheckout(r: RequestRow): Promise<CheckoutResult> {
  if (r.payment_status !== "awaiting") return { error: r.payment_status === "expired" ? "expired" : "not-awaiting" };
  const slots = approvedSlots(r);
  if (!slots.length) return { error: "nothing-to-pay" };
  const now = Date.now();
  const dueMs = r.payment_due ? Date.parse(r.payment_due) : null;
  if (dueMs && dueMs <= now) return { error: "expired" };
  const amount = amountOf(slots);
  // ha van még érvényes, nyitott fizetési oldal ugyanarra az összegre, azt használjuk (dupla fizetés ellen)
  if (r.stripe_session_id && r.stripe_session_expires_at && Date.parse(r.stripe_session_expires_at) > now + 5 * 60_000) {
    try {
      const existing = await retrieveCheckoutSession(r.stripe_session_id);
      if (existing.status === "open" && existing.url && existing.amount_total === amount * 100) return { url: existing.url };
      if (existing.status === "complete") return { error: "not-awaiting" };
    } catch (err) {
      console.error("Existing checkout session lookup failed.", { message: (err as Error).message });
    }
  }
  const expiresAt = checkoutExpiry(now, dueMs ?? Number.POSITIVE_INFINITY);
  if (!expiresAt) return { error: "too-late" };
  const locale = requestLocale(r);
  const config = await roomsFor(locale);
  const base = `${appBase()}${withBase(paymentPagePath(locale))}`;
  const query = `r=${r.id}&t=${paymentToken(r.id)}`;
  try {
    const session = await createCheckoutSession({
      requestId: r.id,
      email: r.customer.email,
      locale,
      lines: slots.map((s) => ({
        name: `${roomLabel(config, s.room)} – ${formatDay(s.date, locale)}, ${formatBookingHour(Number(s.hour))}–${formatBookingHour(Number(s.hour) + s.duration_minutes / 60)}`,
        amountHuf: s.price,
      })),
      // a {CHECKOUT_SESSION_ID} helyére a Stripe beírja a fizetés azonosítóját → a köszönő oldal ellenőrizni tudja
      successUrl: `${base}/${locale === "en" ? "success" : "sikeres"}?${query}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}?${query}`,
      expiresAt,
      idempotencyKey: `${r.id}-${amount}-${Math.floor(now / 60_000)}`,
    });
    await update(r.id, { stripe_session_id: session.id, stripe_session_expires_at: new Date(session.expires_at * 1000).toISOString() });
    if (!session.url) return { error: "failed" };
    return { url: session.url };
  } catch (err) {
    console.error("Checkout session creation failed.", { message: (err as Error).message });
    return { error: "failed" };
  }
}

// ---------------------------------------------------------------------
//  3) Fizetve (Stripe webhook, vagy kézzel az adminban)
// ---------------------------------------------------------------------
export function billingFromSession(session: CheckoutSession): BillingAddress | null {
  const d = session.customer_details;
  if (!d) return null;
  const a = d.address;
  return {
    name: (d.business_name || d.name || "").trim(),
    email: d.email ?? "",
    country: a?.country ?? "HU",
    postCode: a?.postal_code ?? "",
    city: a?.city ?? "",
    address: [a?.line1, a?.line2].filter(Boolean).join(" "),
    taxNumber: d.tax_ids?.[0]?.value ?? undefined,
  };
}

/**
 * A fizetés ellenőrzése közvetlenül a Stripe-nál (a webhook mellett, biztonsági hálóként):
 * a köszönő oldal és az időzített teendők hívják. Ha a Stripe szerint ki van fizetve,
 * ugyanúgy feldolgozza, mintha a webhook jelezte volna (kétszer nem fut le).
 */
export async function reconcileCheckout(r: RequestRow, sessionId?: string | null): Promise<boolean> {
  if (r.payment_status !== "awaiting" || !stripeConfigured()) return false;
  const id = sessionId && /^cs_[A-Za-z0-9_]+$/.test(sessionId) ? sessionId : r.stripe_session_id;
  if (!id) return false;
  const session = await retrieveCheckoutSession(id);
  const ref = session.client_reference_id || session.metadata?.request_id;
  if (ref !== r.id || session.payment_status !== "paid") return false;
  await handleCheckoutCompleted(session);
  return true;
}

export async function handleCheckoutCompleted(session: CheckoutSession): Promise<void> {
  if (session.payment_status !== "paid") return; // pl. késleltetett fizetési mód — az async_payment_succeeded jön majd
  const requestId = session.client_reference_id || session.metadata?.request_id;
  if (!requestId) return;
  const r = await loadRequest(requestId);
  if (!r) return;
  const amount = Math.round((session.amount_total ?? 0) / 100);
  const marked = await claim(r.id, { paid_at: "is.null", payment_status: "eq.awaiting" }, {
    payment_status: "paid", paid_at: nowIso(), paid_via: "stripe", paid_amount: amount,
    stripe_session_id: session.id, stripe_payment_intent: session.payment_intent, billing: billingFromSession(session),
  });
  if (!marked) {
    // már fizetett (ismételt webhook), vagy lejárt / kézzel fizetettnek jelölt igényre jött fizetés
    if (r.stripe_payment_intent === session.payment_intent) return;
    await mailStudio("problem", r, approvedSlots(r).length ? approvedSlots(r) : sortSlots(r.studio_slots),
      r.payment_status === "expired"
        ? `Fizetés érkezett (${amount} Ft) egy már LEJÁRT foglalásra. Vagy foglald le újra az időpontot az adminban, vagy térítsd vissza a Stripe-ban.`
        : `Ehhez a foglaláshoz újabb fizetés érkezett (${amount} Ft, ${session.id}) — valószínűleg dupla fizetés. Ellenőrizd a Stripe-ban, és ha kell, térítsd vissza.`);
    return;
  }
  await refreshCalendar(r.id);
  await runPostPayment(r.id);
}

/** Kézi „fizetettnek jelölöm” az adminban: nincs automatikus számla és bejutási e-mail. */
export async function markPaidManually(requestId: string): Promise<boolean> {
  const r = await loadRequest(requestId);
  if (!r) return false;
  const ok = await claim(r.id, { paid_at: "is.null" }, {
    payment_status: "paid", paid_at: nowIso(), paid_via: "manual", paid_amount: amountOf(approvedSlots(r)), invoice_status: "skipped",
  });
  if (ok) {
    if (r.stripe_session_id) await expireCheckoutSession(r.stripe_session_id).catch(() => {});
    await refreshCalendar(r.id);
  }
  return ok;
}

/** A fizetés utáni teendők (mindegyik csak egyszer fut le; hibánál a következő futás újrapróbálja). */
export async function runPostPayment(requestId: string): Promise<void> {
  const r = await loadRequest(requestId);
  if (!r || r.payment_status !== "paid" || r.paid_via !== "stripe") return;
  const settings = await loadPaymentSettings();
  const errors: string[] = [];

  if (!r.access_sent_at) {
    try {
      await sendAccessInfo(r, settings, { paid: true });
    } catch (err) {
      errors.push(`bejutási e-mail: ${(err as Error).message}`);
    }
  }

  const stale = r.invoice_status === "pending" && r.invoice_claimed_at && Date.parse(r.invoice_claimed_at) < Date.now() - 10 * 60_000;
  const retry = r.invoice_status === "error" && r.invoice_attempts < 5;
  if (r.invoice_status === null || stale || retry) {
    // teszt üzemmódban (Stripe sandbox kulcs) számla helyett díjbekérő készül — az nem megy a NAV-hoz
    const testMode = stripeTestMode();
    const blockId = testMode ? settings.billingoProformaBlockId ?? settings.billingoBlockId : settings.billingoBlockId;
    if (!billingoConfigured() || !blockId) {
      await update(r.id, { invoice_status: "skipped", invoice_error: "A Billingo nincs beállítva — a számlát kézzel kell kiállítani." });
    } else if (await claim(r.id, { invoice_status: r.invoice_status === null ? "is.null" : `eq.${r.invoice_status}` }, {
      invoice_status: "pending", invoice_claimed_at: nowIso(),
    })) {
      try {
        if (!r.billing?.name || !r.billing.city) throw new Error("Hiányzó számlázási adatok a Stripe-ból.");
        const locale = requestLocale(r);
        const config = await roomsFor(locale);
        const slots = approvedSlots(r);
        const itemName = (locale === "en" ? settings.itemName.en.trim() : "") || settings.itemName.hu;
        const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date(r.paid_at ?? Date.now()));
        const extraComment = ((locale === "en" ? settings.invoiceComment.en.trim() : "") || settings.invoiceComment.hu).trim();
        const invoice = await createInvoice({
          type: testMode ? "proforma" : "invoice",
          billing: { ...r.billing, email: r.billing.email || r.customer.email },
          blockId,
          bankAccountId: settings.billingoBankAccountId,
          vat: settings.vat,
          language: locale,
          date,
          lines: slots.map((s) => ({
            name: `${itemName} – ${roomLabel(config, s.room)}, ${s.date} ${formatBookingHour(Number(s.hour))}–${formatBookingHour(Number(s.hour) + s.duration_minutes / 60)}`,
            grossPrice: s.price,
            hours: s.duration_minutes / 60,
          })),
          comment: [
            testMode ? "TESZT — díjbekérő, nem számla." : "",
            locale === "en" ? "Paid online by card (Stripe)." : "Online, bankkártyával fizetve (Stripe).",
            extraComment,
          ].filter(Boolean).join("\n"),
        });
        await update(r.id, {
          invoice_status: "issued", invoice_id: String(invoice.id), invoice_error: null,
          invoice_number: testMode ? `Teszt díjbekérő ${invoice.number ?? `#${invoice.id}`}` : invoice.number,
        });
        try {
          await sendInvoice(invoice.id, r.billing.email || r.customer.email);
        } catch (err) {
          await update(r.id, { invoice_error: `A számla elkészült, de a kiküldése nem sikerült: ${(err as Error).message}` });
          errors.push(`számla kiküldése: ${(err as Error).message}`);
        }
      } catch (err) {
        const message = (err as Error).message.slice(0, 500);
        await update(r.id, { invoice_status: "error", invoice_error: message, invoice_attempts: r.invoice_attempts + 1 }).catch(() => {});
        errors.push(`számla: ${message}`);
        if (r.invoice_attempts + 1 >= 5) {
          await mailStudio("problem", r, approvedSlots(r), `A Billingo számlát 5 próbálkozás után sem sikerült kiállítani: ${message}. Kérjük, állítsd ki kézzel.`).catch(() => {});
        }
      }
    }
  }

  if (!r.studio_paid_notified_at && await claim(r.id, { studio_paid_notified_at: "is.null" }, { studio_paid_notified_at: nowIso() })) {
    try {
      await mailStudio("paid", r, approvedSlots(r));
    } catch (err) {
      await update(r.id, { studio_paid_notified_at: null }).catch(() => {});
      errors.push(`stúdió értesítő: ${(err as Error).message}`);
    }
  }
  if (errors.length) console.error("Post-payment tasks had failures.", { requestId, errors });
}

// ---------------------------------------------------------------------
//  4) Időzített teendők: lejárat, emlékeztető, félbemaradt utófeladatok
// ---------------------------------------------------------------------
export async function runPaymentJobs(): Promise<{ expired: number; reminded: number; retried: number; dayReminders: number; overdue: number }> {
  const result = { expired: 0, reminded: 0, retried: 0, dayReminders: 0, overdue: 0 };
  if (!mailConfigured()) return result;
  const settings = await loadPaymentSettings();
  const now = Date.now();

  // emlékeztetők a foglalási napok előtt 24 órával (bejutási infókkal / fizetési linkkel) — Stripe nélkül is
  try {
    result.dayReminders = await runDayReminders(settings, now);
  } catch (err) {
    console.error("Day reminders failed.", { message: (err as Error).message });
  }
  if (!stripeConfigured()) return result;

  if (settings.deadlineEnabled) {
    // lejárt határidő → az időpontok felszabadulnak
    const overdue = await bookingStore<RequestRow[]>(
      `studio_requests?select=${REQUEST_SELECT}&payment_status=eq.awaiting&payment_due=lt.${encodeURIComponent(new Date(now).toISOString())}&limit=50`,
    );
    for (const r of overdue) {
      try {
        if (!(await claim(r.id, { payment_status: "eq.awaiting", paid_at: "is.null" }, { payment_status: "expired" }))) continue;
        if (r.stripe_session_id) await expireCheckoutSession(r.stripe_session_id).catch(() => {});
        const released = await bookingStore<SlotRow[]>(
          `studio_slots?request_id=eq.${r.id}&status=eq.approved&select=id,room,date,hour,duration_minutes,price,status`,
          { method: "PATCH", body: { status: "expired", decided_at: nowIso() }, returnRepresentation: true },
        );
        scheduleCalendarSync();
        result.expired++;
        if (!released.length) continue;
        const locale = requestLocale(r);
        const config = await roomsFor(locale);
        await mailCustomer(r, expiredEmail({ locale, name: r.customer.name, slots: toEmailSlots(sortSlots(released), config) })).catch((err) =>
          console.error("Expiry email failed.", { message: (err as Error).message }));
        await mailStudio("expired", r, sortSlots(released)).catch(() => {});
      } catch (err) {
        console.error("Payment expiry failed.", { requestId: r.id, message: (err as Error).message });
      }
    }

    // emlékeztető 12 órával a határidő előtt
    const soon = await bookingStore<RequestRow[]>(
      `studio_requests?select=${REQUEST_SELECT}&payment_status=eq.awaiting&payment_reminded_at=is.null&payment_due=lt.${encodeURIComponent(new Date(now + 12 * 3_600_000).toISOString())}&limit=50`,
    );
    for (const r of soon) {
      try {
        if (!r.payment_due || !r.decision_notified_at) continue;
        if (!reminderDue(now, Date.parse(r.payment_due), Date.parse(r.decision_notified_at))) continue;
        const slots = approvedSlots(r);
        if (!slots.length) continue;
        if (!(await claim(r.id, { payment_reminded_at: "is.null", payment_status: "eq.awaiting" }, { payment_reminded_at: nowIso() }))) continue;
        const locale = requestLocale(r);
        const config = await roomsFor(locale);
        await mailCustomer(r, reminderEmail({
          locale, name: r.customer.name, slots: toEmailSlots(slots, config), paymentUrl: paymentUrl(r.id, locale), due: r.payment_due,
        }));
        result.reminded++;
      } catch (err) {
        console.error("Payment reminder failed.", { requestId: r.id, message: (err as Error).message });
      }
    }
  }

  // fizetésre váró igények, amelyekhez már nyílt Stripe fizetési oldal: ha a webhook nem jött meg, itt pótoljuk
  const opened = await bookingStore<RequestRow[]>(
    `studio_requests?select=${REQUEST_SELECT}&payment_status=eq.awaiting&stripe_session_id=not.is.null` +
    `&stripe_session_expires_at=gte.${encodeURIComponent(new Date(now - 86_400_000).toISOString())}&limit=20`,
  );
  for (const r of opened) {
    try {
      if (await reconcileCheckout(r)) result.retried++;
    } catch (err) {
      console.error("Checkout reconciliation failed.", { requestId: r.id, message: (err as Error).message });
    }
  }

  // fizetett, de valamelyik utófeladat (bejutási e-mail, számla, stúdió értesítő) még nincs kész
  const since = new Date(now - 14 * 86_400_000).toISOString();
  const unfinished = await bookingStore<Array<{ id: string }>>(
    `studio_requests?select=id&payment_status=eq.paid&paid_via=eq.stripe&paid_at=gte.${encodeURIComponent(since)}` +
    `&or=(access_sent_at.is.null,studio_paid_notified_at.is.null,invoice_status.is.null,invoice_status.eq.pending,and(invoice_status.eq.error,invoice_attempts.lt.5))&limit=20`,
  );
  for (const { id } of unfinished) {
    try {
      await runPostPayment(id);
      result.retried++;
    } catch (err) {
      console.error("Post-payment retry failed.", { requestId: id, message: (err as Error).message });
    }
  }

  // „még nem rendezted” e-mail a határidő nélküli, ki nem fizetett foglalásokra (az időpont után)
  try {
    result.overdue = await runOverdueNotices(now);
  } catch (err) {
    console.error("Overdue notices failed.", { message: (err as Error).message });
  }
  return result;
}

let lastJobRun = 0;

/** Az időzített teendők elindítása a válasz után — legfeljebb percenként egyszer (példányonként). */
export function schedulePaymentJobs(): void {
  if (!mailConfigured() || Date.now() - lastJobRun < 60_000) return;
  lastJobRun = Date.now();
  runInBackground("payment jobs", runPaymentJobs);
}

/** A válasz elküldése után, a háttérben futtat (kérésen kívül: azonnal). */
export function runInBackground(name: string, task: () => Promise<unknown>): void {
  const run = () => task().catch((err) => console.error(`Background task failed: ${name}`, { message: (err as Error).message }));
  try {
    after(run);
  } catch {
    void run();
  }
}
