import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-session";
import { normalizePaymentSettings } from "@/lib/payment-settings";
import { loadPaymentSettingsRow, type PaymentSettingsRow } from "@/lib/payment-settings-store";
import { billingoConfigured } from "@/lib/billingo";
import { stripeConfigured } from "@/lib/stripe";
import { mailConfigured } from "@/lib/mailer";
import { withBase } from "@/lib/base-path";
import PaymentsEditor from "./PaymentsEditor";

export const metadata: Metadata = { title: "Fizetés és e-mailek | Stúdió bérlés admin" };

export default async function PaymentsPage() {
  await requireAdmin();
  let row: PaymentSettingsRow | null = null;
  let loadError = false;
  try {
    row = await loadPaymentSettingsRow();
  } catch (caught) {
    // pl. még nincs lefuttatva a supabase/2026-11-page-content.sql (rental.settings tábla)
    console.error("[admin] payment settings could not be loaded", { message: (caught as Error).message });
    loadError = true;
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  return (
    <PaymentsEditor
      initial={normalizePaymentSettings(row?.data)}
      info={row?.updated_at && row.updated_by ? { updatedAt: row.updated_at, updatedBy: row.updated_by } : null}
      loadError={loadError}
      status={{
        stripe: stripeConfigured() ? (stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_") ? "live" : "test") : "missing",
        webhook: !!process.env.STRIPE_WEBHOOK_SECRET?.trim(),
        billingo: billingoConfigured(),
        mail: mailConfigured(),
        webhookUrl: `${base || "<APP_BASE_URL>"}${withBase("/api/stripe/webhook")}`,
      }}
    />
  );
}
