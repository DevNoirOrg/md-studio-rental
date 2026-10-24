// Tesztekhez: a valódi lib/rooms-store.ts a rental.rooms táblát olvassa; itt az alapértékek.
import { defaultRoomsConfig } from "../../lib/room-config.ts";
export const ROOMS_TAG = "rental-rooms";
export async function loadRoomsConfig() {
  return defaultRoomsConfig;
}
export async function loadPublicRoomsConfig() {
  return defaultRoomsConfig;
}
