// A stúdiófoglalás közös üzleti logikája (kliens, szerver és tesztek is ezt használják).

export const rooms = [
  "Astoria - Nagy Terem",
  "Astoria - Kis Terem",
  "Opera - Nagy Terem",
  "Opera - Közepes Terem",
] as const;

export type Room = (typeof rooms)[number];

export const roomPrices: Record<Room, number> = {
  "Astoria - Nagy Terem": 1000,
  "Astoria - Kis Terem": 2000,
  "Opera - Nagy Terem": 3000,
  "Opera - Közepes Terem": 4000,
};

export const lessonTypeIds = ["privat", "kiscsoportos", "csoportos"] as const;
export type LessonType = (typeof lessonTypeIds)[number];

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

export function bookingPrice(slot: Slot): number {
  return (isRoom(slot.room) ? roomPrices[slot.room] : NaN) * (slot.durationMinutes ?? 60) / 60;
}

export function formatBookingHour(hour: number): string {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function validateBookingTime(
  { date, hour, durationMinutes }: { date?: unknown; hour?: unknown; durationMinutes?: unknown },
  now: Date = new Date(),
): string | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof hour !== "number" || !Number.isInteger(hour * 2) || hour < 8 ||
      typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes) || durationMinutes < 60 ||
      durationMinutes % 30 !== 0 || hour + durationMinutes / 60 > 22) {
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
  return null;
}

export function canRescheduleBooking(
  booking: StoredSlot,
  target: Slot,
  slots: StoredSlot[],
  now: Date = new Date(),
): boolean {
  return target.room === booking.room && target.durationMinutes === booking.durationMinutes &&
    !validateBookingTime(target, now) &&
    !slots.some((slot) => slot.id !== booking.id && overlaps(slot, target));
}

export function validateBooking(
  input: unknown,
  now: Date = new Date(),
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
    if (!raw || !isRoom(raw.room) ||
        (lessonType === "csoportos" && raw.room !== rooms[0])) {
      return { error: "Érvénytelen terem vagy idősáv." };
    }
    const timeError = validateBookingTime({ ...raw, durationMinutes }, now);
    if (timeError) return { error: timeError };
    const slot = { room: raw.room, date: raw.date as string, hour: raw.hour as number, durationMinutes };
    const key = `${slot.room}/${slot.date}/${slot.hour}`;
    if (seen.has(key)) return { error: "Ugyanaz az idősáv többször szerepel." };
    seen.add(key);
    if (bookings.some((existing) => overlaps(existing, slot))) {
      return { error: "A kiválasztott időszakok átfedik egymást." };
    }
    bookings.push({ ...slot, price: bookingPrice(slot) });
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
