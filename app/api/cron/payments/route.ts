import { NextResponse } from "next/server";
import { runPaymentJobs } from "@/lib/payment-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Időzített teendők (lejárt fizetési határidő, emlékeztető, félbemaradt számla / e-mail).
  A Vercel Cron hívja (vercel.json); ezen kívül a foglalóoldal és az admin forgalma is
  elindítja percenként legfeljebb egyszer, így ritka cron mellett is időben lefut.
  Ha a CRON_SECRET be van állítva, csak „Authorization: Bearer <CRON_SECRET>” fejléccel fut.
*/
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json(await runPaymentJobs());
  } catch (err) {
    console.error("Payment jobs failed.", { message: (err as Error).message });
    return NextResponse.json({ error: "Failed." }, { status: 500 });
  }
}
