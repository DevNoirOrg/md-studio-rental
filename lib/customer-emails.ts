import { formatBookingHour } from "./studio-booking.ts";
import type { Locale } from "./i18n.ts";

/*
  Az ügyfélnek és a stúdiónak küldött e-mailek szövege (HTML + sima szöveg).
  Az ügyfél-e-mailek a foglalás nyelvén mennek (magyar / angol); a stúdiónak
  szóló értesítők magyarok. A szövegek fixek, a dinamikus részeket (időpontok,
  összeg, link, határidő) a rendszer írja bele; a bejutási infók szövege az
  adminban szerkeszthető (admin → Fizetés és e-mailek).
*/

export interface EmailSlot {
  roomLabel: string;
  date: string;
  hour: number;
  durationMinutes: number;
  price: number;
}

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const TZ = "Europe/Budapest";
const tag = (locale: Locale) => (locale === "en" ? "en-GB" : "hu-HU");

export function formatMoney(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(tag(locale), { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(amount);
}

export function formatDay(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export function formatDeadline(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ,
  }).format(new Date(iso));
}

const timeRange = (s: EmailSlot) => `${formatBookingHour(s.hour)}–${formatBookingHour(s.hour + s.durationMinutes / 60)}`;

export function escapeHtml(value: unknown): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (c) => map[c]);
}

const nl2br = (text: string) => escapeHtml(text).replace(/\r?\n/g, "<br>");

/* ── Közös HTML váz ─────────────────────────────────────────────────── */
function layout(locale: Locale, title: string, body: string): string {
  const footer = locale === "en"
    ? "MD Dance Studio · Studio rental · You can reply to this email if you have any questions."
    : "MD Dance Studio · Stúdióbérlés · Ha kérdésed van, válaszolj erre az e-mailre.";
  return `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#111">
<div style="max-width:620px;margin:24px auto;padding:28px;background:#fff;border-radius:16px">
<h1 style="margin:0 0 20px;padding-bottom:14px;border-bottom:4px solid #40CFD5;font-size:24px">${escapeHtml(title)}</h1>
${body}
<p style="margin-top:28px;font-size:12px;color:#777">${escapeHtml(footer)}</p>
</div></body></html>`;
}

const p = (text: string) => `<p style="line-height:1.55">${text}</p>`;
const button = (label: string, url: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#40CFD5;color:#111;font-weight:bold;text-decoration:none">${escapeHtml(label)}</a></p>`;
const notice = (text: string) =>
  `<p style="padding:12px 16px;border-radius:12px;background:#fef3c7;color:#78350f;font-weight:bold;line-height:1.5">${text}</p>`;

function slotTable(slots: EmailSlot[], locale: Locale, opts: { prices?: boolean; strike?: boolean } = {}): string {
  const rows = slots.map((s) => `<tr>
<td style="padding:10px 12px;border-top:1px solid #eee${opts.strike ? ";color:#999;text-decoration:line-through" : ""}"><strong>${escapeHtml(s.roomLabel)}</strong><br>${escapeHtml(formatDay(s.date, locale))}, ${timeRange(s)}</td>
${opts.prices ? `<td style="padding:10px 12px;border-top:1px solid #eee;text-align:right;white-space:nowrap">${escapeHtml(formatMoney(s.price, locale))}</td>` : ""}
</tr>`).join("");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #eee;border-radius:12px">${rows}</table>`;
}
const slotLines = (slots: EmailSlot[], locale: Locale, prices = true) =>
  slots.map((s) => `- ${s.roomLabel}, ${formatDay(s.date, locale)}, ${timeRange(s)}${prices ? ` — ${formatMoney(s.price, locale)}` : ""}`).join("\n");
const totalOf = (slots: EmailSlot[]) => slots.reduce((sum, s) => sum + s.price, 0);
const totalHtml = (slots: EmailSlot[], locale: Locale) =>
  p(`<strong>${locale === "en" ? "Total" : "Összesen"}: ${escapeHtml(formatMoney(totalOf(slots), locale))}</strong>`);

/* ── 1. Beérkezett a foglalás ───────────────────────────────────────── */
export function receivedEmail({ locale, name, slots, paymentsEnabled }: {
  locale: Locale; name: string; slots: EmailSlot[]; paymentsEnabled: boolean;
}): Rendered {
  if (locale === "en") {
    const next = paymentsEnabled
      ? "We'll review your request and let you know by email. Once approved, we'll send you a payment link — your booking becomes final once payment has been made."
      : "We'll review your request and let you know by email. Your booking only becomes final once the studio has confirmed it.";
    return {
      subject: "We've received your booking request – MD Dance Studio",
      html: layout(locale, "We've received your booking request", [
        p(`Hi ${escapeHtml(name)},`),
        p("Thank you for your booking request. These are the times you requested:"),
        slotTable(slots, locale, { prices: true }), totalHtml(slots, locale), p(escapeHtml(next)),
      ].join("")),
      text: [`Hi ${name},`, "", "Thank you for your booking request. These are the times you requested:", slotLines(slots, locale),
        `Total: ${formatMoney(totalOf(slots), locale)}`, "", next].join("\n"),
    };
  }
  const next = paymentsEnabled
    ? "Átnézzük az igényedet, és e-mailben jelzünk. Jóváhagyás után küldjük a fizetési linket — a foglalás a fizetéssel válik véglegessé."
    : "Átnézzük az igényedet, és e-mailben jelzünk. A foglalás a stúdió visszaigazolása után válik véglegessé.";
  return {
    subject: "Megkaptuk a foglalási igényedet – MD Dance Studio",
    html: layout(locale, "Megkaptuk a foglalási igényedet", [
      p(`Szia ${escapeHtml(name)}!`),
      p("Köszönjük a foglalási igényedet. Ezeket az időpontokat kérted:"),
      slotTable(slots, locale, { prices: true }), totalHtml(slots, locale), p(escapeHtml(next)),
    ].join("")),
    text: [`Szia ${name}!`, "", "Köszönjük a foglalási igényedet. Ezeket az időpontokat kérted:", slotLines(slots, locale),
      `Összesen: ${formatMoney(totalOf(slots), locale)}`, "", next].join("\n"),
  };
}

/* ── 2. Döntés: elfogadva (fizetési linkkel vagy anélkül) / elutasítva ── */
export function decisionEmail({ locale, name, approved, rejected, paymentUrl, due }: {
  locale: Locale; name: string; approved: EmailSlot[]; rejected: EmailSlot[];
  /** null: az online fizetés ki van kapcsolva → nincs link. */
  paymentUrl: string | null;
  due: string | null;
}): Rendered {
  const en = locale === "en";
  if (approved.length === 0) {
    const body = en
      ? "Unfortunately we can't accept your booking request for the times below. Please choose different times on our website, or reply to this email if you have any questions."
      : "Sajnos az alábbi időpontokra nem tudjuk elfogadni a foglalási igényedet. Válassz másik időpontot az oldalunkon, vagy ha kérdésed van, válaszolj erre az e-mailre.";
    return {
      subject: en ? "Your booking request was declined – MD Dance Studio" : "A foglalási igényedet nem tudjuk elfogadni – MD Dance Studio",
      html: layout(locale, en ? "Booking request declined" : "Foglalási igény elutasítva", [
        p(en ? `Hi ${escapeHtml(name)},` : `Szia ${escapeHtml(name)}!`), p(escapeHtml(body)), slotTable(rejected, locale),
      ].join("")),
      text: [en ? `Hi ${name},` : `Szia ${name}!`, "", body, slotLines(rejected, locale, false)].join("\n"),
    };
  }
  const intro = en
    ? (rejected.length ? "Good news: we've accepted part of your booking request. Accepted times:" : "Good news: we've accepted your booking request:")
    : (rejected.length ? "Jó hír: a foglalási igényed egy részét elfogadtuk. Az elfogadott időpontok:" : "Jó hír: elfogadtuk a foglalási igényedet:");
  const rejectedIntro = en ? "Unfortunately we couldn't accept these times:" : "Ezeket az időpontokat sajnos nem tudjuk vállalni:";
  const payText = paymentUrl
    ? (en
      ? `Your booking becomes final once you've paid. You can pay securely by card using the button below${due ? ` by ${formatDeadline(due, locale)}` : ""}.`
      : `A foglalás a fizetéssel válik véglegessé. Az alábbi gombbal biztonságosan, bankkártyával fizethetsz${due ? `, ${formatDeadline(due, locale)}-ig` : ""}.`)
    : (en ? "We'll send you payment details separately." : "A fizetés részleteiről külön írunk.");
  const dueText = paymentUrl && due
    ? (en
      ? "If the payment doesn't arrive by the deadline, the times will be released automatically."
      : "Ha a határidőig nem érkezik meg a fizetés, az időpontok automatikusan felszabadulnak.")
    : "";
  const buttonLabel = en ? "Pay now" : "Fizetés";
  return {
    subject: en ? "Your booking has been accepted – MD Dance Studio" : "Elfogadtuk a foglalásodat – MD Dance Studio",
    html: layout(locale, en ? "Booking accepted" : "Elfogadtuk a foglalásodat", [
      p(en ? `Hi ${escapeHtml(name)},` : `Szia ${escapeHtml(name)}!`), p(escapeHtml(intro)),
      slotTable(approved, locale, { prices: true }), totalHtml(approved, locale),
      rejected.length ? p(escapeHtml(rejectedIntro)) + slotTable(rejected, locale, { strike: true }) : "",
      p(escapeHtml(payText)), paymentUrl ? button(buttonLabel, paymentUrl) : "", dueText ? notice(escapeHtml(dueText)) : "",
    ].join("")),
    text: [
      en ? `Hi ${name},` : `Szia ${name}!`, "", intro, slotLines(approved, locale),
      `${en ? "Total" : "Összesen"}: ${formatMoney(totalOf(approved), locale)}`,
      ...(rejected.length ? ["", rejectedIntro, slotLines(rejected, locale, false)] : []),
      "", payText, ...(paymentUrl ? [`${buttonLabel}: ${paymentUrl}`] : []), ...(dueText ? ["", dueText] : []),
    ].join("\n"),
  };
}

/* ── Emlékeztető a fizetési határidő előtt ──────────────────────────── */
export function reminderEmail({ locale, name, slots, paymentUrl, due }: {
  locale: Locale; name: string; slots: EmailSlot[]; paymentUrl: string; due: string;
}): Rendered {
  const en = locale === "en";
  const body = en
    ? `Just a reminder: we haven't received payment for your booking yet. Please pay by ${formatDeadline(due, locale)}, otherwise the times will be released automatically.`
    : `Csak emlékeztetünk: a foglalásod fizetése még nem érkezett meg. Kérjük, fizess ${formatDeadline(due, locale)}-ig, különben az időpontok automatikusan felszabadulnak.`;
  const label = en ? "Pay now" : "Fizetés";
  return {
    subject: en ? "Reminder: your booking is awaiting payment – MD Dance Studio" : "Emlékeztető: a foglalásod fizetésre vár – MD Dance Studio",
    html: layout(locale, en ? "Your booking is awaiting payment" : "A foglalásod fizetésre vár", [
      p(en ? `Hi ${escapeHtml(name)},` : `Szia ${escapeHtml(name)}!`), p(escapeHtml(body)),
      slotTable(slots, locale, { prices: true }), totalHtml(slots, locale), button(label, paymentUrl),
    ].join("")),
    text: [en ? `Hi ${name},` : `Szia ${name}!`, "", body, slotLines(slots, locale),
      `${en ? "Total" : "Összesen"}: ${formatMoney(totalOf(slots), locale)}`, "", `${label}: ${paymentUrl}`].join("\n"),
  };
}

/* ── Lejárt a fizetési határidő ─────────────────────────────────────── */
export function expiredEmail({ locale, name, slots }: { locale: Locale; name: string; slots: EmailSlot[] }): Rendered {
  const en = locale === "en";
  const body = en
    ? "The payment deadline for your booking has passed, so the times below have been released. If you'd still like to book, please choose a time again on our website."
    : "A foglalásod fizetési határideje lejárt, ezért az alábbi időpontok felszabadultak. Ha továbbra is foglalnál, válassz újra időpontot az oldalunkon.";
  return {
    subject: en ? "Your booking has expired – MD Dance Studio" : "Lejárt a foglalásod – MD Dance Studio",
    html: layout(locale, en ? "Booking expired" : "Lejárt a foglalásod", [
      p(en ? `Hi ${escapeHtml(name)},` : `Szia ${escapeHtml(name)}!`), p(escapeHtml(body)), slotTable(slots, locale, { strike: true }),
    ].join("")),
    text: [en ? `Hi ${name},` : `Szia ${name}!`, "", body, slotLines(slots, locale, false)].join("\n"),
  };
}

/* ── Fizetve + bejutási infók (vagy csak bejutási infók, az adminból) ── */
export function accessEmail({ locale, name, slots, access, paid, invoiceByEmail, laterNote = false }: {
  locale: Locale; name: string; slots: EmailSlot[];
  access: Array<{ studio: string; text: string }>;
  /** true: online fizetés után (köszönjük a fizetést); false: az admin küldte a bejutási infókat. */
  paid: boolean;
  invoiceByEmail: boolean;
  /** Van olyan nap, amelynek a bejutási infóit később (24 órával előtte) küldjük. */
  laterNote?: boolean;
}): Rendered {
  const en = locale === "en";
  const intro = paid
    ? (en ? "Thank you for your payment — your booking is now final. Your times:" : "Köszönjük a fizetést, a foglalásod végleges. Az időpontjaid:")
    : (en ? "Here are the details for your booking. Your times:" : "Itt vannak a foglalásod részletei. Az időpontjaid:");
  const accessTitle = en ? "How to get in" : "Bejutási információk";
  const invoiceText = invoiceByEmail
    ? (en ? "We'll send your invoice in a separate email." : "A számlát külön e-mailben küldjük.")
    : "";
  const blocks = access.filter((a) => a.text.trim());
  const later = laterNote
    ? (blocks.length
      ? (en ? "We'll email you the access details for your other days 24 hours before each one." : "A további napokhoz a bejutási infókat az időpont előtt 24 órával e-mailben küldjük.")
      : (en ? "We'll email you the access details (how to get in) 24 hours before your booking." : "A bejutási infókat az időpont előtt 24 órával e-mailben küldjük."))
    : "";
  return {
    subject: paid
      ? (en ? "Payment received – your booking is confirmed – MD Dance Studio" : "Sikeres fizetés – a foglalásod végleges – MD Dance Studio")
      : (en ? "Your booking details – MD Dance Studio" : "A foglalásod részletei – MD Dance Studio"),
    html: layout(locale, paid ? (en ? "Booking confirmed" : "A foglalásod végleges") : (en ? "Booking details" : "A foglalásod részletei"), [
      p(en ? `Hi ${escapeHtml(name)},` : `Szia ${escapeHtml(name)}!`), p(escapeHtml(intro)),
      slotTable(slots, locale, { prices: paid }), paid ? totalHtml(slots, locale) : "",
      blocks.length ? `<h2 style="margin-top:28px;font-size:18px">${escapeHtml(accessTitle)}</h2>` : "",
      ...blocks.map((a) => `${blocks.length > 1 ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#087c81">${escapeHtml(a.studio)}</h3>` : ""}<div style="line-height:1.6;padding:14px 16px;border-radius:12px;background:#f3fbfb">${nl2br(a.text)}</div>`),
      later ? p(escapeHtml(later)) : "",
      invoiceText ? p(escapeHtml(invoiceText)) : "",
    ].join("")),
    text: [
      en ? `Hi ${name},` : `Szia ${name}!`, "", intro, slotLines(slots, locale, paid),
      ...(paid ? [`${en ? "Total" : "Összesen"}: ${formatMoney(totalOf(slots), locale)}`] : []),
      ...(blocks.length ? ["", accessTitle.toUpperCase(), ...blocks.flatMap((a) => [...(blocks.length > 1 ? ["", a.studio] : []), a.text])] : []),
      ...(later ? ["", later] : []),
      ...(invoiceText ? ["", invoiceText] : []),
    ].join("\n"),
  };
}

/* ── Emlékeztető a foglalási nap előtt 24 órával (bejutási infókkal, vagy fizetési linkkel) ── */
export function dayReminderEmail({ locale, name, slots, access, paymentUrl }: {
  locale: Locale; name: string; slots: EmailSlot[];
  /** null: nincs kifizetve — a bejutási infók helyett a fizetési link megy. */
  access: Array<{ studio: string; text: string }> | null;
  paymentUrl: string | null;
}): Rendered {
  const en = locale === "en";
  const day = slots[0] ? formatDay(slots[0].date, locale) : "";
  const intro = en ? `A reminder: you have a booking on ${day}:` : `Emlékeztető: ${day} időpontod van nálunk:`;
  const unpaid = !access;
  const payText = en
    ? "Your booking hasn't been paid yet. Please pay using the button below — we'll send you the access details right after payment."
    : "A foglalásod még nincs kifizetve. Kérjük, fizess az alábbi gombbal — a bejutási infókat a fizetés után azonnal küldjük.";
  const blocks = (access ?? []).filter((a) => a.text.trim());
  const accessTitle = en ? "How to get in" : "Bejutási információk";
  const label = en ? "Pay now" : "Fizetés";
  return {
    subject: unpaid
      ? (en ? "Reminder: your upcoming booking – payment pending – MD Dance Studio" : "Emlékeztető: közelgő időpontod – még nincs kifizetve – MD Dance Studio")
      : (en ? "Reminder: your booking & how to get in – MD Dance Studio" : "Emlékeztető: időpontod és a bejutási infók – MD Dance Studio"),
    html: layout(locale, en ? "Booking reminder" : "Emlékeztető", [
      p(en ? `Hi ${escapeHtml(name)},` : `Szia ${escapeHtml(name)}!`), p(escapeHtml(intro)),
      slotTable(slots, locale),
      unpaid ? p(escapeHtml(payText)) + (paymentUrl ? button(label, paymentUrl) : "") : "",
      blocks.length ? `<h2 style="margin-top:28px;font-size:18px">${escapeHtml(accessTitle)}</h2>` : "",
      ...blocks.map((a) => `${blocks.length > 1 ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#087c81">${escapeHtml(a.studio)}</h3>` : ""}<div style="line-height:1.6;padding:14px 16px;border-radius:12px;background:#f3fbfb">${nl2br(a.text)}</div>`),
    ].join("")),
    text: [
      en ? `Hi ${name},` : `Szia ${name}!`, "", intro, slotLines(slots, locale, false),
      ...(unpaid ? ["", payText, ...(paymentUrl ? [`${label}: ${paymentUrl}`] : [])] : []),
      ...(blocks.length ? ["", accessTitle.toUpperCase(), ...blocks.flatMap((a) => [...(blocks.length > 1 ? ["", a.studio] : []), a.text])] : []),
    ].join("\n"),
  };
}

/* ── Az időpont után még nincs kifizetve ────────────────────────────── */
export function overdueEmail({ locale, name, slots, paymentUrl }: {
  locale: Locale; name: string; slots: EmailSlot[]; paymentUrl: string;
}): Rendered {
  const en = locale === "en";
  const body = en
    ? "We haven't received payment for your booking below yet. Please settle it using the button below. If you've already paid, please ignore this email."
    : "Az alábbi foglalásod díja még nem érkezett meg hozzánk. Kérjük, rendezd az alábbi gombbal. Ha közben már fizettél, ezt az e-mailt hagyd figyelmen kívül.";
  const label = en ? "Pay now" : "Fizetés";
  return {
    subject: en ? "Your booking hasn't been paid yet – MD Dance Studio" : "A foglalásod díja még nincs rendezve – MD Dance Studio",
    html: layout(locale, en ? "Payment outstanding" : "Rendezetlen foglalás", [
      p(en ? `Hi ${escapeHtml(name)},` : `Szia ${escapeHtml(name)}!`), p(escapeHtml(body)),
      slotTable(slots, locale, { prices: true }), totalHtml(slots, locale), button(label, paymentUrl),
    ].join("")),
    text: [en ? `Hi ${name},` : `Szia ${name}!`, "", body, slotLines(slots, locale),
      `${en ? "Total" : "Összesen"}: ${formatMoney(totalOf(slots), locale)}`, "", `${label}: ${paymentUrl}`].join("\n"),
  };
}

/* ── Értesítők a stúdiónak (magyarul) ───────────────────────────────── */
export function studioNoticeEmail({ kind, customer, slots, detail }: {
  kind: "paid" | "expired" | "problem";
  customer: { name: string; email: string; phone: string; language?: string };
  slots: EmailSlot[];
  detail?: string;
}): Rendered {
  const titles = {
    paid: "Fizetés érkezett",
    expired: "Lejárt egy foglalás (nem fizettek)",
    problem: "Figyelem: kézi teendő egy foglalásnál",
  } as const;
  const leads = {
    paid: "Az ügyfél online kifizette a foglalását. A bejutási infókat automatikusan megkapja (az időpont előtt 24 órával, vagy azonnal, ha 24 órán belül van).",
    expired: "A fizetési határidő lejárt, az időpontok felszabadultak. Az ügyfél erről e-mailt kapott.",
    problem: "Valami nem automatikusan ment — kérjük, nézd meg.",
  } as const;
  const english = customer.language === "en" ? " (EN)" : "";
  return {
    subject: `${titles[kind]} – ${customer.name}${english}`,
    html: layout("hu", titles[kind], [
      p(escapeHtml(leads[kind])), detail ? notice(escapeHtml(detail)) : "",
      p(`<strong>Név:</strong> ${escapeHtml(customer.name)}<br><strong>E-mail:</strong> ${escapeHtml(customer.email)}<br><strong>Telefon:</strong> ${escapeHtml(customer.phone)}${english ? "<br><strong>Nyelv:</strong> angol" : ""}`),
      slotTable(slots, "hu", { prices: true }), totalHtml(slots, "hu"),
    ].join("")),
    text: [titles[kind], "", leads[kind], ...(detail ? ["", detail] : []), "",
      `Név: ${customer.name}`, `E-mail: ${customer.email}`, `Telefon: ${customer.phone}`, ...(english ? ["Nyelv: angol"] : []),
      "", slotLines(slots, "hu"), `Összesen: ${formatMoney(totalOf(slots), "hu")}`].join("\n"),
  };
}
