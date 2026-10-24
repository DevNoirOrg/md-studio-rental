import { withBase } from "./base-path.ts";

/*
  A termek beállításai (adminban szerkeszthetők, a rental.rooms táblában vannak).
  A terem azonosítója (pl. "Astoria - Nagy Terem") fix: a foglalások ezzel hivatkoznak rá.
  Az adatbázisban tárolt érték mindig az alábbi alapértékekre fésülődik rá, így egy
  üres ({}) sor is teljes, működő beállítást ad.
*/

export const ROOM_IDS = [
  "Astoria - Nagy Terem",
  "Astoria - Kis Terem",
  "Opera - Nagy Terem",
  "Opera - Közepes Terem",
] as const;
export type Room = (typeof ROOM_IDS)[number];

export const LESSON_TYPES = ["privat", "kiscsoportos", "csoportos"] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export const MEDIA_BUCKET = "rental";

/** Egy nap nyitvatartása (órában, fél órás lépéssel, pl. 8.5 = 8:30). */
export interface DayHours {
  closed: boolean;
  open: number;
  close: number;
}

export interface RoomConfig {
  location: string;
  name: string;
  /** Az első a kártya képe, a többi a galéria. "/…" = public mappa, egyébként Storage-útvonal. */
  images: string[];
  area: number;
  length: number;
  width: number;
  height: number;
  capacity: number;
  ac: boolean;
  sound: string;
  mirror: string;
  floor: string;
  light: string;
  extras: string[];
  description: string;
  /** Milyen óratípusra foglalható. */
  lessonTypes: LessonType[];
  /** Óradíj (Ft / óra) óratípusonként. */
  prices: Record<LessonType, number>;
  /** Heti nyitvatartás: 0 = hétfő … 6 = vasárnap. */
  hours: DayHours[];
}

export type RoomsConfig = Record<Room, RoomConfig>;

export const WEEKDAY_NAMES = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"];

const everyDay = (open: number, close: number): DayHours[] =>
  Array.from({ length: 7 }, () => ({ closed: false, open, close }));
const samePrice = (price: number): Record<LessonType, number> => ({ privat: price, kiscsoportos: price, csoportos: price });

export const defaultRoomsConfig: RoomsConfig = {
  "Astoria - Nagy Terem": {
    location: "Astoria stúdió",
    name: "Nagy Terem",
    images: ["/rooms/astoria-nagy-foto.jpg"],
    area: 120,
    length: 15,
    width: 8,
    height: 3.5,
    capacity: 36,
    ac: true,
    sound: "2 × 1000 W aktív hangfal, keverő, Bluetooth és jack csatlakozás",
    mirror: "15 méteres, teljes falas tükör",
    floor: "Rugalmas táncpadló balettszőnyeggel",
    light: "Szabályozható LED-világítás",
    extras: ["Öltöző és zuhany", "Ingyenes Wi-Fi", "Ivóvíz-adagoló"],
    description:
      "A legnagyobb termünk: tágas tér nagy létszámú csoportos órákhoz, workshopokhoz és próbákhoz, teljes falas tükörrel és erős hangrendszerrel.",
    lessonTypes: ["privat", "kiscsoportos", "csoportos"],
    prices: samePrice(1000),
    hours: everyDay(8, 22),
  },
  "Astoria - Kis Terem": {
    location: "Astoria stúdió",
    name: "Kis Terem",
    images: ["/rooms/astoria-kis-foto.jpg"],
    area: 60,
    length: 10,
    width: 6,
    height: 3.2,
    capacity: 18,
    ac: true,
    sound: "2 × 500 W aktív hangfal, Bluetooth és jack csatlakozás",
    mirror: "10 méteres tükörfal",
    floor: "Rugalmas táncpadló balettszőnyeggel",
    light: "Szabályozható LED-világítás",
    extras: ["Öltöző", "Ingyenes Wi-Fi"],
    description: "Meghitt, jól felszerelt terem kiscsoportos órákhoz, privát edzésekhez és koreográfia-gyakorláshoz.",
    lessonTypes: ["privat", "kiscsoportos"],
    prices: samePrice(2000),
    hours: everyDay(8, 22),
  },
  "Opera - Nagy Terem": {
    location: "Opera stúdió",
    name: "Nagy Terem",
    images: ["/rooms/opera-nagy-foto.jpg"],
    area: 90,
    length: 12,
    width: 7.5,
    height: 3.4,
    capacity: 24,
    ac: true,
    sound: "2 × 800 W aktív hangfal, mélynyomó, Bluetooth és jack csatlakozás",
    mirror: "12 méteres tükörfal",
    floor: "Parketta táncpadló",
    light: "Természetes fény + LED-világítás",
    extras: ["Öltöző és zuhany", "Ingyenes Wi-Fi"],
    description:
      "Világos, nagy belmagasságú terem természetes fénnyel — ideális kiscsoportos órákhoz, próbákhoz és videóforgatáshoz.",
    lessonTypes: ["privat", "kiscsoportos"],
    prices: samePrice(3000),
    hours: everyDay(8, 22),
  },
  "Opera - Közepes Terem": {
    location: "Opera stúdió",
    name: "Közepes Terem",
    images: ["/rooms/opera-kis-foto.jpg"],
    area: 55,
    length: 11,
    width: 5,
    height: 3,
    capacity: 18,
    ac: true,
    sound: "Bluetooth hangfal (2 × 300 W)",
    mirror: "11 méteres tükörfal",
    floor: "Parketta táncpadló",
    light: "LED-világítás",
    extras: ["Ingyenes Wi-Fi"],
    description: "Közepes méretű terem kiscsoportos és privát órákhoz, gyakorláshoz és próbákhoz.",
    lessonTypes: ["privat", "kiscsoportos"],
    prices: samePrice(4000),
    hours: everyDay(8, 22),
  },
};

// ---------------------------------------------------------------------
//  Beolvasás: a tárolt (esetleg hiányos) érték ráfésülése az alapértékre
// ---------------------------------------------------------------------
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
const strList = (v: unknown, d: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : d);
const isHalfHour = (h: unknown): h is number => typeof h === "number" && h >= 0 && h <= 24 && Number.isInteger(h * 2);

export function isValidDay(day: DayHours): boolean {
  return day.closed || (isHalfHour(day.open) && isHalfHour(day.close) && day.close - day.open >= 1);
}

export function normalizeRoomConfig(id: Room, raw: unknown): RoomConfig {
  const d = defaultRoomsConfig[id];
  const r = isObj(raw) ? raw : {};
  const prices = isObj(r.prices) ? r.prices : {};
  const hours = Array.isArray(r.hours) && r.hours.length === 7 ? r.hours : d.hours;
  return {
    location: str(r.location, d.location),
    name: str(r.name, d.name),
    images: strList(r.images, d.images),
    area: num(r.area, d.area),
    length: num(r.length, d.length),
    width: num(r.width, d.width),
    height: num(r.height, d.height),
    capacity: num(r.capacity, d.capacity),
    ac: typeof r.ac === "boolean" ? r.ac : d.ac,
    sound: str(r.sound, d.sound),
    mirror: str(r.mirror, d.mirror),
    floor: str(r.floor, d.floor),
    light: str(r.light, d.light),
    extras: strList(r.extras, d.extras),
    description: str(r.description, d.description),
    lessonTypes: Array.isArray(r.lessonTypes)
      ? LESSON_TYPES.filter((t) => (r.lessonTypes as unknown[]).includes(t))
      : [...d.lessonTypes],
    prices: Object.fromEntries(
      LESSON_TYPES.map((t) => [t, typeof prices[t] === "number" && (prices[t] as number) > 0 ? Math.round(prices[t] as number) : d.prices[t]]),
    ) as Record<LessonType, number>,
    hours: hours.map((h: unknown, i: number) => {
      const day = isObj(h) ? { closed: h.closed === true, open: h.open as number, close: h.close as number } : null;
      if (!day || !isValidDay(day)) return d.hours[i];
      if (!day.closed) return day;
      // zárt napnál is megtartjuk a beírt időket (ha újranyitják, ne vesszenek el)
      const keep = isHalfHour(day.open) && isHalfHour(day.close) && day.close - day.open >= 1;
      return { closed: true, open: keep ? day.open : d.hours[i].open, close: keep ? day.close : d.hours[i].close };
    }),
  };
}

/** Az adatbázis soraiból (id + data) a teljes beállítás; a hiányzó termek az alapértéket kapják. */
export function roomsConfigFromRows(rows: Array<{ id: string; data: unknown }>): RoomsConfig {
  const byId = new Map(rows.map((row) => [row.id, row.data]));
  return Object.fromEntries(ROOM_IDS.map((id) => [id, normalizeRoomConfig(id, byId.get(id))])) as RoomsConfig;
}

// ---------------------------------------------------------------------
//  Segédfüggvények
// ---------------------------------------------------------------------

/** "YYYY-MM-DD" → a hét napja (0 = hétfő … 6 = vasárnap). */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** A terem nyitvatartása az adott napon (null = zárva). */
export function openingFor(config: RoomsConfig, room: string, date: string): { open: number; close: number } | null {
  const c = (config as Record<string, RoomConfig>)[room];
  if (!c) return null;
  const day = c.hours[weekdayIndex(date)];
  return !day || day.closed ? null : { open: day.open, close: day.close };
}

/** A terem legkorábbi nyitása és legkésőbbi zárása a hét bármely napján (a naptár rácsához). */
export function weeklyRange(c: RoomConfig): { start: number; end: number } {
  const open = c.hours.filter((h) => !h.closed);
  if (!open.length) return { start: 8, end: 22 };
  return { start: Math.min(...open.map((h) => h.open)), end: Math.max(...open.map((h) => h.close)) };
}

export function roomLabel(config: RoomsConfig, room: string): string {
  const c = (config as Record<string, RoomConfig>)[room];
  return c ? [c.location, c.name].filter(Boolean).join(" · ") : room;
}

export function roomAllows(config: RoomsConfig, room: string, lessonType: LessonType): boolean {
  return !!(config as Record<string, RoomConfig>)[room]?.lessonTypes.includes(lessonType);
}

export function hourlyPrice(config: RoomsConfig, room: string, lessonType: LessonType): number {
  return (config as Record<string, RoomConfig>)[room]?.prices[lessonType] ?? NaN;
}

/** Kép címe: "/…" = a public mappából (basePath-szal), "http…" = külső, egyébként Supabase Storage. */
export function mediaUrl(path: string): string {
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return withBase(path);
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}
