import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-session";
import { ROOM_IDS, roomsConfigFromRows } from "@/lib/room-config";
import { loadRoomRows } from "@/lib/rooms-store";
import RoomsEditor from "./RoomsEditor";

export const metadata: Metadata = { title: "Termek | Stúdió bérlés admin" };

export default async function RoomsPage() {
  await requireAdmin();
  const rows = await loadRoomRows();
  const config = roomsConfigFromRows(rows);
  const rooms = ROOM_IDS.map((id) => {
    const row = rows.find((r) => r.id === id);
    return {
      id,
      config: config[id],
      info: row?.updated_at && row.updated_by ? { updatedAt: row.updated_at, updatedBy: row.updated_by } : null,
    };
  });
  return <RoomsEditor rooms={rooms} />;
}
