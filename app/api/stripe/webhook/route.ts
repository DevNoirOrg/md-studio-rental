import { NextResponse } from "next/server";
import { verifyStripeSignature, type CheckoutSession } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/lib/payment-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Stripe webhook — a Stripe ide jelzi a sikeres fizetést.
  Beállítás: Stripe → Developers → Webhooks → Add endpoint:
    URL:    <APP_BASE_URL>/studio-berles/api/stripe/webhook
    Events: checkout.session.completed, checkout.session.async_payment_succeeded
  A végpont „Signing secret”-je kell a STRIPE_WEBHOOK_SECRET változóba.
*/
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("Stripe webhook secret missing.");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  let event: { type?: string; data?: { object?: unknown } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await handleCheckoutCompleted(event.data?.object as CheckoutSession);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 → a Stripe később újraküldi; a feldolgozás megismételhető (kétszer nem fut le)
    console.error("Stripe webhook handling failed.", { type: event.type, message: (err as Error).message });
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
