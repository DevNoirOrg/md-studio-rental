"use client";

import { Button, Card } from "@/components/admin/ui";

export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card title="Az oldal nem tölthető be">
      <p className="text-sm text-slate-600">
        Nem sikerült elérni az adatbázist. Ha most állítottad be a rendszert, ellenőrizd, hogy lefutott-e a
        <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">supabase/studio-bookings.sql</code>
        és a <strong>rental</strong> séma szerepel-e a Supabase Data API „Exposed schemas” listáján.
      </p>
      <Button variant="primary" className="mt-4" onClick={reset}>Újrapróbálás</Button>
    </Card>
  );
}
