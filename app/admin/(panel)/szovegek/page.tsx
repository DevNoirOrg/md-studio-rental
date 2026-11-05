import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-session";
import { normalizePageContent } from "@/lib/page-content";
import { loadPageContentRow, type PageContentRow } from "@/lib/page-content-store";
import TextsEditor from "./TextsEditor";

export const metadata: Metadata = { title: "Szövegek | Stúdió bérlés admin" };

export default async function TextsPage() {
  await requireAdmin();
  let row: PageContentRow | null = null;
  let loadError = false;
  try {
    row = await loadPageContentRow();
  } catch (caught) {
    // pl. még nincs lefuttatva a supabase/2026-11-page-content.sql
    console.error("[admin] page content could not be loaded", { message: (caught as Error).message });
    loadError = true;
  }
  return (
    <TextsEditor
      initial={normalizePageContent(row?.data)}
      info={row?.updated_at && row.updated_by ? { updatedAt: row.updated_at, updatedBy: row.updated_by } : null}
      loadError={loadError}
    />
  );
}
