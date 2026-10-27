import { NextResponse } from "next/server";
import { bookingStore, decisionInput } from "@/lib/booking-store";
import { scheduleCalendarSync } from "@/lib/calendar-schedule";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 });
  }
  const decision = decisionInput(input);
  if (!decision) {
    return NextResponse.json({ error: "Érvénytelen döntési hivatkozás." }, { status: 400 });
  }
  try {
    const result = await bookingStore<{ changed: number } | null>("rpc/decide_studio_request", { method: "POST", body: decision });
    if (!result) {
      return NextResponse.json({ error: "A foglalási igény nem található, vagy a hivatkozás érvénytelen." }, { status: 404 });
    }
    // jóváhagyott idősáv → a terem Google Naptárába (a válasz után, a háttérben)
    if (result.changed > 0 && decision.p_action !== "reject") scheduleCalendarSync();
    return NextResponse.json({ success: true, changed: result.changed });
  } catch (caught) {
    const error = caught as { code?: string; status?: number; name?: string; message?: string };
    console.error("Booking decision failed.", { code: error.code, status: error.status, name: error.name });
    return NextResponse.json({
      error: "A döntés mentése nem ellenőrizhető. Próbáld újra; az ismételt döntés nem módosít már lezárt időpontot.",
    }, { status: 503 });
  }
}
