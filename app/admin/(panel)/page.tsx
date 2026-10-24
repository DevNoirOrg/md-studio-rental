import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-session";
import { loadRoomsConfig } from "@/lib/rooms-store";
import { defaultRoomsConfig } from "@/lib/room-config";
import AdminCalendar from "../AdminCalendar";

export const metadata: Metadata = { title: "Foglalások | Stúdió bérlés admin" };

export default async function BookingsPage() {
  await requireAdmin();
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
        <AdminCalendar config={config} />
      </div>
    </div>
  );
}
