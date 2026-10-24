"use client";

import { useEffect, useState } from "react";
import { saveRoom } from "@/app/admin/panel-actions";
import ImageListField from "@/components/admin/ImageListField";
import {
  Button, Card, Field, PageHeader, SaveBar, StringListEditor, inputCls, isSame, textareaCls, useSaver,
} from "@/components/admin/ui";
import type { EditInfo } from "@/lib/admin-types";
import { LESSON_TYPES, WEEKDAY_NAMES, type LessonType, type Room, type RoomConfig } from "@/lib/room-config";
import { formatBookingHour } from "@/lib/studio-booking";

export interface RoomEntry {
  id: Room;
  config: RoomConfig;
  info: EditInfo;
}

const lessonNames: Record<LessonType, string> = { privat: "Privát óra", kiscsoportos: "Kiscsoportos óra", csoportos: "Csoportos óra" };
const halfHours = Array.from({ length: 49 }, (_, i) => i / 2);

function NumberInput({ id, value, onChange, step = 0.1, suffix }: {
  id: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        className={inputCls}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
      />
      {suffix && <span className="shrink-0 text-sm font-bold text-slate-400">{suffix}</span>}
    </div>
  );
}

function TimeSelect({ value, onChange, disabled, label, from = 0, to = 24 }: {
  value: number; onChange: (v: number) => void; disabled?: boolean; label: string; from?: number; to?: number;
}) {
  return (
    <select
      aria-label={label}
      disabled={disabled}
      className={`${inputCls.replace("w-full", "w-28")} py-2 disabled:opacity-40`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {halfHours.filter((h) => h >= from && h <= to).map((h) => (
        <option key={h} value={h}>{formatBookingHour(h)}</option>
      ))}
    </select>
  );
}

function RoomForm({ id, room, onChange }: { id: Room; room: RoomConfig; onChange: (update: (r: RoomConfig) => RoomConfig) => void }) {
  const set = <K extends keyof RoomConfig>(key: K, value: RoomConfig[K]) => onChange((r) => ({ ...r, [key]: value }));
  const f = (name: string) => `${id}-${name}`.replace(/\s+/g, "-");
  const setDay = (i: number, patch: Partial<RoomConfig["hours"][number]>) =>
    onChange((r) => ({ ...r, hours: r.hours.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  return (
    <div className="space-y-6">
      <Card title="Megjelenés" description="Ez látszik a terem kártyáján és a részletes ablakban.">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Helyszín" htmlFor={f("location")} hint="Pl. Astoria stúdió">
            <input id={f("location")} className={inputCls} value={room.location} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label="Terem neve" htmlFor={f("name")} hint="Pl. Nagy Terem">
            <input id={f("name")} className={inputCls} value={room.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Leírás" htmlFor={f("description")} className="md:col-span-2">
            <textarea id={f("description")} rows={4} className={textareaCls} value={room.description}
              onChange={(e) => set("description", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Képek" description="Az első kép a kártyán látszik, a többi a terem galériájában (lapozható).">
        <ImageListField value={room.images} onChange={(update) => onChange((r) => ({ ...r, images: update(r.images) }))} />
      </Card>

      <Card title="Méretek">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Alapterület" htmlFor={f("area")}>
            <NumberInput id={f("area")} value={room.area} onChange={(v) => set("area", v)} step={1} suffix="m²" />
          </Field>
          <Field label="Hosszúság" htmlFor={f("length")}>
            <NumberInput id={f("length")} value={room.length} onChange={(v) => set("length", v)} suffix="m" />
          </Field>
          <Field label="Szélesség" htmlFor={f("width")}>
            <NumberInput id={f("width")} value={room.width} onChange={(v) => set("width", v)} suffix="m" />
          </Field>
          <Field label="Belmagasság" htmlFor={f("height")}>
            <NumberInput id={f("height")} value={room.height} onChange={(v) => set("height", v)} suffix="m" />
          </Field>
          <Field label="Befogadóképesség" htmlFor={f("capacity")}>
            <NumberInput id={f("capacity")} value={room.capacity} onChange={(v) => set("capacity", v)} step={1} suffix="fő" />
          </Field>
        </div>
      </Card>

      <Card title="Felszereltség">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="flex items-center gap-3 text-sm font-bold text-ink md:col-span-2">
            <input type="checkbox" className="h-5 w-5 accent-md-teal" checked={room.ac} onChange={(e) => set("ac", e.target.checked)} />
            Klimatizált terem
          </label>
          <Field label="Hangrendszer" htmlFor={f("sound")}>
            <input id={f("sound")} className={inputCls} value={room.sound} onChange={(e) => set("sound", e.target.value)} />
          </Field>
          <Field label="Tükör" htmlFor={f("mirror")}>
            <input id={f("mirror")} className={inputCls} value={room.mirror} onChange={(e) => set("mirror", e.target.value)} />
          </Field>
          <Field label="Padló" htmlFor={f("floor")}>
            <input id={f("floor")} className={inputCls} value={room.floor} onChange={(e) => set("floor", e.target.value)} />
          </Field>
          <Field label="Világítás" htmlFor={f("light")}>
            <input id={f("light")} className={inputCls} value={room.light} onChange={(e) => set("light", e.target.value)} />
          </Field>
          <Field label="Extrák" hint="Címkeként jelennek meg (pl. Öltöző, Ingyenes Wi-Fi)." className="md:col-span-2">
            <StringListEditor items={room.extras} onChange={(extras) => set("extras", extras)} placeholder="Pl. Öltöző és zuhany" addLabel="+ Új extra" max={20} />
          </Field>
        </div>
      </Card>

      <Card
        title="Óratípusok és óradíjak"
        description="Melyik óratípusra foglalható a terem, és mennyi az óradíja. Az új ár csak az új foglalásokra vonatkozik."
      >
        <ul className="divide-y divide-slate-100">
          {LESSON_TYPES.map((type) => {
            const on = room.lessonTypes.includes(type);
            return (
              <li key={type} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <label className="flex items-center gap-3 text-sm font-bold text-ink">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-md-teal"
                    checked={on}
                    onChange={(e) =>
                      onChange((r) => ({
                        ...r,
                        lessonTypes: LESSON_TYPES.filter((t) => (t === type ? e.target.checked : r.lessonTypes.includes(t))),
                      }))
                    }
                  />
                  {lessonNames[type]}
                </label>
                <div className={`w-56 ${on ? "" : "opacity-50"}`}>
                  <NumberInput
                    id={f(`price-${type}`)}
                    value={room.prices[type]}
                    onChange={(v) => onChange((r) => ({ ...r, prices: { ...r.prices, [type]: v } }))}
                    step={100}
                    suffix="Ft / óra"
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {room.lessonTypes.length === 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            Így a terem egyik óratípusra sem foglalható.
          </p>
        )}
      </Card>

      <Card
        title="Nyitvatartás"
        description="Ezen belül lehet foglalni (fél órás lépésekben). Ha szűkíted, a már meglévő foglalások megmaradnak — mentéskor szólunk, ha van ilyen."
        actions={
          <Button onClick={() => onChange((r) => ({ ...r, hours: r.hours.map(() => ({ ...r.hours[0] })) }))}>
            Hétfő másolása minden napra
          </Button>
        }
      >
        <ul className="divide-y divide-slate-100">
          {room.hours.map((day, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <span className="w-28 text-sm font-extrabold text-ink">{WEEKDAY_NAMES[i]}</span>
              <TimeSelect label={`${WEEKDAY_NAMES[i]} nyitás`} value={day.open} disabled={day.closed} to={23}
                onChange={(open) => setDay(i, { open, close: Math.max(day.close, open + 1) })} />
              <span className="font-bold text-slate-300" aria-hidden="true">–</span>
              <TimeSelect label={`${WEEKDAY_NAMES[i]} zárás`} value={day.close} disabled={day.closed} from={day.open + 1}
                onChange={(close) => setDay(i, { close })} />
              <label className="ml-auto flex items-center gap-2 text-sm font-bold text-slate-500">
                <input type="checkbox" className="h-4 w-4 accent-md-teal" checked={day.closed}
                  onChange={(e) => setDay(i, { closed: e.target.checked })} />
                Zárva
              </label>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function RoomsEditor({ rooms }: { rooms: RoomEntry[] }) {
  const [activeId, setActiveId] = useState<Room>(rooms[0].id);
  const [drafts, setDrafts] = useState<Record<string, RoomConfig>>(() => Object.fromEntries(rooms.map((r) => [r.id, r.config])));
  const { pending, status, save, setStatus } = useSaver();
  const active = rooms.find((r) => r.id === activeId) ?? rooms[0];
  const draft = drafts[active.id];
  const isDirty = (r: RoomEntry) => !isSame(drafts[r.id], r.config);
  const anyDirty = rooms.some(isDirty);

  // mentetlen változás bármelyik teremnél → figyelmeztetés az oldal elhagyásakor
  useEffect(() => {
    if (!anyDirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [anyDirty]);

  return (
    <div>
      <PageHeader
        title="Termek"
        description="A négy terem adatai, képei, óratípusai, óradíjai és nyitvatartása. Termenként külön kell menteni."
      />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Terem kiválasztása">
        {rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={r.id === active.id}
            onClick={() => {
              setActiveId(r.id);
              setStatus(null);
            }}
            className={`shrink-0 rounded-2xl px-4 py-3 text-left transition-colors ${
              r.id === active.id ? "bg-ink text-white" : "bg-white text-ink hover:bg-md-pale"
            }`}
          >
            <span className={`block text-[10px] font-extrabold uppercase tracking-widest ${r.id === active.id ? "text-md-cyan" : "text-md-teal"}`}>
              {drafts[r.id].location || "—"}
            </span>
            <span className="block text-sm font-extrabold">
              {drafts[r.id].name || r.id}
              {isDirty(r) && <span className="ml-1.5 text-amber-500" title="Mentetlen változás">●</span>}
            </span>
          </button>
        ))}
      </div>

      <p className="mb-4 text-xs font-semibold text-slate-400">
        Belső azonosító (nem módosítható): <span className="font-bold text-slate-500">{active.id}</span>
      </p>

      <RoomForm
        key={active.id}
        id={active.id}
        room={draft}
        onChange={(update) => setDrafts((d) => ({ ...d, [active.id]: update(d[active.id]) }))}
      />

      <SaveBar
        dirty={isDirty(active)}
        pending={pending}
        status={status}
        info={active.info}
        label={`${draft.name || "Terem"} mentése`}
        onSave={() => save(() => saveRoom(active.id, drafts[active.id]))}
        onReset={() => setDrafts((d) => ({ ...d, [active.id]: active.config }))}
      />
    </div>
  );
}
