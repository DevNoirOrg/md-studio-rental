import { createSign } from "node:crypto";
import { bookingStore } from "./booking-store.ts";
import { withBase } from "./base-path.ts";
import { ROOM_IDS, type LessonType, type Room } from "./room-config.ts";
import { endHour, formatBookingHour, type Customer } from "./studio-booking.ts";

/*
  Google Naptár szinkron — EGYIRÁNYÚ: a foglalási rendszer írja a termek Google Naptárait.
   - Csak a jóváhagyott („Foglalás alatt”) idősávok kerülnek be; minden idősáv külön esemény.
   - Egy közös naptár (a stúdió fiókjában) az összes teremmel; a termeket az esemény színe
     és a cím eleje különbözteti meg (ROOM_CALENDAR).
   - Átfoglaláskor az esemény átkerül, törléskor törlődik. A naptárban végzett kézi
     módosítás nem hat vissza (a következő szinkron felülírhatja).
   - Az esemény azonosítója az idősáv azonosítója (kötőjelek nélkül), így a szinkron
     bármikor megismételhető, kétszer nem jön létre ugyanaz az esemény.
   - Mit kell szinkronizálni: rental.studio_slots.gcal_dirty és rental.gcal_deletions
     (adatbázis-triggerek töltik, lásd supabase/studio-bookings.sql).

  Beállítás (Vercel környezeti változók, csak szerveren):
    GOOGLE_SERVICE_ACCOUNT_JSON — a Google szolgáltatásfiók kulcsa (a letöltött JSON teljes tartalma)
    GOOGLE_CALENDAR_ID          — a közös naptár azonosítója (Google Naptár → a naptár beállításai →
                                  „Naptár integrálása” → „Naptárazonosító”; a fő naptárnál maga a
                                  Gmail-cím, pl. info.mddancestudio@gmail.com)
  A naptárat meg kell osztani a szolgáltatásfiók e-mail címével („Módosíthatja az eseményeket”).
*/

/**
 * Termenként: rövid név az esemény címéhez és a Google Naptár eseményszíne
 * (colorId: 11 = Paradicsom/piros, 5 = Banán/sárga, 3 = Szőlő/lila, 10 = Bazsalikom/zöld).
 */
export const ROOM_CALENDAR: Record<Room, { short: string; colorId: string; envKey: string }> = {
  "Astoria - Nagy Terem": { short: "Astoria Nagy", colorId: "11", envKey: "GOOGLE_CALENDAR_ID_ASTORIA_NAGY" },
  "Astoria - Kis Terem": { short: "Astoria Kis", colorId: "5", envKey: "GOOGLE_CALENDAR_ID_ASTORIA_KIS" },
  "Opera - Nagy Terem": { short: "Opera Nagy", colorId: "3", envKey: "GOOGLE_CALENDAR_ID_OPERA_NAGY" },
  "Opera - Közepes Terem": { short: "Opera Közepes", colorId: "10", envKey: "GOOGLE_CALENDAR_ID_OPERA_KOZEPES" },
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

/** Be van-e állítva a szinkron (szolgáltatásfiók + legalább egy naptár). */
export function calendarConfigured(): boolean {
  return !!serviceAccount() && (!!calendarId() || ROOM_IDS.some((room) => !!roomCalendarEnv(room)));
}

/** A közös naptár azonosítója (ebbe kerül az a terem, amelyiknek nincs saját naptára). */
export function calendarId(): string | null {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || null;
}

function roomCalendarEnv(room: string): string | null {
  const key = (ROOM_CALENDAR as Record<string, { envKey: string }>)[room]?.envKey;
  return (key && process.env[key]?.trim()) || null;
}

/**
 * A terem naptára: GOOGLE_CALENDAR_ID_<TEREM> (pl. GOOGLE_CALENDAR_ID_OPERA_NAGY), ha nincs megadva,
 * a közös naptár. Így a termek naptárai külön ki- és bekapcsolhatók a Google Naptárban.
 */
export function calendarIdFor(room: string): string | null {
  return roomCalendarEnv(room) ?? calendarId();
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
  /** Az igény fizetési állapota: awaiting → a címben „(fizetésre vár)”. */
  paymentStatus?: string | null;
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
  const room = (ROOM_CALENDAR as Record<string, { short: string; colorId: string }>)[slot.room];
  const description = [
    `Név: ${slot.customer.name}`,
    `Telefon: ${slot.customer.phone}`,
    `E-mail: ${slot.customer.email}`,
    ...(slot.customer.language === "en" ? ["Nyelv: angol (angolul válaszolj)"] : []),
    `Óratípus: ${lesson}`,
    `Időpont: ${start}–${formatBookingHour(end)} (${slot.durationMinutes} perc)`,
    `Ár: ${currency.format(slot.price)}`,
    ...(slot.paymentStatus === "awaiting" ? ["Fizetés: még nincs kifizetve"] : slot.paymentStatus === "paid" ? ["Fizetés: fizetve"] : []),
    ...(adminUrl ? ["", `Megnyitás az adminban: ${adminUrl}`] : []),
    "",
    "Ezt az eseményt a foglalási rendszer kezeli — itt ne módosítsd, mert felülíródhat.",
  ].join("\n");
  return {
    id: eventIdFor(slot.id),
    status: "confirmed",
    summary: `${room?.short ?? slot.room} · ${lesson} – ${slot.customer.name}${slot.customer.language === "en" ? " (EN)" : ""}${slot.paymentStatus === "awaiting" ? " (nincs fizetve)" : ""}`,
    ...(room ? { colorId: room.colorId } : {}),
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

/** Esemény áthelyezése másik naptárba (pl. a közös naptárból a terem saját naptárába). false: nincs ott. */
async function moveEvent(token: string, from: string, to: string, slotId: string): Promise<boolean> {
  const response = await googleRequest(token, "POST",
    `/calendars/${encodeURIComponent(from)}/events/${eventIdFor(slotId)}/move?destination=${encodeURIComponent(to)}`);
  if (response.status === 404 || response.status === 410) return false;
  if (!response.ok) throw await googleError(response, from);
  return true;
}

/** Törlés minden naptárból, ahol az esemény lehet (a régi és a mostani helyén is). */
async function deleteEverywhere(token: string, slotId: string, candidates: Array<string | null | undefined>) {
  for (const cal of [...new Set(candidates.filter((c): c is string => !!c))]) await deleteEvent(token, cal, slotId);
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
  /** Melyik naptárba írtuk utoljára (null: még sehova, vagy a termenkénti naptárak előtt — a közösbe). */
  gcal_calendar_id?: string | null;
  gcal_synced_at?: string | null;
  studio_requests: { customer: Customer; lesson_type: LessonType; payment_status?: string | null } | null;
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
  const common = calendarId();

  // 0) termenkénti naptár beállítása / váltása után: a jövőbeli események áthelyezése a terem naptárába
  if (ROOM_IDS.some((room) => !!roomCalendarEnv(room))) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
    for (const room of ROOM_IDS) {
      const target = calendarIdFor(room);
      if (!target) continue;
      const params = new URLSearchParams({
        room: `eq.${room}`, status: "eq.approved", gcal_dirty: "is.false", gcal_synced_at: "not.is.null", date: `gte.${today}`,
        or: `(gcal_calendar_id.is.null,gcal_calendar_id.neq."${target.replace(/"/g, "")}")`,
      });
      // régi (közös naptárba írt) eseménynél a gcal_calendar_id üres; ha a cél is a közös naptár, nincs teendő
      if (target === common) params.set("gcal_calendar_id", "not.is.null");
      try {
        await bookingStore(`studio_slots?${params}`, { method: "PATCH", body: { gcal_dirty: true } });
      } catch (err) {
        fail(err);
      }
    }
  }

  // 1) törölt idősávok eseményei
  const deletions = await bookingStore<Array<{ slot_id: string; room: string; calendar_id?: string | null }>>(
    `gcal_deletions?select=slot_id,room,calendar_id&order=created_at&limit=${BATCH}`,
  );
  for (const row of deletions) {
    try {
      await deleteEverywhere(token, row.slot_id, [row.calendar_id, calendarIdFor(row.room), common]);
      await bookingStore(`gcal_deletions?slot_id=eq.${row.slot_id}`, { method: "DELETE" });
      result.removed++;
    } catch (err) {
      fail(err);
    }
  }

  // 2) új / módosult idősávok
  const dirty = await bookingStore<DirtyRow[]>(
    `studio_slots?select=id,room,date,hour,duration_minutes,price,status,gcal_calendar_id,gcal_synced_at,studio_requests(customer,lesson_type,payment_status)&gcal_dirty=is.true&order=date,hour&limit=${BATCH}`,
  );
  for (const row of dirty) {
    // csak akkor jelöljük késznek, ha közben nem változott (különben a következő szinkron újra elvégzi)
    const unchanged = new URLSearchParams({
      id: `eq.${row.id}`, room: `eq.${row.room}`, date: `eq.${row.date}`, hour: `eq.${row.hour}`,
      duration_minutes: `eq.${row.duration_minutes}`, status: `eq.${row.status}`,
    });
    try {
      const approved = row.status === "approved" && !!row.studio_requests;
      const target = calendarIdFor(row.room);
      // ahol most van az esemény: a tárolt naptár, vagy (a termenkénti naptárak előtti eseménynél) a közös
      const current = row.gcal_calendar_id ?? (row.gcal_synced_at ? common : null);
      if (approved && target) {
        const slot: CalendarSlot = {
          id: row.id, room: row.room, date: row.date, hour: Number(row.hour), durationMinutes: row.duration_minutes,
          price: row.price, lessonType: row.studio_requests!.lesson_type, customer: row.studio_requests!.customer,
          paymentStatus: row.studio_requests!.payment_status ?? null,
        };
        // másik naptárban van (pl. a közösben) → áthelyezés, hogy ne legyen duplikált esemény
        if (current && current !== target) {
          try {
            await moveEvent(token, current, target, row.id);
          } catch {
            await deleteEvent(token, current, row.id).catch(() => {});
          }
        }
        await upsertEvent(token, target, buildEvent(slot, adminUrlFor(slot)));
        result.written++;
      } else {
        await deleteEverywhere(token, row.id, [current, target, common]);
        result.removed++;
      }
      await bookingStore(`studio_slots?${unchanged}`, {
        method: "PATCH",
        body: {
          gcal_dirty: false, gcal_error: null,
          gcal_synced_at: approved && target ? new Date().toISOString() : null,
          gcal_calendar_id: approved && target ? target : null,
        },
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
