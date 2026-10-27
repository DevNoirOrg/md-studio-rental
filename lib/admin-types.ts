/** Az admin műveletek (server action) eredménye. `warning`: sikeres, de figyelmeztetéssel; `message`: egyedi sikerüzenet. */
export type ActionResult = { ok: true; warning?: string; message?: string } | { ok: false; error: string };

/** "Utoljára módosította" adat. */
export type EditInfo = { updatedAt: string; updatedBy: string } | null;
