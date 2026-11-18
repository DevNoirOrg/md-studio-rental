"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOwnSeries, deleteOwnSeriesFrom } from "@/app/admin/panel-actions";
import { Button, Card, Field, PageHeader, StatusText, inputCls, useSaver, type Status } from "@/components/admin/ui";
import { formatBookingHour } from "@/lib/studio-booking";
import { WEEKDAY_NAMES, WEEKDAY_SHORT, ownSeriesDates, ownSeriesError, type ExcludedPeriod } from "@/lib/own-lessons";

export interface OwnSeriesView {
  id: string;
  name: string;
  room: string;
  roomLabel: string;
  weekdays: number[];
  hour: number;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  excluded: ExcludedPeriod[];
  skipped: string[];
  total: number;
  upcoming: number;
}

const HALF_HOURS = Array.from({ length: 49 }, (_, i) => i / 2);
const formatDay = (date: string) =>
  new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const timeRange = (hour: number, minutes: number) => `${formatBookingHour(hour)}–${formatBookingHour(hour + minutes / 60)}`;
const daysText = (weekdays: number[]) => [...weekdays].sort().map((d) => WEEKDAY_NAMES[d]).join(", ");

export default function OwnLessonsEditor({ series, today, loadError, rooms }: {
  series: OwnSeriesView[];
  today: string;
  loadError: boolean;
  rooms: Array<{ id: string; label: string }>;
}) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState(rooms[0]?.id ?? "");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [start, setStart] = useState(17);
  const [end, setEnd] = useState(19);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [excluded, setExcluded] = useState<ExcludedPeriod[]>([]);
  const [result, setResult] = useState<Status>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const { pending, status, save } = useSaver();
  const router = useRouter();

  const input = { name, room, weekdays, hour: start, durationMinutes: Math.round((end - start) * 60), startDate, endDate, excluded };
  const dates = ownSeriesDates(input);
  const problem = ownSeriesError(input);
  const toggleDay = (d: number) => setWeekdays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort()));

  async function create() {
    if (problem || creating) return;
    setCreating(true);
    setResult(null);
    setSkipped([]);
    try {
      const res = await createOwnSeries(input);
      if (!res.ok) {
        setResult({ type: "error", text: res.error });
        return;
      }
      setSkipped(res.skipped);
      setResult(res.skipped.length
        ? { type: "warn", text: `${res.created} alkalom létrehozva. ${res.skipped.length} alkalmat kihagytunk, mert arra már van foglalás — ezeket kézzel intézd (lent).` }
        : { type: "ok", text: `${res.created} alkalom létrehozva.` });
      setName("");
      setExcluded([]);
      router.refresh(); // a lista frissítése
    } catch {
      setResult({ type: "error", text: "A létrehozás eredménye nem ellenőrizhető. Frissítsd az oldalt, mielőtt újrapróbálod." });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="Saját órák"
        description="A stúdió saját, ismétlődő foglalásai (pl. félévre a táncórák). Az alkalmak a foglalóoldalon foglaltnak látszanak, az admin naptárban szürkén, és bekerülnek a terem Google naptárába. Ha egy alkalom felszabadul, a Foglalások naptárban kattints rá, és töröld — vagy rövidítsd."
      />
      {loadError && (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          A saját órák nem tölthetők be. Ellenőrizd, hogy lefutott-e a supabase/2026-11-own-lessons.sql a Supabase SQL Editorban.
        </p>
      )}

      <Card title="Új sorozat" description="Egy sorozat: 1 terem, 1 idősáv, a hét egy vagy több napja. Ha más teremben vagy más időben is van óra, az külön sorozat. Egyszeri foglaláshoz a kezdő- és a záródátum legyen ugyanaz a nap.">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Név (ez lesz a Google Naptárban az esemény címe)" htmlFor="own-name">
            <input id="own-name" className={inputCls} maxLength={80} value={name} placeholder="Pl. Hip-hop kezdő" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Terem" htmlFor="own-room">
            <select id="own-room" className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Napok">
            <div className="flex flex-wrap gap-2" role="group" aria-label="A hét napjai">
              {WEEKDAY_SHORT.map((label, d) => (
                <button key={d} type="button" aria-pressed={weekdays.includes(d)} aria-label={WEEKDAY_NAMES[d]} onClick={() => toggleDay(d)}
                  className={`min-w-12 rounded-xl border-2 px-3 py-2 text-sm font-extrabold ${weekdays.includes(d) ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-600 hover:border-md-cyan"}`}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kezdés" htmlFor="own-start">
              <select id="own-start" className={inputCls} value={start} onChange={(e) => {
                const next = Number(e.target.value);
                setStart(next);
                if (end < next + 1) setEnd(Math.min(24, next + 1));
              }}>
                {HALF_HOURS.slice(0, -2).map((h) => <option key={h} value={h}>{formatBookingHour(h)}</option>)}
              </select>
            </Field>
            <Field label="Vége" htmlFor="own-end">
              <select id="own-end" className={inputCls} value={end} onChange={(e) => setEnd(Number(e.target.value))}>
                {HALF_HOURS.filter((h) => h >= start + 1).map((h) => <option key={h} value={h}>{formatBookingHour(h)}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Első nap" htmlFor="own-from">
              <input id="own-from" type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Utolsó nap" htmlFor="own-to" hint="Legfeljebb 1 év.">
              <input id="own-to" type="date" className={inputCls} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Szünetek (ezeken a napokon nincs óra)">
            <div className="space-y-2">
              {excluded.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input type="date" aria-label="Szünet első napja" className={`${inputCls} max-w-[11rem]`} value={p.from}
                    onChange={(e) => setExcluded(excluded.map((x, j) => (j === i ? { ...x, from: e.target.value, to: x.to || e.target.value } : x)))} />
                  <span className="text-slate-400">–</span>
                  <input type="date" aria-label="Szünet utolsó napja" className={`${inputCls} max-w-[11rem]`} value={p.to} min={p.from}
                    onChange={(e) => setExcluded(excluded.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
                  <Button variant="ghost" onClick={() => setExcluded(excluded.filter((_, j) => j !== i))}>Törlés</Button>
                </div>
              ))}
              <Button onClick={() => setExcluded([...excluded, { from: "", to: "" }])}>+ Szünet hozzáadása</Button>
            </div>
          </Field>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button variant="primary" disabled={!!problem || creating} onClick={create}>
            {creating ? "Létrehozás…" : `Létrehozás${dates.length ? ` (${dates.length} alkalom)` : ""}`}
          </Button>
          {problem && (name || weekdays.length || endDate) && <span className="text-sm font-semibold text-slate-500">{problem}</span>}
        </div>
        <div className="mt-3"><StatusText status={result} /></div>
        {skipped.length > 0 && (
          <p className="mt-2 text-sm text-amber-800">Kihagyott alkalmak (már foglalt): {skipped.map(formatDay).join(", ")}</p>
        )}
      </Card>

      <Card title="Sorozatok" className="mt-6">
        {series.length === 0 ? (
          <p className="text-sm text-slate-500">Még nincs saját óra.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {series.map((s) => <SeriesItem key={s.id} series={s} today={today} pending={pending} save={save} />)}
          </ul>
        )}
        <div className="mt-3"><StatusText status={status} /></div>
      </Card>
    </div>
  );
}

function SeriesItem({ series: s, today, pending, save }: {
  series: OwnSeriesView;
  today: string;
  pending: boolean;
  save: ReturnType<typeof useSaver>["save"];
}) {
  const [from, setFrom] = useState(today > s.startDate ? today : s.startDate);
  const closed = s.upcoming === 0;
  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="font-extrabold text-ink">
          {s.name}
          {closed && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">lezárult</span>}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {s.roomLabel} · {daysText(s.weekdays)} · {timeRange(s.hour, s.durationMinutes)}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {formatDay(s.startDate)} – {formatDay(s.endDate)} · {s.total} alkalom, ebből {s.upcoming} még hátravan
        </p>
        {s.excluded.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">Szünet: {s.excluded.map((p) => (p.from === p.to ? formatDay(p.from) : `${formatDay(p.from)} – ${formatDay(p.to)}`)).join(", ")}</p>
        )}
        {s.skipped.length > 0 && (
          <p className="mt-1 text-xs text-amber-700">Létrehozáskor kihagyva (már foglalt volt): {s.skipped.map(formatDay).join(", ")}</p>
        )}
      </div>
      {!closed && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`from-${s.id}`}>Törlés ettől a naptól</label>
          <input id={`from-${s.id}`} type="date" className={`${inputCls} max-w-[11rem]`} value={from} onChange={(e) => setFrom(e.target.value)} />
          <Button variant="danger" disabled={pending || !from} onClick={() => {
            if (window.confirm(`Törlöd a(z) „${s.name}” sorozat összes alkalmát ${formatDay(from)}-tól/-től? A korábbi alkalmak megmaradnak. Ez nem vonható vissza.`)) {
              save(() => deleteOwnSeriesFrom(s.id, from), "Törölve.");
            }
          }}>
            Törlés dátumtól
          </Button>
        </div>
      )}
    </li>
  );
}
