import { NextResponse } from "next/server";
import { validateBooking, emailPattern } from "@/lib/studio-booking";
import { buildBookingEmail } from "@/lib/booking-email";
import { randomBytes } from "node:crypto";
import { bookingStore, tokenHash } from "@/lib/booking-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const validDate = (date: string | null): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!validDate(from) || !validDate(to) || from > to ||
      Date.parse(to) - Date.parse(from) > 42 * 86400000) {
    return NextResponse.json({ error: "Érvénytelen naptári időszak." }, { status: 400 });
  }
  try {
    // Ügyféladat és döntési token soha nem szerepel a publikus naptárválaszban.
    const slots: Array<Record<string, unknown>> = [];
    // Lapozunk: a Supabase alapértelmezett sorlimitje nem rejthet el foglalásokat.
    for (let offset = 0; ; offset += 500) {
      const page = await bookingStore<Array<{ duration_minutes: number } & Record<string, unknown>>>(`studio_slots?select=room,date,hour,status,duration_minutes&date=gte.${from}&date=lte.${to}&status=in.(pending,approved)&order=date,hour,room&limit=500&offset=${offset}`);
      slots.push(...page.map(({ duration_minutes, ...slot }) => ({
        ...slot, durationMinutes: duration_minutes,
      })));
      if (page.length < 500) break;
    }
    return NextResponse.json({ slots }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    const error = caught as { code?: string; status?: number; name?: string; message?: string };
    console.error("Calendar availability failed.", { code: error.code, status: error.status, name: error.name });
    return NextResponse.json({ error: "A foglaltság nem tölthető be. Próbáld újra később." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérésformátum." }, { status: 400 });
  }
  const { booking, error } = validateBooking(input);
  if (!booking) return NextResponse.json({ error }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipient = process.env.BOOKING_NOTIFICATION_EMAIL?.trim();
  const baseUrl = process.env.APP_BASE_URL;
  let validBaseUrl = false;
  try {
    const url = new URL(baseUrl ?? "");
    validBaseUrl = url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    validBaseUrl = false;
  }
  if (!apiKey || !from || !recipient || recipient.length > 254 ||
      !new RegExp(`^${emailPattern}$`).test(recipient) || !validBaseUrl ||
      !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Booking email or database configuration missing.");
    return NextResponse.json({
      error: "A foglalási rendszer még nincs beállítva. Kérjük, keresd a stúdiót telefonon.",
    }, { status: 503 });
  }

  const token = randomBytes(32).toString("hex");
  let saved: { id: string; slots: Array<Record<string, unknown> & { id: string; room: string; date: string; hour: number; durationMinutes: number; price: number }> };
  try {
    saved = await bookingStore<typeof saved>("rpc/create_studio_request", {
      method: "POST",
      body: { p_customer: booking.customer, p_lesson_type: booking.lessonType,
        p_token_hash: tokenHash(token), p_slots: booking.slots },
    });
  } catch (caught) {
    const error = caught as { code?: string; status?: number; name?: string; message?: string };
    console.error("Booking persistence failed.", { code: error.code, status: error.status, name: error.name });
    return NextResponse.json({
      error: error.code === "23505"
        ? "Az egyik idősávra időközben más foglalási igény érkezett. Válassz másik időpontot."
        : "A foglalási igény mentése nem ellenőrizhető. Újraküldés előtt kérjük, egyeztess a stúdióval.",
    }, { status: error.code === "23505" ? 409 : 503 });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [recipient], reply_to: booking.customer.email,
        ...buildBookingEmail({ ...booking, slots: saved.slots }, { token, baseUrl: baseUrl as string }),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("Resend rejected booking email.", { status: response.status, code: result.name, message: result.message });
      // Kifejezett elutasításnál felszabadítjuk a sávokat. Bizonytalan küldésnél nem.
      await bookingStore(`studio_requests?id=eq.${saved.id}`, { method: "DELETE" });
      return NextResponse.json({
        error: "Nem sikerült elküldeni a foglalási igényt. Kérjük, próbáld újra később.",
      }, { status: 502 });
    }
    if (!result.id) throw new Error("Resend acceptance could not be verified.");
    return NextResponse.json({ success: true });
  } catch (caught) {
    const error = caught as { code?: string; status?: number; name?: string; message?: string };
    console.error("Resend booking email request failed.", { name: error.name });
    return NextResponse.json({
      error: "Az igényt mentettük, de az e-mail-küldés eredménye nem ellenőrizhető. Újraküldés előtt egyeztess a stúdióval.",
    }, { status: 502 });
  }
}
