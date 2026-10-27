import { after } from "next/server";
import { calendarConfigured, syncCalendarQuietly } from "./google-calendar.ts";

/**
 * Google Naptár szinkron indítása a válasz elküldése UTÁN (nem lassítja a kérést).
 * Foglalás jóváhagyásakor, admin mentés/átfoglalás/törlés után és az admin naptár
 * betöltésekor hívjuk. Ha a naptár nincs beállítva, nem csinál semmit.
 */
export function scheduleCalendarSync(): void {
  if (!calendarConfigured()) return;
  try {
    after(syncCalendarQuietly);
  } catch {
    // kérésen kívül (pl. teszt) — azonnal, a háttérben
    void syncCalendarQuietly();
  }
}
