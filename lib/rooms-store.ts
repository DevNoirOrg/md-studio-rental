import { bookingStore } from "./booking-store.ts";
import { defaultRoomsConfig, roomsConfigFromRows, type RoomsConfig } from "./room-config.ts";

/*
  A terembeállítások betöltése a rental.rooms táblából (csak szerveren).
   - A publikus oldal gyorsítótárazott változatot kap (ROOMS_TAG), amit az admin
     mentése azonnal frissít.
   - A foglalás ellenőrzése (API) mindig friss adatot olvas.
*/
export const ROOMS_TAG = "rental-rooms";

export interface RoomRow {
  id: string;
  data: unknown;
  updated_at: string | null;
  updated_by: string | null;
}

export async function loadRoomRows({ fresh = true } = {}): Promise<RoomRow[]> {
  return bookingStore<RoomRow[]>("rooms?select=id,data,updated_at,updated_by&order=sort", {
    ...(fresh ? {} : { cacheTags: [ROOMS_TAG] }),
  });
}

/** Friss beállítás (foglalás ellenőrzéséhez). Hiba esetén kivételt dob. */
export async function loadRoomsConfig(): Promise<RoomsConfig> {
  return roomsConfigFromRows(await loadRoomRows());
}

/** A publikus oldalhoz: gyorsítótárazott; ha az adatbázis nem érhető el, az alapértékek. */
export async function loadPublicRoomsConfig(): Promise<RoomsConfig> {
  try {
    return roomsConfigFromRows(await loadRoomRows({ fresh: false }));
  } catch (caught) {
    console.error("Room settings could not be loaded; using defaults.", { message: (caught as Error).message });
    return defaultRoomsConfig;
  }
}
