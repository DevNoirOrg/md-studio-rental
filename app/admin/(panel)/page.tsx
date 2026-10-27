import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-session";
import { loadRoomsConfig } from "@/lib/rooms-store";
import { ROOM_IDS, defaultRoomsConfig } from "@/lib/room-config";
import { scheduleCalendarSync } from "@/lib/calendar-schedule";
import { calendarBacklog, calendarConfigured } from "@/lib/google-calendar";
import AdminCalendar from "../AdminCalendar";
import CalendarSyncCard from "./CalendarSyncCard";

export const metadata: Metadata = { title: "Foglalások | Stúdió bérlés admin" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ datum?: string; terem?: string }> }) {
  await requireAdmin();
  const { datum, terem } = await searchParams;
  const initialDate = datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : undefined;
  const initialRoom = terem !== undefined ? ROOM_IDS[Number(terem)] : undefined;

  // Google Naptár: a függő bejegyzések pótlása a háttérben, oldalbetöltéskor
  const configured = calendarConfigured();
  let backlog: { pending: number; lastError: string | null } | null = null;
  if (configured) {
    scheduleCalendarSync();
    try {
      backlog = await calendarBacklog();
    } catch (caught) {
      console.error("Calendar backlog lookup failed.", { message: (caught as Error).message });
    }
  }
  let config = defaultRoomsConfig;
  let configError = false;
  try {
    config = await loadRoomsConfig();
  } catch (caught) {
    console.error("Room settings could not be loaded for admin calendar.", { message: (caught as Error).message });
    configError = true;
  }
  return (
    <div className="pb-12">
      <PageHeader
        title="Foglalások"
        description="Kattints egy foglalásra a részletekhez, vagy válassz szabad időpontokat új foglaláshoz. A nyilak fél órával bővítik a kijelölést."
      />
      {configError && (
        <p role="alert" className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          A terembeállítások nem tölthetők be — a naptár az alapértelmezett nyitvatartást mutatja.
        </p>
      )}
      <div className="rounded-[1.75rem] bg-white p-5 shadow-[0_10px_30px_-18px_rgba(20,19,22,0.35)] md:p-7">
        <AdminCalendar config={config} initialDate={initialDate} initialRoom={initialRoom} />
      </div>
      <CalendarSyncCard configured={configured} backlog={backlog} />
    </div>
  );
}
