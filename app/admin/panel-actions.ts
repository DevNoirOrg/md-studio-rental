"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin-session";
import { bookingStore } from "@/lib/booking-store";
import type { ActionResult } from "@/lib/admin-types";
import { supabaseServiceClient } from "@/lib/admin-auth";
import {
  LESSON_TYPES, MEDIA_BUCKET, ROOM_IDS, isValidDay, openingFor, roomsConfigFromRows,
  type LessonType, type RoomConfig,
} from "@/lib/room-config";
import { ROOMS_TAG } from "@/lib/rooms-store";
import { endHour, formatBookingHour } from "@/lib/studio-booking";

/*
  Az admin felület (Termek, Adminok) írási műveletei. Mindegyik:
    1) ellenőrzi, hogy admin hívja (assertAdmin),
    2) zod-dal validálja a bemenetet,
    3) ment (a mentő admin e-mail címével és idejével),
    4) a publikus oldalt azonnal frissíti (updateTag).
*/

const fail = (error: string): ActionResult => ({ ok: false, error });

async function run(fn: (email: string) => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const admin = await assertAdmin();
    return (await fn(admin.email)) ?? { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      return fail(first?.message && !first.message.startsWith("Invalid") ? first.message : "Hiányzó vagy hibás mező.");
    }
    console.error("[admin action]", err);
    return fail(err instanceof Error ? err.message : "Ismeretlen hiba történt.");
  }
}

const text = (max: number, label: string) => z.string().trim().max(max, `${label}: legfeljebb ${max} karakter.`);
const required = (max: number, label: string) => text(max, label).min(1, `${label}: nem lehet üres.`);
const measure = (label: string) =>
  z.number({ error: `${label}: adj meg egy számot.` }).min(0, `${label}: nem lehet negatív.`).max(10000, `${label}: túl nagy szám.`);
const price = (label: string) =>
  z.number({ error: `${label}: adj meg egy árat.` }).int(`${label}: egész szám legyen.`).min(1, `${label}: legalább 1 Ft.`).max(1_000_000, `${label}: túl nagy összeg.`);
const imagePath = z.string().regex(/^(\/[\w./-]+|images\/[\w./-]+)$/, "Érvénytelen képfájl.").max(300);
const halfHour = z.number().min(0).max(24).refine((h) => Number.isInteger(h * 2), "Csak egész vagy fél óra adható meg.");

const lessonNames: Record<LessonType, string> = { privat: "Privát óra", kiscsoportos: "Kiscsoportos óra", csoportos: "Csoportos óra" };
const dayNames = ["hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat", "vasárnap"];

const roomSchema = z.object({
  location: text(80, "Helyszín"),
  name: required(80, "Terem neve"),
  images: z.array(imagePath).max(20, "Legfeljebb 20 kép tölthető fel termenként."),
  area: measure("Alapterület"),
  length: measure("Hosszúság"),
  width: measure("Szélesség"),
  height: measure("Belmagasság"),
  capacity: z.number({ error: "Befogadóképesség: adj meg egy számot." }).int("Befogadóképesség: egész szám legyen.").min(1, "Befogadóképesség: legalább 1 fő.").max(1000),
  ac: z.boolean(),
  sound: text(300, "Hangrendszer"),
  mirror: text(300, "Tükör"),
  floor: text(300, "Padló"),
  light: text(300, "Világítás"),
  extras: z.array(required(80, "Extra")).max(20),
  description: text(2000, "Leírás"),
  lessonTypes: z.array(z.enum(LESSON_TYPES)).max(3),
  prices: z.object({
    privat: price(`${lessonNames.privat} óradíja`),
    kiscsoportos: price(`${lessonNames.kiscsoportos} óradíja`),
    csoportos: price(`${lessonNames.csoportos} óradíja`),
  }),
  hours: z.array(z.object({ closed: z.boolean(), open: halfHour, close: halfHour })).length(7),
}).superRefine((room, ctx) => {
  room.hours.forEach((day, i) => {
    if (!isValidDay(day)) {
      ctx.addIssue({ code: "custom", message: `Nyitvatartás (${dayNames[i]}): a zárás legalább 1 órával a nyitás után legyen.` });
    }
  });
});

/** Mai nap Budapesten (YYYY-MM-DD). */
function todayInBudapest(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());
}

const huDate = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric", timeZone: "UTC" });

/** A mentés után: a jövőbeli foglalások közül melyik esik az új nyitvatartáson / óratípusokon kívül. */
async function conflictWarning(id: string, room: RoomConfig): Promise<string | undefined> {
  type Row = { date: string; hour: number; duration_minutes: number; studio_requests: { lesson_type: LessonType } | null };
  const params = new URLSearchParams({
    select: "date,hour,duration_minutes,studio_requests(lesson_type)",
    room: `eq.${id}`,
    status: "in.(pending,approved)",
    date: `gte.${todayInBudapest()}`,
    order: "date,hour",
    limit: "1000",
  });
  const rows = await bookingStore<Row[]>(`studio_slots?${params}`);
  const config = roomsConfigFromRows([{ id, data: room }]);
  const outside = rows.filter((row) => {
    const slot = { room: id, date: row.date, hour: Number(row.hour), durationMinutes: row.duration_minutes };
    const opening = openingFor(config, id, row.date);
    return !opening || slot.hour < opening.open || endHour(slot) > opening.close;
  });
  const wrongType = rows.filter((row) => row.studio_requests && !room.lessonTypes.includes(row.studio_requests.lesson_type));
  const parts: string[] = [];
  if (outside.length) {
    const first = outside[0];
    const example = `${huDate.format(new Date(`${first.date}T00:00:00Z`))} ${formatBookingHour(Number(first.hour))}–${formatBookingHour(endHour({ ...first, hour: Number(first.hour), durationMinutes: first.duration_minutes, room: id }))}`;
    parts.push(`${outside.length} meglévő foglalás a nyitvatartáson kívül esik (pl. ${example})`);
  }
  if (wrongType.length) parts.push(`${wrongType.length} meglévő foglalás olyan óratípusú, ami itt már nem választható`);
  if (!parts.length) return undefined;
  return `Mentve. Figyelem: ${parts.join(", és ")}. Ezek a foglalások megmaradnak — ha kell, a Foglalások menüben módosíthatod vagy törölheted őket.`;
}

// ---------------------------------------------------------------------
//  Termek
// ---------------------------------------------------------------------
export async function saveRoom(idInput: string, input: unknown): Promise<ActionResult> {
  return run(async (email) => {
    const id = z.enum(ROOM_IDS).parse(idInput);
    const room = roomSchema.parse(input) as RoomConfig;
    await bookingStore("rooms", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        id,
        sort: ROOM_IDS.indexOf(id) + 1,
        data: room,
        updated_at: new Date().toISOString(),
        updated_by: email,
      },
    });
    updateTag(ROOMS_TAG);
    try {
      const warning = await conflictWarning(id, room);
      if (warning) return { ok: true, warning };
    } catch (err) {
      console.error("[admin] room conflict check failed", err);
    }
  });
}

// ---------------------------------------------------------------------
//  Képfeltöltés: egyszer használatos, közvetlen feltöltési link a Storage-ba
// ---------------------------------------------------------------------
export async function createUploadTarget(
  contentTypeInput: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  try {
    await assertAdmin();
    const contentType = z.enum(["image/webp", "image/jpeg", "image/png"]).parse(contentTypeInput);
    const ext = contentType.split("/")[1];
    const path = `images/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const { data, error } = await supabaseServiceClient().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: "Nem sikerült feltöltési linket kérni: " + (error?.message ?? "") };
    return { ok: true, path: data.path, token: data.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Hiba a feltöltés előkészítésekor." };
  }
}

// ---------------------------------------------------------------------
//  Adminok
// ---------------------------------------------------------------------
export async function addAdmin(emailInput: string): Promise<ActionResult> {
  return run(async () => {
    const email = z.string().trim().toLowerCase().email("Érvénytelen e-mail cím.").max(200).parse(emailInput);
    await bookingStore("admins", { method: "POST", prefer: "resolution=ignore-duplicates", body: { email } });
  });
}

export async function removeAdmin(emailInput: string): Promise<ActionResult> {
  return run(async (me) => {
    const email = z.string().trim().toLowerCase().parse(emailInput);
    if (email === me) return fail("Saját magadat nem tudod eltávolítani.");
    const admins = await bookingStore<{ email: string }[]>("admins?select=email");
    if (admins.length <= 1) return fail("Az utolsó admint nem lehet eltávolítani.");
    await bookingStore(`admins?email=eq.${encodeURIComponent(email)}`, { method: "DELETE" });
  });
}
