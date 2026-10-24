"use client";

import type React from "react";
import { useRef, useState } from "react";
import { bookingPrice, endHour, formatBookingHour, type LessonType, type Slot } from "@/lib/studio-booking";
import { Check, UserRound, UsersRound, Users } from "lucide-react";
import { withBase } from "@/lib/base-path";
import { roomAllows, roomLabel, type RoomsConfig } from "@/lib/room-config";

const currency = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

interface AdminBookingFormProps {
  config: RoomsConfig;
  slots: Slot[];
  lessonType: LessonType;
  ready: boolean;
  onRemove: (slot: Slot) => void;
  onSaved: () => void;
  onLessonTypeChange: (type: LessonType) => void;
}

const lessonOptions: Array<{ id: LessonType; title: string; capacity: string; Icon: typeof UserRound }> = [
  { id: "privat", title: "Privát óra", capacity: "3 fő", Icon: UserRound },
  { id: "kiscsoportos", title: "Kiscsoportos óra", capacity: "18 fő", Icon: UsersRound },
  { id: "csoportos", title: "Csoportos óra", capacity: "36 fő", Icon: Users },
];

export default function AdminBookingForm({ config, slots, lessonType, ready, onRemove, onSaved, onLessonTypeChange }: AdminBookingFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const total = slots.reduce((sum, slot) => sum + bookingPrice(slot, lessonType, config), 0);
  // Az óratípus csak akkor választható, ha minden kijelölt teremben engedélyezett.
  const typeAllowed = (type: LessonType) => slots.every((slot) => roomAllows(config, slot.room, type));
  const lessonTypeOk = typeAllowed(lessonType);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || !ready) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(withBase("/admin/api/bookings"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonType, slots, customer: {
          name: data.get("name"), email: data.get("email"), phone: data.get("phone"),
        } }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        setError(result.error || "A foglalás nem menthető.");
        return;
      }
      onSaved();
    } catch (failure) {
      console.error("Admin booking submission failed.", { name: (failure as Error).name });
      setError("A mentés eredménye nem ellenőrizhető. Újrapróbálás előtt ellenőrizd a naptárt.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <section aria-label="Új admin foglalás" className="mt-6 rounded-2xl border border-[#40CFD5] bg-[#40CFD5]/5 p-5">
      <h3 className="text-lg font-extrabold">Kiválasztott időpontok</h3>
      <ul className="my-4 space-y-2">
        {slots.map((slot) => (
          <li key={`${slot.room}/${slot.date}/${slot.hour}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm">
            <span>{roomLabel(config, slot.room)} · {slot.date} · {formatBookingHour(slot.hour)}–{formatBookingHour(endHour(slot))}
              {lessonTypeOk && <strong className="ml-2">{currency.format(bookingPrice(slot, lessonType, config))}</strong>}</span>
            <button type="button" disabled={saving} onClick={() => onRemove(slot)} className="font-bold text-red-700 underline">Törlés</button>
          </li>
        ))}
      </ul>
      {lessonTypeOk && <p className="mb-4 font-extrabold">Összesen: {currency.format(total)}</p>}
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={saving}>
          <legend className="mb-3 text-sm font-bold">Óratípus</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {lessonOptions.map(({ id, title, capacity, Icon }) => {
              const selected = lessonType === id;
              const unavailable = !typeAllowed(id);
              return (
                <button key={id} type="button" aria-pressed={selected} disabled={unavailable}
                  onClick={() => onLessonTypeChange(id)}
                  className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40 ${
                    selected ? "border-[#40CFD5] bg-[#40CFD5]/15" : "border-gray-200 bg-white hover:border-[#40CFD5]"
                  }`}>
                  <Icon size={28} aria-hidden="true" />
                  <span className="font-extrabold">{title}</span>
                  <span className="text-sm font-semibold text-[#087c81]">Max. {capacity}</span>
                  {selected && <Check size={18} aria-hidden="true" className="absolute right-2 top-2" />}
                </button>
              );
            })}
          </div>
          {!lessonTypeOk && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
              A kiválasztott óratípus nem minden kijelölt teremben foglalható — válassz másikat (a Termek menüben állítható).
            </p>
          )}
        </fieldset>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-bold">Név<input name="name" required maxLength={200} autoComplete="name" className="md-input mt-2" /></label>
          <label className="text-sm font-bold">E-mail-cím<input name="email" type="email" required maxLength={254} autoComplete="email" className="md-input mt-2" /></label>
          <label className="text-sm font-bold">Telefonszám<input name="phone" type="tel" required maxLength={40} autoComplete="tel" placeholder="+36…" className="md-input mt-2" /></label>
        </fieldset>
        <p className="text-sm text-gray-600">A foglalás azonnal „Foglalás alatt” állapotba kerül.</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={saving || !ready || !lessonTypeOk} className="rounded-xl bg-[#40CFD5] px-5 py-3 font-extrabold disabled:opacity-50">
          {saving ? "Mentés…" : "Foglalás mentése"}
        </button>
      </form>
    </section>
  );
}
