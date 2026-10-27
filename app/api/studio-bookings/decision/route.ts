import { NextResponse } from "next/server";
import { bookingStore, decisionInput, tokenHash } from "@/lib/booking-store";
import { loadRoomsConfig } from "@/lib/rooms-store";
import { defaultRoomsConfig, roomLabel } from "@/lib/room-config";
import { scheduleCalendarSync } from "@/lib/calendar-schedule";

export const runtime = "nodejs";

interface RequestRow {
  lesson_type: string;
  customer: { name?: string; email?: string; phone?: string };
  studio_slots: Array<{ id: string; room: string; date: string; hour: number; duration_minutes: number; price: number; status: string }>;
}

/**
 * A döntési oldal ezzel tölti be, MELYIK igényről és időpont(ok)ról van szó.
 * Csak a levélben kapott (titkos) tokennel érhető el; a döntési tokent nem adja vissza.
 */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "Érvénytelen döntési hivatkozás." }, { status: 400, headers });
  }
  try {
    const rows = await bookingStore<RequestRow[]>(
      `studio_requests?select=lesson_type,customer,studio_slots(id,room,date,hour,duration_minutes,price,status)&token_hash=eq.${tokenHash(token)}`,
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "A foglalási igény nem található, vagy a hivatkozás érvénytelen." }, { status: 404, headers });
    }
    let config = defaultRoomsConfig;
    try {
      config = await loadRoomsConfig();
    } catch {
      // a terem megjelenített neve nélkül is működik
    }
    const slots = [...row.studio_slots]
      .sort((a, b) => a.date.localeCompare(b.date) || Number(a.hour) - Number(b.hour) || a.room.localeCompare(b.room))
      .map((slot) => ({
        id: slot.id, room: slot.room, roomLabel: roomLabel(config, slot.room), date: slot.date,
        hour: Number(slot.hour), durationMinutes: slot.duration_minutes, price: slot.price, status: slot.status,
      }));
    return NextResponse.json({
      lessonType: row.lesson_type,
      customer: { name: row.customer?.name ?? "", email: row.customer?.email ?? "", phone: row.customer?.phone ?? "" },
      slots,
    }, { headers });
  } catch (caught) {
    const error = caught as { code?: string; status?: number; name?: string };
    console.error("Booking decision lookup failed.", { code: error.code, status: error.status, name: error.name });
    return NextResponse.json({ error: "A foglalási igény adatai most nem tölthetők be. Próbáld újra később." }, { status: 503, headers });
  }
}

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
