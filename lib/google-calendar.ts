import { createSign } from "node:crypto";
import { bookingStore } from "./booking-store.ts";
import { withBase } from "./base-path.ts";
import { ROOM_IDS, type LessonType, type Room } from "./room-config.ts";
import { endHour, formatBookingHour, type Customer } from "./studio-booking.ts";

/*
  Google Naptár szinkron — EGYIRÁNYÚ: a foglalási rendszer írja a termek Google Naptárait.
   - Csak a jóváhagyott („Foglalás alatt”) idősávok kerülnek be; minden idősáv külön esemény.
   - Átfoglaláskor az esemény átkerül, törléskor törlődik. A naptárban végzett kézi
     módosítás nem hat vissza (a következő szinkron felülírhatja).
   - Az esemény azonosítója az idősáv azonosítója (kötőjelek nélkül), így a szinkron
     bármikor megismételhető, kétszer nem jön létre ugyanaz az esemény.
   - Mit kell szinkronizálni: rental.studio_slots.gcal_dirty és rental.gcal_deletions
     (adatbázis-triggerek töltik, lásd supabase/studio-bookings.sql).

  Beállítás (Vercel környezeti változók, csak szerveren):
    GOOGLE_SERVICE_ACCOUNT_JSON     — a Google szolgáltatásfiók kulcsa (a letöltött JSON teljes tartalma)
    GOOGLE_CALENDAR_ASTORIA_NAGY    — a termek naptárainak azonosítói
    GOOGLE_CALENDAR_ASTORIA_KIS       (Google Naptár → a naptár beállításai → „Naptár azonosítója”,
    GOOGLE_CALENDAR_OPERA_NAGY         pl. abc123@group.calendar.google.com)
    GOOGLE_CALENDAR_OPERA_KOZEPES
  A naptárakat meg kell osztani a szolgáltatásfiók e-mail címével („Módosíthatja az eseményeket”).
*/

export const CALENDAR_ENV: Record<Room, string> = {
  "Astoria - Nagy Terem": "GOOGLE_CALENDAR_ASTORIA_NAGY",
  "Astoria - Kis Terem": "GOOGLE_CALENDAR_ASTORIA_KIS",
  "Opera - Nagy Terem": "GOOGLE_CALENDAR_OPERA_NAGY",
  "Opera - Közepes Terem": "GOOGLE_CALENDAR_OPERA_KOZEPES",
};

const TIME_ZONE = "Europe/Budapest";
const API = "https://www.googleapis.com/calendar/v3";
const BATCH = 100;

const lessonNames: Record<LessonType, string> = {
  privat: "Privát óra",
  kiscsoportos: "Kiscsoportos óra",
  csoportos: "Csoportos óra",
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

/** Be van-e állítva a szinkron (szolgáltatásfiók + legalább egy terem naptára). */
export function calendarConfigured(): boolean {
  return !!serviceAccount() && ROOM_IDS.some((room) => !!calendarIdFor(room));
}

export function calendarIdFor(room: string): string | null {
  const key = (CALENDAR_ENV as Record<string, string>)[room];
  return (key && process.env[key]?.trim()) || null;
}

/** Az idősáv naptáreseményének azonosítója (a Google csak a-v és 0-9 karaktert enged; a hexa ilyen). */
export function eventIdFor(slotId: string): string {
  return slotId.toLowerCase().replace(/[^0-9a-f]/g, "");
}

// ---------------------------------------------------------------------
//  Hozzáférési token (szolgáltatásfiók → OAuth, aláírt JWT-vel)
// ---------------------------------------------------------------------
let cachedToken: { token: string; expires: number; email: string } | null = null;

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

export function signedJwt(account: ServiceAccount, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.private_key).toString("base64url")}`;
}

/** fetch, ami a hálózati hibát érthető üzenetre cseréli. */
async function googleFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("A Google szolgáltatás nem érhető el (hálózati hiba vagy időtúllépés). Később újrapróbáljuk.");
  }
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.email === account.client_email && cachedToken.expires > now + 60) return cachedToken.token;
  const response = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt(account, now),
    }),
  });
  const result = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !result.access_token) {
    throw new Error(`Google bejelentkezés sikertelen (${result.error ?? response.status}). Ellenőrizd a GOOGLE_SERVICE_ACCOUNT_JSON értékét.`);
  }
  cachedToken = { token: result.access_token, expires: now + (result.expires_in ?? 3600), email: account.client_email };
  return result.access_token;
}

async function googleRequest(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  return googleFetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function googleError(response: Response, calendarId: string): Promise<Error> {
  const result = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (response.status === 404 || response.status === 403) {
    return new Error(`A naptár nem érhető el (${response.status}): ellenőrizd, hogy a(z) ${calendarId} naptár meg van-e osztva a szolgáltatásfiókkal „Módosíthatja az eseményeket” joggal.`);
  }
  return new Error(`Google Naptár hiba (${response.status}): ${result.error?.message ?? "ismeretlen hiba"}`);
}

// ---------------------------------------------------------------------
//  Esemény
// ---------------------------------------------------------------------
export interface CalendarSlot {
  id: string;
  room: string;
  date: string;
  hour: number;
  durationMinutes: number;
  price: number;
  lessonType: LessonType;
  customer: Customer;
}

const currency = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

/** Az idősáv Google Naptár eseménye (cím: óratípus – név; leírás: a foglalás adatai). */
export function buildEvent(slot: CalendarSlot, adminUrl?: string) {
  const start = formatBookingHour(slot.hour);
  const end = endHour({ ...slot });
  // a nap végén (24:00) záródó idősáv vége a következő nap 00:00
  const endDate = end >= 24 ? new Date(Date.parse(`${slot.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : slot.date;
  const endTime = formatBookingHour(end >= 24 ? end - 24 : end);
  const lesson = lessonNames[slot.lessonType] ?? slot.lessonType;
  const description = [
    `Név: ${slot.customer.name}`,
    `Telefon: ${slot.customer.phone}`,
    `E-mail: ${slot.customer.email}`,
    `Óratípus: ${lesson}`,
    `Időpont: ${start}–${formatBookingHour(end)} (${slot.durationMinutes} perc)`,
    `Ár: ${currency.format(slot.price)}`,
    ...(adminUrl ? ["", `Megnyitás az adminban: ${adminUrl}`] : []),
    "",
    "Ezt az eseményt a foglalási rendszer kezeli — itt ne módosítsd, mert felülíródhat.",
  ].join("\n");
  return {
    id: eventIdFor(slot.id),
    status: "confirmed",
    summary: `${lesson} – ${slot.customer.name}`,
    description,
    start: { dateTime: `${slot.date}T${start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${endDate}T${endTime}:00`, timeZone: TIME_ZONE },
    extendedProperties: { private: { mdStudioSlotId: slot.id } },
  };
}

/** Link a foglalás napjára az admin naptárban (ha az APP_BASE_URL be van állítva). */
export function adminUrlFor(slot: Pick<CalendarSlot, "room" | "date">): string | undefined {
  const base = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  if (!base) return undefined;
  const params = new URLSearchParams({ datum: slot.date, terem: String(ROOM_IDS.indexOf(slot.room as Room)) });
  return `${base}${withBase("/admin")}?${params}`;
}

async function upsertEvent(token: string, calendarId: string, event: ReturnType<typeof buildEvent>) {
  const cal = encodeURIComponent(calendarId);
  // Frissítés (törölt eseményt is visszaállít); ha még nincs ilyen esemény → létrehozás ugyanazzal az azonosítóval.
  let response = await googleRequest(token, "PUT", `/calendars/${cal}/events/${event.id}`, event);
  if (response.status === 404) response = await googleRequest(token, "POST", `/calendars/${cal}/events`, event);
  if (!response.ok) throw await googleError(response, calendarId);
}

async function deleteEvent(token: string, calendarId: string, slotId: string) {
  const response = await googleRequest(token, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${eventIdFor(slotId)}`);
  // 404 / 410: már nincs ilyen esemény — rendben
  if (!response.ok && response.status !== 404 && response.status !== 410) throw await googleError(response, calendarId);
}

// ---------------------------------------------------------------------
//  Szinkron
// ---------------------------------------------------------------------
export interface SyncResult {
  configured: boolean;
  written: number;
  removed: number;
  failed: number;
  error?: string;
}

interface DirtyRow {
  id: string;
  room: string;
  date: string;
  hour: number;
  duration_minutes: number;
  price: number;
  status: string;
  studio_requests: { customer: Customer; lesson_type: LessonType } | null;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

async function runSync(): Promise<SyncResult> {
  const account = serviceAccount();
  if (!account || !calendarConfigured()) return { configured: false, written: 0, removed: 0, failed: 0 };
  const result: SyncResult = { configured: true, written: 0, removed: 0, failed: 0 };
  const fail = (err: unknown) => {
    result.failed++;
    result.error ??= errorText(err);
  };
  const token = await accessToken(account);

  // 1) törölt idősávok eseményei
  const deletions = await bookingStore<Array<{ slot_id: string; room: string }>>(
    `gcal_deletions?select=slot_id,room&order=created_at&limit=${BATCH}`,
  );
  for (const row of deletions) {
    try {
      const calendarId = calendarIdFor(row.room);
      if (!calendarId) throw new Error(`Nincs beállítva naptár ehhez a teremhez: ${row.room} (${CALENDAR_ENV[row.room as Room] ?? "?"}).`);
      await deleteEvent(token, calendarId, row.slot_id);
      await bookingStore(`gcal_deletions?slot_id=eq.${row.slot_id}`, { method: "DELETE" });
      result.removed++;
    } catch (err) {
      fail(err);
    }
  }

  // 2) új / módosult idősávok
  const dirty = await bookingStore<DirtyRow[]>(
    `studio_slots?select=id,room,date,hour,duration_minutes,price,status,studio_requests(customer,lesson_type)&gcal_dirty=is.true&order=date,hour&limit=${BATCH}`,
  );
  for (const row of dirty) {
    // csak akkor jelöljük késznek, ha közben nem változott (különben a következő szinkron újra elvégzi)
    const unchanged = new URLSearchParams({
      id: `eq.${row.id}`, room: `eq.${row.room}`, date: `eq.${row.date}`, hour: `eq.${row.hour}`,
      duration_minutes: `eq.${row.duration_minutes}`, status: `eq.${row.status}`,
    });
    try {
      const calendarId = calendarIdFor(row.room);
      if (!calendarId) throw new Error(`Nincs beállítva naptár ehhez a teremhez: ${row.room} (${CALENDAR_ENV[row.room as Room] ?? "?"}).`);
      const approved = row.status === "approved" && !!row.studio_requests;
      if (approved) {
        const slot: CalendarSlot = {
          id: row.id, room: row.room, date: row.date, hour: Number(row.hour), durationMinutes: row.duration_minutes,
          price: row.price, lessonType: row.studio_requests!.lesson_type, customer: row.studio_requests!.customer,
        };
        await upsertEvent(token, calendarId, buildEvent(slot, adminUrlFor(slot)));
        result.written++;
      } else {
        await deleteEvent(token, calendarId, row.id);
        result.removed++;
      }
      await bookingStore(`studio_slots?${unchanged}`, {
        method: "PATCH",
        body: { gcal_dirty: false, gcal_error: null, gcal_synced_at: approved ? new Date().toISOString() : null },
      });
    } catch (err) {
      fail(err);
      try {
        await bookingStore(`studio_slots?id=eq.${row.id}`, { method: "PATCH", body: { gcal_error: errorText(err) } });
      } catch {
        // a hibát az eredményben úgyis visszaadjuk
      }
    }
  }
  return result;
}

// Egy példányon belül egyszerre csak egy szinkron fusson.
let running: Promise<SyncResult> | null = null;

/** Elvégzi a függő naptárműveleteket. Ha nincs beállítva, nem csinál semmit. */
export async function syncCalendar(): Promise<SyncResult> {
  if (!calendarConfigured()) return { configured: false, written: 0, removed: 0, failed: 0 };
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

/** Hiba nélkül lefutó változat a háttérben indított szinkronhoz (a hibát naplózza). */
export async function syncCalendarQuietly(): Promise<void> {
  try {
    const result = await syncCalendar();
    if (result.failed) console.error("Google Calendar sync had failures.", { failed: result.failed, error: result.error });
  } catch (err) {
    console.error("Google Calendar sync failed.", { message: errorText(err) });
  }
}

/** Mennyi naptárművelet vár még (az admin felülethez). */
export async function calendarBacklog(): Promise<{ pending: number; lastError: string | null }> {
  const [dirty, deletions] = await Promise.all([
    bookingStore<Array<{ gcal_error: string | null }>>("studio_slots?select=gcal_error&gcal_dirty=is.true&limit=1000"),
    bookingStore<Array<{ slot_id: string }>>("gcal_deletions?select=slot_id&limit=1000"),
  ]);
  return { pending: dirty.length + deletions.length, lastError: dirty.find((row) => row.gcal_error)?.gcal_error ?? null };
}
