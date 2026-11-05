import { bookingStore } from "./booking-store.ts";
import { PAGE_CONTENT_KEY, defaultPageContent, normalizePageContent, type PageContentSettings } from "./page-content.ts";

/*
  A foglalóoldal szövegei a rental.settings táblából (csak szerveren).
   - A publikus oldal gyorsítótárazott változatot kap (PAGE_CONTENT_TAG), amit az admin mentése frissít.
   - Ha a tábla még nincs létrehozva (supabase/2026-11-page-content.sql), az alapértékek látszanak.
*/
export const PAGE_CONTENT_TAG = "rental-page-content";

export interface PageContentRow {
  data: unknown;
  updated_at: string | null;
  updated_by: string | null;
}

export async function loadPageContentRow({ fresh = true } = {}): Promise<PageContentRow | null> {
  const rows = await bookingStore<PageContentRow[]>(
    `settings?select=data,updated_at,updated_by&key=eq.${PAGE_CONTENT_KEY}`,
    fresh ? {} : { cacheTags: [PAGE_CONTENT_TAG] },
  );
  return rows?.[0] ?? null;
}

/** A publikus oldalhoz: gyorsítótárazott; hiba esetén (pl. még nincs tábla) az alapértékek. */
export async function loadPublicPageContent(): Promise<PageContentSettings> {
  try {
    return normalizePageContent((await loadPageContentRow({ fresh: false }))?.data);
  } catch (caught) {
    console.error("Page content could not be loaded; using defaults.", { message: (caught as Error).message });
    return defaultPageContent;
  }
}
