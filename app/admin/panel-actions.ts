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
import { PAGE_CONTENT_KEY } from "@/lib/page-content";
import { PAGE_CONTENT_TAG } from "@/lib/page-content-store";
import { endHour, formatBookingHour } from "@/lib/studio-booking";
import { syncCalendar } from "@/lib/google-calendar";
import { PAYMENT_SETTINGS_KEY, VAT_OPTIONS } from "@/lib/payment-settings";
import { billingoConfigured, listBillingoOptions, type BillingoOption } from "@/lib/billingo";
import { markPaidManually, notifyDecisionIfComplete, runInBackground } from "@/lib/payment-flow";
import { scheduleCalendarSync } from "@/lib/calendar-schedule";

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
  // angol szövegek (üres = az angol oldalon magyarul jelenik meg)
  en: z.object({
    location: text(80, "Helyszín (angol)"),
    name: text(80, "Terem neve (angol)"),
    description: text(2000, "Leírás (angol)"),
    sound: text(300, "Hangrendszer (angol)"),
    mirror: text(300, "Tükör (angol)"),
    floor: text(300, "Padló (angol)"),
    light: text(300, "Világítás (angol)"),
    extras: z.array(text(80, "Extra (angol)")).max(20),
  }).partial().optional(),
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
//  Szövegek (a foglalóoldal óratípus-kártyái és tájékoztatója, magyarul és angolul)
// ---------------------------------------------------------------------
const lessonTextSchema = z.object({
  title: text(80, "Óratípus neve"),
  capacity: text(40, "Létszám"),
  description: text(300, "Óratípus leírása"),
});
const paragraphs = (label: string) => z.array(text(2000, label)).max(20);
const pageContentSchema = z.object({
  lessonTitle: text(200, "1. lépés címe"),
  lessonLead: text(300, "1. lépés alcíme"),
  lessons: z.object({ privat: lessonTextSchema, kiscsoportos: lessonTextSchema, csoportos: lessonTextSchema }),
  intro: paragraphs("Bevezető bekezdés"),
  approvalTitle: text(200, "Jóváhagyás címe"),
  approval: paragraphs("Jóváhagyás bekezdés"),
  feesTitle: text(200, "Bérleti díjak címe"),
  feesNote: text(500, "Bérleti díjak megjegyzés"),
  studios: z.array(z.object({
    title: text(80, "Stúdió neve"),
    items: z.array(text(300, "Díj sor")).max(20),
    note: text(300, "Halvány sor"),
  })).max(6),
  feesFooter: text(300, "Díjak alatti sor"),
  cancelLabel: text(80, "Lemondás címke"),
  cancel: paragraphs("Lemondás bekezdés"),
});

export async function savePageContent(input: unknown): Promise<ActionResult> {
  return run(async (email) => {
    const data = z.object({ hu: pageContentSchema, en: pageContentSchema }).parse(input);
    await bookingStore("settings", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: { key: PAGE_CONTENT_KEY, data, updated_at: new Date().toISOString(), updated_by: email },
    });
    updateTag(PAGE_CONTENT_TAG);
  });
}

// ---------------------------------------------------------------------
//  Fizetés és e-mailek (Stripe, Billingo, bejutási infók)
// ---------------------------------------------------------------------
const bilingual = (max: number, label: string) => z.object({ hu: text(max, label), en: text(max, `${label} (angol)`) });
const monthlyCodes = (studio: string) => z.array(z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, `Havi kód (${studio}): válassz hónapot.`),
  code: z.string().trim().min(1, `Havi kód (${studio}): a kód nem lehet üres.`).max(200, `Havi kód (${studio}): túl hosszú.`),
})).max(60).refine((list) => new Set(list.map((c) => c.month)).size === list.length, `Havi kód (${studio}): egy hónap csak egyszer szerepelhet.`)
  .transform((list) => [...list].sort((a, b) => a.month.localeCompare(b.month)));

const paymentSettingsSchema = z.object({
  enabled: z.boolean(),
  deadlineEnabled: z.boolean(),
  nearHours: z.number({ error: "Közeli foglalás: adj meg egy számot." }).int("Közeli foglalás: egész óra legyen.")
    .min(1, "Közeli foglalás: legalább 1 óra.").max(24 * 30, "Közeli foglalás: legfeljebb 30 nap."),
  payWithinHours: z.number({ error: "Fizetési idő: adj meg egy számot." }).int("Fizetési idő: egész óra legyen.")
    .min(1, "Fizetési idő: legalább 1 óra.").max(24 * 30, "Fizetési idő: legfeljebb 30 nap."),
  vat: z.enum(VAT_OPTIONS),
  billingoBlockId: z.number().int().positive().nullable(),
  billingoBankAccountId: z.number().int().positive().nullable(),
  billingoProformaBlockId: z.number().int().positive().nullable(),
  itemName: bilingual(120, "Számlatétel megnevezése"),
  invoiceComment: bilingual(1000, "Megjegyzés a számlán"),
  access: z.object({ astoria: bilingual(4000, "Bejutási infók (Astoria)"), opera: bilingual(4000, "Bejutási infók (Opera)") }),
  codes: z.object({ astoria: monthlyCodes("Astoria"), opera: monthlyCodes("Opera") }),
});

export async function savePaymentSettings(input: unknown): Promise<ActionResult> {
  return run(async (email) => {
    const data = paymentSettingsSchema.parse(input);
    if (!data.itemName.hu.trim()) return fail("A számlatétel megnevezése nem lehet üres.");
    await bookingStore("settings", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: { key: PAYMENT_SETTINGS_KEY, data, updated_at: new Date().toISOString(), updated_by: email },
    });
  });
}

/** A Billingo számlatömbjei és bankszámlái (a választólistákhoz). */
export async function loadBillingoOptions(): Promise<
  { ok: true; blocks: BillingoOption[]; bankAccounts: BillingoOption[] } | { ok: false; error: string }
> {
  try {
    await assertAdmin();
    if (!billingoConfigured()) return { ok: false, error: "A Billingo nincs bekötve (BILLINGO_API_KEY a Vercelben)." };
    return { ok: true, ...(await listBillingoOptions()) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "A Billingo adatai nem tölthetők be." };
  }
}

/**
 * Döntés az adminból (ugyanaz, mint a stúdiónak küldött e-mail gombjai): egy időpont
 * jóváhagyása / elutasítása, vagy az igény összes függő időpontjának jóváhagyása.
 * Ha az igény minden időpontjáról döntöttek, az ügyfél megkapja az e-mailt (fizetési linkkel).
 */
export async function decideBooking(slotIdInput: string, actionInput: string): Promise<ActionResult> {
  return run(async () => {
    const slotId = z.string().uuid("Érvénytelen foglalás.").parse(slotIdInput);
    const action = z.enum(["approve", "reject", "approve-all"]).parse(actionInput);
    const rows = await bookingStore<Array<{ request_id: string; studio_requests: { token_hash: string } | null }>>(
      `studio_slots?select=request_id,studio_requests(token_hash)&id=eq.${slotId}`,
    );
    const row = rows[0];
    if (!row?.studio_requests) return fail("A foglalás nem található. Frissítsd a naptárt.");
    // a döntési függvény a token hash-ével azonosítja az igényt (ugyanaz a zárolás, mint az e-mailes döntésnél)
    const result = await bookingStore<{ changed: number } | null>("rpc/decide_studio_request", {
      method: "POST",
      body: { p_token_hash: row.studio_requests.token_hash, p_action: action, p_slot_id: action === "approve-all" ? null : slotId },
    });
    if (!result?.changed) return fail("Erről az időpontról már döntöttek. Frissítsd a naptárt.");
    if (action !== "reject") scheduleCalendarSync();
    const requestId = row.request_id;
    runInBackground("decision email", () => notifyDecisionIfComplete(requestId));
    return {
      ok: true,
      message: action === "reject" ? "Elutasítva." : action === "approve-all" ? `Jóváhagyva (${result.changed} időpont).` : "Jóváhagyva.",
    };
  });
}

/** „Fizetettnek jelölöm” (pl. átutalás / készpénz) — nincs automatikus számla és bejutási e-mail. */
export async function markRequestPaid(requestIdInput: string): Promise<ActionResult> {
  return run(async () => {
    const requestId = z.string().uuid("Érvénytelen foglalás.").parse(requestIdInput);
    if (!(await markPaidManually(requestId))) return fail("Ez a foglalás már fizetettként van jelölve.");
    return { ok: true, message: "Fizetettnek jelölve." };
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

// ---------------------------------------------------------------------
//  Google Naptár — kézi szinkron (Foglalások oldal)
// ---------------------------------------------------------------------
export async function syncCalendarNow(): Promise<ActionResult> {
  return run(async () => {
    const result = await syncCalendar();
    if (!result.configured) return fail("A Google Naptár nincs bekötve (Vercel környezeti változók).");
    if (result.failed) {
      return fail(`${result.failed} bejegyzést nem sikerült szinkronizálni: ${result.error ?? "ismeretlen hiba"}`);
    }
    return {
      ok: true,
      message: result.written || result.removed
        ? `Kész: ${result.written} bejegyzés frissítve, ${result.removed} törölve a naptárakból.`
        : undefined,
    };
  });
}
