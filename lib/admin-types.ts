/** Az admin műveletek (server action) eredménye. `warning`: sikeres mentés, de figyelmeztetéssel. */
export type ActionResult = { ok: true; warning?: string } | { ok: false; error: string };

/** "Utoljára módosította" adat. */
export type EditInfo = { updatedAt: string; updatedBy: string } | null;
