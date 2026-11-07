/*
  Fizetési beállítások (admin → Fizetés és e-mailek), a rental.settings 'payments' sorában.
    enabled          — online fizetés (Stripe) bekapcsolva; kikapcsolva minden úgy megy, mint eddig,
                       csak az ügyfél-e-mailek mennek ki (fizetési link nélkül)
    deadlineEnabled  — legyen-e fizetési határidő (lejáratkor az időpontok felszabadulnak)
    deadlineHours    — a határidő a jóváhagyástól számítva (legkésőbb az első időpont előtt 2 órával)
    vat              — a számla ÁFA-kulcsa a Billingóban (pl. "27%", "AAM")
    billingo*        — melyik számlatömbbe / bankszámlára menjen a számla
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
  deadlineHours: number;
  vat: string;
  billingoBlockId: number | null;
  billingoBankAccountId: number | null;
  itemName: Bilingual;
  access: Record<Studio, Bilingual>;
}

export const VAT_OPTIONS = ["27%", "AAM", "TAM", "18%", "5%", "0%"] as const;

export const defaultPaymentSettings: PaymentSettings = {
  enabled: false,
  deadlineEnabled: true,
  deadlineHours: 48,
  vat: "27%",
  billingoBlockId: null,
  billingoBankAccountId: null,
  itemName: { hu: "Teremhasználat", en: "Studio rental" },
  access: {
    astoria: { hu: "", en: "" },
    opera: { hu: "", en: "" },
  },
};

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
  const hours = typeof r.deadlineHours === "number" && Number.isFinite(r.deadlineHours) ? Math.round(r.deadlineHours) : d.deadlineHours;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    deadlineEnabled: typeof r.deadlineEnabled === "boolean" ? r.deadlineEnabled : d.deadlineEnabled,
    deadlineHours: Math.min(24 * 30, Math.max(1, hours)),
    vat: str(r.vat, d.vat) || d.vat,
    billingoBlockId: id(r.billingoBlockId),
    billingoBankAccountId: id(r.billingoBankAccountId),
    itemName: bilingual(r.itemName, d.itemName),
    access: Object.fromEntries(STUDIOS.map((s) => [s, bilingual(access[s], d.access[s])])) as Record<Studio, Bilingual>,
  };
}
