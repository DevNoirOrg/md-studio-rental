"use client";

import { useState } from "react";
import { addAdmin, removeAdmin } from "@/app/admin/panel-actions";
import { Button, Card, PageHeader, StatusText, inputCls, useSaver } from "@/components/admin/ui";

export default function AdminsEditor({ me, admins }: { me: string; admins: { email: string; createdAt: string }[] }) {
  const [email, setEmail] = useState("");
  const { pending, status, save } = useSaver();

  return (
    <div className="pb-12">
      <PageHeader
        title="Adminok"
        description="Akik be tudnak lépni ide. Belépéskor egy egyszer használatos kódot kapnak e-mailben — jelszó nincs."
      />
      <Card title="Új admin">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(() => addAdmin(email), "Admin hozzáadva.", () => setEmail(""));
          }}
        >
          <input
            type="email"
            required
            className={`${inputCls} max-w-sm`}
            placeholder="uj.admin@pelda.hu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={pending}>
            Hozzáadás
          </Button>
        </form>
        <div className="mt-3">
          <StatusText status={status} />
        </div>
      </Card>
      <Card title="Jelenlegi adminok" className="mt-6">
        <ul className="divide-y divide-slate-100">
          {admins.map((a) => (
            <li key={a.email} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 truncate font-semibold">
                {a.email}
                {a.email === me && <span className="ml-2 text-xs font-bold text-slate-400">(te)</span>}
              </span>
              {a.email !== me && (
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Eltávolítod ${a.email} admin jogát?`)) save(() => removeAdmin(a.email), "Admin eltávolítva.");
                  }}
                >
                  Eltávolítás
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
