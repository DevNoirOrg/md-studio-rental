/*
  Saját órák: a stúdió saját, ismétlődő foglalásai (pl. félévre a táncórák).
  Egy sorozat: 1 terem, 1 idősáv, a hét egy vagy több napja, egy időszak (legfeljebb kb. 1 év),
  és a kihagyandó szünetek. Az alkalmak sima, jóváhagyott idősávok (ár 0, ügyfél nélkül):
  a foglalóoldalon „foglalt”-ként látszanak, az admin naptárban szürkén, egyenként törölhetők
  (= felszabadítás), rövidíthetők és áthelyezhetők. A nyitvatartás rájuk nem vonatkozik.
*/

export const OWN_NAME_MAX = 80;
/** A sorozat legfeljebb ennyi napot fedhet le (kb. 1 év). */
export const OWN_MAX_DAYS = 366;
export const WEEKDAY_NAMES = ["hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat", "vasárnap"] as const;
export const WEEKDAY_SHORT = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

export interface ExcludedPeriod {
  from: string;
  to: string;
}

export interface OwnSeriesInput {
  name: string;
  room: string;
  /** 0 = hétfő … 6 = vasárnap */
  weekdays: number[];
  hour: number;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  excluded: ExcludedPeriod[];
}

const DAY = 86_400_000;
const toMs = (date: string) => Date.parse(`${date}T12:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Érvényes "YYYY-MM-DD" dátum-e. */
export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDate(toMs(value)) === value;
}

/** A két dátum között eltelt napok száma (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY);
}

/** A sorozat alkalmainak dátumai (a szünetek nélkül). */
export function ownSeriesDates(input: Pick<OwnSeriesInput, "weekdays" | "startDate" | "endDate" | "excluded">): string[] {
  if (!isDay(input.startDate) || !isDay(input.endDate) || input.endDate < input.startDate) return [];
  const days = new Set(input.weekdays);
  const result: string[] = [];
  for (let ms = toMs(input.startDate); ms <= toMs(input.endDate); ms += DAY) {
    const date = toDate(ms);
    const weekday = (new Date(ms).getUTCDay() + 6) % 7;
    if (!days.has(weekday)) continue;
    if (input.excluded.some((p) => date >= p.from && date <= p.to)) continue;
    result.push(date);
  }
  return result;
}

/** Az idősáv ellenőrzése (fél órás lépés, legalább 1 óra, a napon belül). Hiba esetén a magyar üzenet. */
export function ownTimeError(hour: number, durationMinutes: number): string | null {
  if (!Number.isFinite(hour) || hour < 0 || hour >= 24 || !Number.isInteger(hour * 2)) return "A kezdés csak egész vagy fél óra lehet.";
  if (!Number.isInteger(durationMinutes) || durationMinutes < 60 || durationMinutes % 30 !== 0) return "Az időtartam legalább 1 óra, fél órás lépéssel.";
  if (hour * 60 + durationMinutes > 24 * 60) return "Az idősáv nem nyúlhat át a következő napra.";
  return null;
}

/** A sorozat ellenőrzése; hiba esetén a magyar üzenet. */
export function ownSeriesError(input: OwnSeriesInput): string | null {
  if (!input.name.trim()) return "Adj meg egy nevet (pl. „Hip-hop kezdő”).";
  if (input.name.trim().length > OWN_NAME_MAX) return `A név legfeljebb ${OWN_NAME_MAX} karakter lehet.`;
  if (!input.weekdays.length || input.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Válaszd ki, a hét melyik napjain van az óra.";
  const time = ownTimeError(input.hour, input.durationMinutes);
  if (time) return time;
  if (!isDay(input.startDate) || !isDay(input.endDate)) return "Adj meg érvényes kezdő- és záródátumot.";
  if (input.endDate < input.startDate) return "A záródátum nem lehet a kezdődátum előtt.";
  if (daysBetween(input.startDate, input.endDate) > OWN_MAX_DAYS) return "Egy sorozat legfeljebb 1 évre szólhat.";
  for (const p of input.excluded) {
    if (!isDay(p.from) || !isDay(p.to) || p.to < p.from) return "Egy szünet dátumai hibásak (a vége nem lehet az eleje előtt).";
  }
  if (!ownSeriesDates(input).length) return "Ebben az időszakban a kiválasztott napokon nincs egy alkalom sem.";
  return null;
}
