import { NextResponse, type NextRequest } from "next/server";
import { adminCookie, validAdminSession } from "@/lib/admin-auth";
import { bookingStore } from "@/lib/booking-store";
import { randomBytes } from "node:crypto";
import { validateBooking, validateBookingTime } from "@/lib/studio-booking";

export const dynamic = "force-dynamic";

interface AdminSlotRow {
  id: string;
  room: string;
  date: string;
  hour: number;
  status: string;
  price: number;
  duration_minutes: number;
  studio_requests: { customer: { name: string; email: string; phone: string }; lesson_type: string };
}

export async function PATCH(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (!validAdminSession(request.cookies.get(adminCookie)?.value)) {
      return NextResponse.json({ error: "A munkamenet lejárt. Jelentkezz be újra." }, { status: 401, headers });
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Érvénytelen kérésforrás." }, { status: 403, headers });
    }
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Érvénytelen foglalásazonosító." }, { status: 400, headers });
    }
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "Érvénytelen kérésformátum." }, { status: 400, headers });
    }
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some((key) => !["date", "hour"].includes(key))) {
      return NextResponse.json({ error: "Csak a dátum és a kezdési idő módosítható." }, { status: 400, headers });
    }
    const records = await bookingStore<Array<{ id: string; date: string; hour: number; duration_minutes: number }>>(`studio_slots?id=eq.${id}&status=in.(pending,approved)&select=id,date,hour,duration_minutes`);
    if (!Array.isArray(records)) throw new Error("Invalid booking lookup response.");
    if (records.length === 0) {
      return NextResponse.json({ error: "A foglalás már nem található vagy nem módosítható. Frissítsd a naptárt." }, { status: 404, headers });
    }
    const original = records[0];
    const change = input as { date?: unknown; hour?: unknown };
    const error = validateBookingTime({ date: change.date, hour: change.hour, durationMinutes: original.duration_minutes });
    if (error) return NextResponse.json({ error }, { status: 400, headers });
    // A feltételes frissítés nem írhat felül közben átfoglalt időpontot.
    const params = new URLSearchParams({
      id: `eq.${id}`, status: "in.(pending,approved)", date: `eq.${original.date}`,
      hour: `eq.${original.hour}`, duration_minutes: `eq.${original.duration_minutes}`, select: "id,date,hour",
    });
    const updated = await bookingStore(`studio_slots?${params}`, {
      method: "PATCH", body: { date: change.date, hour: change.hour }, returnRepresentation: true,
    });
    if (!Array.isArray(updated)) throw new Error("Invalid booking update response.");
    if (updated.length === 0) {
      return NextResponse.json({ error: "A foglalás közben megváltozott. Frissítsd a naptárt és próbáld újra." }, { status: 409, headers });
    }
    return NextResponse.json({ success: true, slot: updated[0] }, { headers });
  } catch (caught) {
    const error = caught as { code?: string; name?: string };
    console.error("Admin booking rescheduling failed.", { code: error.code, name: error.name });
    return NextResponse.json({
      error: error.code === "23505" ? "Az új időpont foglalt. Válassz másik időpontot; az eredeti foglalás megmaradt." :
        "A módosítás eredménye nem ellenőrizhető. Ellenőrizd a naptárt újrapróbálás előtt.",
    }, { status: error.code === "23505" ? 409 : 503, headers });
  }
}

export async function DELETE(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (!validAdminSession(request.cookies.get(adminCookie)?.value)) {
      return NextResponse.json({ error: "A munkamenet lejárt. Jelentkezz be újra." }, { status: 401, headers });
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Érvénytelen kérésforrás." }, { status: 403, headers });
    }
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Érvénytelen foglalásazonosító." }, { status: 400, headers });
    }
    const deleted = await bookingStore(`studio_slots?id=eq.${id}&status=in.(pending,approved)&select=id`, {
      method: "DELETE", returnRepresentation: true,
    });
    if (!Array.isArray(deleted)) throw new Error("Invalid booking deletion response.");
    if (deleted.length === 0) {
      return NextResponse.json({ error: "A foglalás már nem található vagy nem törölhető. Frissítsd a naptárt." }, { status: 404, headers });
    }
    return NextResponse.json({ success: true }, { headers });
  } catch (caught) {
    const error = caught as { code?: string; name?: string };
    console.error("Admin booking deletion failed.", { code: error.code, name: error.name });
    return NextResponse.json({ error: "A törlés eredménye nem ellenőrizhető. Ellenőrizd a naptárt újrapróbálás előtt." }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (!validAdminSession(request.cookies.get(adminCookie)?.value)) {
      return NextResponse.json({ error: "A munkamenet lejárt. Jelentkezz be újra." }, { status: 401, headers });
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Érvénytelen kérésforrás." }, { status: 403, headers });
    }
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "Érvénytelen kérésformátum." }, { status: 400, headers });
    }
    const { booking, error } = validateBooking(input);
    if (!booking) return NextResponse.json({ error }, { status: 400, headers });
    await bookingStore("rpc/create_admin_studio_request", {
      method: "POST",
      body: { p_customer: booking.customer, p_lesson_type: booking.lessonType,
        p_token_hash: randomBytes(32).toString("hex"), p_slots: booking.slots },
    });
    return NextResponse.json({ success: true }, { headers });
  } catch (caught) {
    const error = caught as { code?: string; name?: string };
    console.error("Admin booking creation failed.", { code: error.code, name: error.name });
    return NextResponse.json({
      error: error.code === "23505" ? "Az egyik időpontot közben lefoglalták. Frissítsd a naptárt és válassz másik időpontot." :
        "A foglalás nem menthető. Ellenőrizd a naptárt újrapróbálás előtt.",
    }, { status: error.code === "23505" ? 409 : 503, headers });
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(adminCookie)?.value;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (!validAdminSession(token)) {
      return NextResponse.json({ error: "A munkamenet lejárt. Jelentkezz be újra." }, { status: 401, headers });
    }
    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    const validDate = (value: string | null): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(from) || !validDate(to) || from > to ||
        Date.parse(to) - Date.parse(from) > 42 * 86400000) {
      return NextResponse.json({ error: "Érvénytelen naptári időszak." }, { status: 400, headers });
    }
    const slots: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 500) {
      const page = await bookingStore<AdminSlotRow[]>(`studio_slots?select=id,room,date,hour,status,price,duration_minutes,studio_requests!inner(customer,lesson_type)&date=gte.${from}&date=lte.${to}&status=in.(pending,approved)&order=date,hour,room,id&limit=500&offset=${offset}`);
      slots.push(...page.map(({ duration_minutes, studio_requests, ...slot }) => ({
        ...slot, durationMinutes: duration_minutes,
        customer: {
          name: studio_requests.customer.name,
          email: studio_requests.customer.email,
          phone: studio_requests.customer.phone,
        },
        lessonType: studio_requests.lesson_type,
      })));
      if (page.length < 500) break;
    }
    return NextResponse.json({ slots }, { headers });
  } catch (caught) {
    const error = caught as { code?: string; name?: string };
    console.error("Admin booking lookup failed.", { code: error.code, name: error.name });
    return NextResponse.json({ error: "A foglalások nem tölthetők be. Próbáld újra később." }, { status: 503, headers });
  }
}
