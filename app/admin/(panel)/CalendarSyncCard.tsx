"use client";

import { syncCalendarNow } from "@/app/admin/panel-actions";
import { Button, Card, StatusText, useSaver } from "@/components/admin/ui";

/** Google Naptár szinkron állapota + kézi szinkron gomb a Foglalások oldal alján. */
export default function CalendarSyncCard({ configured, backlog }: {
  configured: boolean;
  backlog: { pending: number; lastError: string | null } | null;
}) {
  const { pending, status, save } = useSaver();
  return (
    <Card
      className="mt-6"
      title="Google Naptár"
      description="A jóváhagyott foglalások automatikusan bekerülnek a termek Google Naptáraiba (átfoglaláskor átkerülnek, törléskor törlődnek)."
      actions={configured ? (
        <Button variant="primary" disabled={pending} onClick={() => save(() => syncCalendarNow(), "A naptár naprakész.")}>
          {pending ? "Szinkronizálás…" : "Szinkronizálás most"}
        </Button>
      ) : undefined}
    >
      {!configured ? (
        <p className="text-sm font-bold text-slate-500">
          Nincs bekötve. A beállításhoz lásd a GOOGLE-NAPTAR.md útmutatót (Vercel környezeti változók).
        </p>
      ) : backlog === null ? (
        <p className="text-sm text-slate-500">Az állapot nem tölthető be.</p>
      ) : backlog.pending === 0 ? (
        <p className="text-sm font-bold text-emerald-700">✓ Minden jóváhagyott foglalás bent van a naptárakban.</p>
      ) : (
        <div className="space-y-1 text-sm">
          <p className="font-bold text-amber-700">{backlog.pending} naptárbejegyzés vár szinkronizálásra.</p>
          {backlog.lastError && <p className="text-red-700">Utolsó hiba: {backlog.lastError}</p>}
        </div>
      )}
      <div className="mt-3">
        <StatusText status={status} />
      </div>
    </Card>
  );
}
