import { bookingStore } from "./booking-store.ts";
import { PAYMENT_SETTINGS_KEY, defaultPaymentSettings, normalizePaymentSettings, type PaymentSettings } from "./payment-settings.ts";

/* A fizetési beállítások beolvasása a rental.settings táblából (csak szerveren). */

export interface PaymentSettingsRow {
  data: unknown;
  updated_at: string | null;
  updated_by: string | null;
}

export async function loadPaymentSettingsRow(): Promise<PaymentSettingsRow | null> {
  const rows = await bookingStore<PaymentSettingsRow[]>(`settings?select=data,updated_at,updated_by&key=eq.${PAYMENT_SETTINGS_KEY}`);
  return rows?.[0] ?? null;
}

/** A friss beállítás; ha nem olvasható (pl. még nincs tábla), az alapérték (online fizetés kikapcsolva). */
export async function loadPaymentSettings(): Promise<PaymentSettings> {
  try {
    return normalizePaymentSettings((await loadPaymentSettingsRow())?.data);
  } catch (caught) {
    console.error("Payment settings could not be loaded; using defaults.", { message: (caught as Error).message });
    return defaultPaymentSettings;
  }
}
