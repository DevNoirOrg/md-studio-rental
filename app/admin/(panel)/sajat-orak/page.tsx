import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-session";
import { bookingStore } from "@/lib/booking-store";
import { loadRoomsConfig } from "@/lib/rooms-store";
import { ROOM_IDS, defaultRoomsConfig, roomLabel } from "@/lib/room-config";
import OwnLessonsEditor, { type OwnSeriesView } from "./OwnLessonsEditor";

export const metadata: Metadata = { title: "Saját órák | Stúdió bérlés admin" };

interface SeriesRow {
  id: string;
  name: string;
  room: string;
  weekdays: number[];
  hour: number;
  duration_minutes: number;
  start_date: string;
  end_date: string;
  excluded: Array<{ from: string; to: string }>;
  skipped: string[];
  studio_requests: { studio_slots: Array<{ date: string; status: string }> } | null;
}

export default async function OwnLessonsPage() {
  await requireAdmin();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());
  let config = defaultRoomsConfig;
  try {
    config = await loadRoomsConfig();
  } catch {
    // a terem azonosítója is érthető
  }
  let series: OwnSeriesView[] = [];
  let loadError = false;
  try {
    const rows = await bookingStore<SeriesRow[]>(
      "own_series?select=id,name,room,weekdays,hour,duration_minutes,start_date,end_date,excluded,skipped,studio_requests(studio_slots(date,status))&order=start_date.desc,created_at.desc",
    );
    series = rows.map((r) => {
      const dates = (r.studio_requests?.studio_slots ?? []).filter((s) => s.status === "approved").map((s) => s.date);
      return {
        id: r.id, name: r.name, room: r.room, roomLabel: roomLabel(config, r.room), weekdays: r.weekdays,
        hour: Number(r.hour), durationMinutes: r.duration_minutes, startDate: r.start_date, endDate: r.end_date,
        excluded: r.excluded ?? [], skipped: r.skipped ?? [],
        total: dates.length, upcoming: dates.filter((d) => d >= today).length,
      };
    });
  } catch (caught) {
    // pl. még nincs lefuttatva a supabase/2026-11-own-lessons.sql
    console.error("[admin] own lessons could not be loaded", { message: (caught as Error).message });
    loadError = true;
  }
  return (
    <OwnLessonsEditor
      series={series}
      today={today}
      loadError={loadError}
      rooms={ROOM_IDS.map((id) => ({ id, label: roomLabel(config, id) }))}
    />
  );
}
