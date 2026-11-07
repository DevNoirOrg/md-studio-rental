import { NextResponse } from "next/server";
import { withBase } from "@/lib/base-path";
import { verifyPaymentToken } from "@/lib/payment-rules";
import { loadRequest, paymentPagePath, requestLocale, startCheckout } from "@/lib/payment-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A fizetési oldal „Fizetés” gombja: friss Stripe fizetési oldalt nyit (és oda irányít). */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const id = String(form?.get("r") ?? "");
  const token = String(form?.get("t") ?? "");
  const origin = new URL(request.url).origin;
  if (!verifyPaymentToken(id, token)) {
    return NextResponse.redirect(new URL(withBase("/fizetes?hiba=link"), origin), 303);
  }
  const r = await loadRequest(id).catch(() => null);
  const page = (error?: string) => {
    const locale = r ? requestLocale(r) : "hu";
    const url = new URL(withBase(paymentPagePath(locale)), origin);
    url.searchParams.set("r", id);
    url.searchParams.set("t", token);
    if (error) url.searchParams.set("hiba", error);
    return NextResponse.redirect(url, 303);
  };
  if (!r) return page("failed");
  const result = await startCheckout(r);
  if ("url" in result) return NextResponse.redirect(result.url, 303);
  return page(result.error);
}
