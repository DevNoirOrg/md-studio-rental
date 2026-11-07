import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Vékony Stripe-kliens (REST, SDK nélkül) — csak szerveren.
    STRIPE_SECRET_KEY      — a Stripe titkos kulcsa (sk_test_… tesztben, sk_live_… élesben)
    STRIPE_WEBHOOK_SECRET  — a webhook végpont aláíró titka (whsec_…)
  A fizetés Stripe Checkout (Stripe által hosztolt fizetési oldal); a fizetés tényét a
  webhook (checkout.session.completed) jelzi — a visszairányítás ehhez nem elég.
*/

const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

/** Teszt (sandbox) kulccsal megy-e — ilyenkor valódi pénz nem mozog, és számla helyett díjbekérő készül. */
export function stripeTestMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return key.startsWith("sk_test_") || key.startsWith("rk_test_");
}

/** Stripe-stílusú form-kódolás beágyazott objektumokhoz és tömbökhöz (line_items[0][price_data][…]). */
export function formEncode(value: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const walk = (prefix: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((item, i) => walk(`${prefix}[${i}]`, item));
    else if (typeof v === "object") for (const [k, item] of Object.entries(v)) walk(prefix ? `${prefix}[${k}]` : k, item);
    else params.append(prefix, String(v));
  };
  walk("", value);
  return params.toString();
}

async function stripeRequest<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("A Stripe nincs beállítva (STRIPE_SECRET_KEY).");
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body ? formEncode(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("A Stripe nem érhető el (hálózati hiba vagy időtúllépés).");
  }
  const result = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(`Stripe hiba (${response.status}): ${result.error?.message ?? "ismeretlen hiba"}`);
  return result;
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  expires_at: number;
  client_reference_id: string | null;
  payment_intent: string | null;
  metadata: Record<string, string> | null;
  customer_details: {
    email: string | null;
    name: string | null;
    business_name?: string | null;
    address: {
      city: string | null; country: string | null; line1: string | null; line2: string | null;
      postal_code: string | null; state: string | null;
    } | null;
    tax_ids?: Array<{ type: string; value: string }> | null;
  } | null;
}

export interface CheckoutLine {
  name: string;
  /** Forintban (egész szám). A Stripe a HUF-ot fillérben várja → ×100. */
  amountHuf: number;
}

export async function createCheckoutSession(input: {
  requestId: string;
  lines: CheckoutLine[];
  email: string;
  locale: "hu" | "en";
  successUrl: string;
  cancelUrl: string;
  expiresAt: number;
  idempotencyKey: string;
}): Promise<CheckoutSession> {
  return stripeRequest<CheckoutSession>("POST", "/checkout/sessions", {
    mode: "payment",
    client_reference_id: input.requestId,
    customer_email: input.email,
    locale: input.locale,
    submit_type: "book",
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: input.expiresAt,
    metadata: { request_id: input.requestId },
    payment_intent_data: { metadata: { request_id: input.requestId } },
    line_items: input.lines.map((line) => ({
      quantity: 1,
      price_data: { currency: "huf", unit_amount: Math.round(line.amountHuf * 100), product_data: { name: line.name } },
    })),
  }, input.idempotencyKey);
}

export async function retrieveCheckoutSession(id: string): Promise<CheckoutSession> {
  return stripeRequest<CheckoutSession>("GET", `/checkout/sessions/${encodeURIComponent(id)}`);
}

/** Nyitott fizetési oldal lezárása (pl. lejárt határidőnél), hogy utána már ne lehessen fizetni. */
export async function expireCheckoutSession(id: string): Promise<void> {
  try {
    await stripeRequest("POST", `/checkout/sessions/${encodeURIComponent(id)}/expire`);
  } catch (err) {
    // ha már lezárult / lejárt, az rendben van
    if (!/\(400\)/.test((err as Error).message)) throw err;
  }
}

/**
 * Webhook aláírás ellenőrzése (Stripe-Signature: t=…,v1=…). A titok a végpont
 * „Signing secret”-je. Az időbélyeg legfeljebb 5 perces lehet (visszajátszás ellen).
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.split("="));
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(timestamp) || !signatures.length || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((sig) => {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
