// A stúdiófoglalás közös üzleti logikája (kliens, szerver és tesztek is ezt használják).

import {
  ROOM_IDS, LESSON_TYPES, defaultRoomsConfig, openingFor, roomAllows, hourlyPrice,
  type Room, type LessonType, type RoomsConfig,
} from "./room-config.ts";

export type { Room, LessonType, RoomsConfig };
/** A termek fix azonosítói (a megjelenített nevek a terembeállításokban vannak). */
export const rooms = ROOM_IDS;
export const lessonTypeIds = LESSON_TYPES;

/** Egy idősáv: terem, nap (YYYY-MM-DD), kezdés órában (fél órás lépés), hossz percben. */
export interface Slot {
  room: string;
  date: string;
  hour: number;
  durationMinutes?: number;
}

export type SlotStatus = "pending" | "approved" | "rejected";

export interface StoredSlot extends Slot {
  id?: string;
  status?: SlotStatus | string;
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
}

/** Az admin naptár által betöltött foglalás (GET /admin/api/bookings). */
export interface AdminSlot {
  id: string;
  room: string;
  date: string;
  hour: number;
  durationMinutes: number;
  status: SlotStatus;
  price: number;
  lessonType: LessonType;
  customer: Customer;
  /** Google Naptár állapot: pending = szinkronra vár, synced = bent van a naptárban. */
  calendar?: { pending: boolean; synced: boolean; error: string | null };
}

export interface PricedSlot extends Required<Pick<Slot, "room" | "date" | "hour" | "durationMinutes">> {
  price: number;
}

export interface ValidBooking {
  lessonType: LessonType;
  customer: Customer;
  slots: PricedSlot[];
  total: number;
}

export const emailPattern = "[A-Za-z0-9.!#$%&'*+\\/=?^_`\\{\\|\\}~\\-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9\\-]*[A-Za-z0-9])?\\.)+[A-Za-z]{2,}";

export function isRoom(value: unknown): value is Room {
  return typeof value === "string" && (rooms as readonly string[]).includes(value);
}

export function endHour(slot: Slot): number {
  return slot.hour + (slot.durationMinutes ?? 60) / 60;
}

export function overlaps(a: Slot, b: Slot): boolean {
  return a.room === b.room && a.date === b.date &&
    a.hour < endHour(b) && b.hour < endHour(a);
}

/** Az idősáv ára: a terem adott óratípusra érvényes óradíja × időtartam. */
export function bookingPrice(slot: Slot, lessonType: LessonType, config: RoomsConfig = defaultRoomsConfig): number {
  return hourlyPrice(config, slot.room, lessonType) * (slot.durationMinutes ?? 60) / 60;
}

export function formatBookingHour(hour: number): string {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Az idősáv ellenőrzése: formátum, nem múlt el, és (ha a terem ismert) a terem
 * aznapi nyitvatartásán belül van.
 */
export function validateBookingTime(
  { room, date, hour, durationMinutes }: { room?: unknown; date?: unknown; hour?: unknown; durationMinutes?: unknown },
  now: Date = new Date(),
  config: RoomsConfig = defaultRoomsConfig,
): string | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof hour !== "number" || !Number.isInteger(hour * 2) || hour < 0 ||
      typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes) || durationMinutes < 60 ||
      durationMinutes % 30 !== 0 || hour + durationMinutes / 60 > 24) {
    return "Érvénytelen terem vagy idősáv.";
  }
  const parsedDate = new Date(`${date}T00:00:00Z`);
  // Budapest helyi idejéhez hasonlítunk, függetlenül a szerver időzónájától.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const current = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date ||
      `${date}T${formatBookingHour(hour)}` <= current) {
    return "Az egyik időpont érvénytelen vagy már elmúlt. Válassz másik idősávot.";
  }
  if (typeof room === "string") {
    const opening = openingFor(config, room, date);
    if (!opening) return "A terem ezen a napon zárva van. Válassz másik napot.";
    if (hour < opening.open || hour + durationMinutes / 60 > opening.close) {
      return `A terem aznap ${formatBookingHour(opening.open)} és ${formatBookingHour(opening.close)} között foglalható.`;
    }
  }
  return null;
}

export function canRescheduleBooking(
  booking: StoredSlot,
  target: Slot,
  slots: StoredSlot[],
  now: Date = new Date(),
  config: RoomsConfig = defaultRoomsConfig,
): boolean {
  return target.room === booking.room && target.durationMinutes === booking.durationMinutes &&
    !validateBookingTime(target, now, config) &&
    !slots.some((slot) => slot.id !== booking.id && overlaps(slot, target));
}

export function validateBooking(
  input: unknown,
  now: Date = new Date(),
  config: RoomsConfig = defaultRoomsConfig,
): { booking: ValidBooking; error?: undefined } | { error: string; booking?: undefined } {
  if (!input || typeof input !== "object") {
    return { error: "Hiányzó foglalási adatok." };
  }
  const { customer, slots, lessonType } = input as {
    customer?: Partial<Record<keyof Customer, unknown>>;
    slots?: unknown;
    lessonType?: unknown;
  };
  if (!customer || typeof customer.name !== "string" ||
      !customer.name.trim() || customer.name.length > 200) {
    return { error: "Adj meg érvényes nevet (legfeljebb 200 karakter)." };
  }
  if (typeof customer.email !== "string" || customer.email.length > 254 ||
      !new RegExp(`^${emailPattern}$`).test(customer.email)) {
    return { error: "Adj meg érvényes e-mail címet domainvégződéssel." };
  }
  if (typeof customer.phone !== "string" || customer.phone.length > 40 ||
      !/^[+\d\s()-]+$/.test(customer.phone) ||
      !/^\+[1-9]\d{6,14}$/.test(customer.phone.replace(/[\s()-]/g, ""))) {
    return { error: "Adj meg országkóddal kezdődő, érvényes telefonszámot." };
  }
  if (!(lessonTypeIds as readonly unknown[]).includes(lessonType) ||
      !Array.isArray(slots) || slots.length === 0 || slots.length > 100) {
    return { error: "Válassz óratípust és 1–100 idősávot." };
  }

  const seen = new Set<string>();
  const bookings: PricedSlot[] = [];
  for (const raw of slots as Array<Partial<Slot> | null | undefined>) {
    const durationMinutes = raw?.durationMinutes ?? 60;
    if (!raw || !isRoom(raw.room)) {
      return { error: "Érvénytelen terem vagy idősáv." };
    }
    if (!roomAllows(config, raw.room, lessonType as LessonType)) {
      return { error: "A választott óratípus ebben a teremben nem foglalható." };
    }
    const timeError = validateBookingTime({ ...raw, durationMinutes }, now, config);
    if (timeError) return { error: timeError };
    const slot = { room: raw.room, date: raw.date as string, hour: raw.hour as number, durationMinutes };
    const key = `${slot.room}/${slot.date}/${slot.hour}`;
    if (seen.has(key)) return { error: "Ugyanaz az idősáv többször szerepel." };
    seen.add(key);
    if (bookings.some((existing) => overlaps(existing, slot))) {
      return { error: "A kiválasztott időszakok átfedik egymást." };
    }
    bookings.push({ ...slot, price: bookingPrice(slot, lessonType as LessonType, config) });
  }
  return {
    booking: {
      lessonType: lessonType as LessonType,
      customer: { name: customer.name.trim(), email: customer.email, phone: customer.phone.trim() },
      slots: bookings,
      total: bookings.reduce((sum, slot) => sum + slot.price, 0),
    },
  };
}
