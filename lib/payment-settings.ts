/*
  Fizetési beállítások (admin → Fizetés és e-mailek), a rental.settings 'payments' sorában.
    enabled          — online fizetés (Stripe) bekapcsolva; kikapcsolva minden úgy megy, mint eddig,
                       csak az ügyfél-e-mailek mennek ki (fizetési link nélkül)
    deadlineEnabled  — lejáratkor felszabaduljanak-e az időpontok (kikapcsolva soha nem szabadul fel semmi)
    nearHours        — ha jóváhagyáskor az első időpont ennyi órán belül van, nincs határidő: a foglalás
                       bent marad, és a fizetési link az időpont után is él (az adminban piros, amíg nincs fizetve)
    payWithinHours   — különben ennyi óra van fizetni a jóváhagyástól; ha nem fizet, felszabadul
    codes            — havonta cserélt bejutási kódok stúdiónként; a bejutási szövegben a {KÓD} helyére
                       a foglalás napjának hónapja szerinti kód kerül
    vat              — a számla ÁFA-kulcsa a Billingóban (pl. "27%", "AAM")
    billingo*        — melyik számlatömbbe / bankszámlára menjen a számla; teszt üzemmódban
                       (Stripe sandbox kulcs) díjbekérő készül a díjbekérő tömbbe — ez nem megy a NAV-hoz
    invoiceComment   — megjegyzés a számlán (pl. a tárgyi adómentesség jogcíme)
    itemName         — a számlatétel megnevezésének eleje (utána: terem, dátum, időpont)
    access           — a bejutási infók szövege stúdiónként, magyarul és angolul
*/

export const PAYMENT_SETTINGS_KEY = "payments";
export const STUDIOS = ["astoria", "opera"] as const;
export type Studio = (typeof STUDIOS)[number];
export const STUDIO_NAMES: Record<Studio, string> = { astoria: "Astoria stúdió", opera: "Opera stúdió" };

export interface Bilingual {
  hu: string;
  en: string;
}

export interface PaymentSettings {
  enabled: boolean;
  deadlineEnabled: boolean;
  nearHours: number;
  payWithinHours: number;
  vat: string;
  billingoBlockId: number | null;
  billingoBankAccountId: number | null;
  /** Teszt üzemmódban (Stripe sandbox) ebbe a tömbbe készül díjbekérő; ha üres, a számlatömbbe. */
  billingoProformaBlockId: number | null;
  itemName: Bilingual;
  invoiceComment: Bilingual;
  access: Record<Studio, Bilingual>;
  codes: Record<Studio, MonthlyCode[]>;
}

/** Egy hónap bejutási kódja (month: "YYYY-MM"). */
export interface MonthlyCode {
  month: string;
  code: string;
}

export const VAT_OPTIONS = ["27%", "AAM", "TAM", "18%", "5%", "0%"] as const;

export const defaultPaymentSettings: PaymentSettings = {
  enabled: false,
  deadlineEnabled: true,
  nearHours: 48,
  payWithinHours: 24,
  vat: "27%",
  billingoBlockId: null,
  billingoBankAccountId: null,
  billingoProformaBlockId: null,
  itemName: { hu: "Teremhasználat", en: "Studio rental" },
  invoiceComment: { hu: "", en: "" },
  access: {
    astoria: { hu: "", en: "" },
    opera: { hu: "", en: "" },
  },
  codes: { astoria: [], opera: [] },
};

/** A bejutási szövegben a kód helyőrzője (mindegyik formát elfogadjuk). */
const CODE_PLACEHOLDER = /\{\s*(?:KÓD|KOD|CODE)\s*\}/gi;
export const hasCodePlaceholder = (text: string) => new RegExp(CODE_PLACEHOLDER.source, "i").test(text);

/** A foglalás napjának hónapjára érvényes kód (vagy null, ha nincs megadva). */
export function codeFor(settings: Pick<PaymentSettings, "codes">, studio: Studio, day: string): string | null {
  const month = day.slice(0, 7);
  return settings.codes[studio].find((c) => c.month === month && c.code.trim())?.code.trim() ?? null;
}

/**
 * A bejutási szöveg a foglalás napjára: a {KÓD} helyére a hónap kódja kerül.
 * missing: van helyőrző, de arra a hónapra nincs kód (ilyenkor egy „hamarosan küldjük” szöveg kerül a helyére).
 */
export function renderAccessText(text: string, code: string | null, locale: "hu" | "en"): { text: string; missing: boolean } {
  if (!hasCodePlaceholder(text)) return { text, missing: false };
  const fallback = locale === "en" ? "(we'll send you the entry code separately shortly)" : "(a bejutási kódot hamarosan külön küldjük)";
  return { text: text.replace(CODE_PLACEHOLDER, code ?? fallback), missing: !code };
}

/** Melyik stúdióhoz tartozik a terem (a terem azonosítójának eleje). */
export function studioOf(room: string): Studio {
  return room.toLowerCase().startsWith("opera") ? "opera" : "astoria";
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const bilingual = (v: unknown, d: Bilingual): Bilingual => {
  const r = isObj(v) ? v : {};
  return { hu: str(r.hu, d.hu), en: str(r.en, d.en) };
};
const id = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

export function normalizePaymentSettings(raw: unknown): PaymentSettings {
  const r = isObj(raw) ? raw : {};
  const d = defaultPaymentSettings;
  const access = isObj(r.access) ? r.access : {};
  const hours = (v: unknown, def: number) =>
    Math.min(24 * 30, Math.max(1, typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def));
  const codes = isObj(r.codes) ? r.codes : {};
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    deadlineEnabled: typeof r.deadlineEnabled === "boolean" ? r.deadlineEnabled : d.deadlineEnabled,
    nearHours: hours(r.nearHours, d.nearHours),
    payWithinHours: hours(r.payWithinHours, d.payWithinHours),
    vat: str(r.vat, d.vat) || d.vat,
    billingoBlockId: id(r.billingoBlockId),
    billingoBankAccountId: id(r.billingoBankAccountId),
    billingoProformaBlockId: id(r.billingoProformaBlockId),
    itemName: bilingual(r.itemName, d.itemName),
    invoiceComment: bilingual(r.invoiceComment, d.invoiceComment),
    access: Object.fromEntries(STUDIOS.map((s) => [s, bilingual(access[s], d.access[s])])) as Record<Studio, Bilingual>,
    codes: Object.fromEntries(STUDIOS.map((s) => [s, (Array.isArray(codes[s]) ? codes[s] as unknown[] : [])
      .filter(isObj)
      .map((c) => ({ month: str(c.month, ""), code: str(c.code, "") }))
      .filter((c) => /^\d{4}-\d{2}$/.test(c.month))
      .sort((a, b) => a.month.localeCompare(b.month))])) as Record<Studio, MonthlyCode[]>,
  };
}
