import { createHmac, timingSafeEqual } from "node:crypto";

/*
  A fizetés szabályai (tiszta függvények, tesztelhetők):
    - fizetési határidő: ha jóváhagyáskor az első időpont 48 órán belül van (nearHours), nincs határidő —
      a foglalás bent marad, és az időpont után is fizethető; különben a jóváhagyástól 24 óra (payWithinHours);
    - a Stripe fizetési oldal lejárata: 30 perc – 24 óra között, és nem lehet a határidő után;
    - emlékeztető / bejutási infó: a foglalási nap első időpontja előtt 24 órával;
    - emlékeztető: 12 órával a határidő előtt, ha a fizetésre adott idő elég hosszú volt;
    - a fizetési link titkos tokenje (HMAC, nem kell tárolni).
*/

const HOUR = 3_600_000;
export const REMINDER_BEFORE_MS = 12 * HOUR;

/** Budapesti helyi idő ("YYYY-MM-DD" + óra, pl. 14.5) → UTC időpont (ms). */
export function budapestInstant(date: string, hour: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const minutes = Math.round(hour * 60);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const offsetAt = (ms: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(ms)).map(({ type, value }) => [type, value]));
    const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return local - ms;
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

/** Az igény első (legkorábbi) időpontjának kezdete. */
export function firstStart(slots: Array<{ date: string; hour: number }>): number | null {
  if (!slots.length) return null;
  return Math.min(...slots.map((s) => budapestInstant(s.date, Number(s.hour))));
}

/**
 * Fizetési határidő (ms), vagy null, ha nincs határidő (nem szabadul fel; az időpont után is fizethető).
 * Közeli foglalásnál (az első időpont nearHours órán belül) nincs határidő, különben payWithinHours óra.
 */
export function computeDue(
  nowMs: number,
  startMs: number,
  settings: { deadlineEnabled: boolean; nearHours: number; payWithinHours: number },
): number | null {
  if (!settings.deadlineEnabled) return null;
  if (startMs - nowMs <= settings.nearHours * HOUR) return null;
  return Math.min(nowMs + settings.payWithinHours * HOUR, startMs);
}

/** Mikor menjen a foglalási nap emlékeztetője (a nap első időpontja előtt 24 órával). */
export const ACCESS_REMINDER_BEFORE_MS = 24 * HOUR;

/** A „még nem rendezted” e-mail ideje: az utolsó időpont napja utáni nap 10:00 (Budapest). */
export function overdueNoticeAt(lastDay: string): number {
  const next = new Date(Date.parse(`${lastDay}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return budapestInstant(next, 10);
}

/**
 * A Stripe fizetési oldal lejárata (másodperc). A Stripe 30 perc és 24 óra közötti értéket fogad el;
 * nem lehet a határidő után (határidő nélkül limitMs = Infinity). null: már nem lehet fizetni.
 */
export function checkoutExpiry(nowMs: number, limitMs: number): number | null {
  const latest = Math.min(nowMs + 23.5 * HOUR, limitMs);
  if (latest < nowMs + 31 * 60_000) return null;
  return Math.floor(latest / 1000);
}

/** Kell-e most emlékeztetőt küldeni (12 órával a határidő előtt; csak ha a fizetésre adott idő elég hosszú volt). */
export function reminderDue(nowMs: number, dueMs: number, notifiedMs: number): boolean {
  return dueMs > nowMs && dueMs - nowMs <= REMINDER_BEFORE_MS && dueMs - notifiedMs > REMINDER_BEFORE_MS + 6 * HOUR;
}

function linkSecret(): string {
  const secret = process.env.PAYMENT_LINK_SECRET?.trim() || process.env.STRIPE_SECRET_KEY?.trim() || "";
  if (!secret) throw new Error("Payment link secret missing (PAYMENT_LINK_SECRET / STRIPE_SECRET_KEY).");
  return secret;
}

/** A fizetési link tokenje (az igény azonosítójából, titkos kulccsal aláírva). */
export function paymentToken(requestId: string, secret = linkSecret()): string {
  return createHmac("sha256", secret).update(`md-studio-payment:${requestId}`).digest("hex");
}

export function verifyPaymentToken(requestId: string, token: string, secret?: string): boolean {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId) || !/^[a-f0-9]{64}$/.test(token)) return false;
  let expected: string;
  try {
    expected = paymentToken(requestId, secret);
  } catch {
    return false;
  }
  return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
}
