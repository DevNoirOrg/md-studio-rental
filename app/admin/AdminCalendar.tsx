"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BookingTimeline, { timelineRange } from "@/components/BookingTimeline";
import {
  rooms, isRoom, overlaps, endHour, formatBookingHour, canRescheduleBooking,
  type AdminSlot, type LessonType, type Room, type Slot,
} from "@/lib/studio-booking";
import BookingDetails from "./BookingDetails";
import AdminBookingForm from "./AdminBookingForm";
import { withBase } from "@/lib/base-path";
import { openingFor, roomAllows, roomLabel, type RoomsConfig } from "@/lib/room-config";

type CalendarView = "day" | "week" | "month";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export default function AdminCalendar({ config }: { config: RoomsConfig }) {
  const [room, setRoom] = useState<Room>(rooms[0]);
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [view, setView] = useState<CalendarView>("week");
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [error, setError] = useState("");
  const [loadedRange, setLoadedRange] = useState("");
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lessonType, setLessonType] = useState<LessonType>("privat");
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([]);
  const [saved, setSaved] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);
  const [rescheduling, setRescheduling] = useState<AdminSlot | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Slot | null>(null);
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const rescheduleBusy = useRef(false);
  const rescheduleNotice = useRef<HTMLDivElement>(null);
  // Új foglalásnál csak azok a termek, ahol a választott óratípus engedélyezett (Termek menü).
  const allowedRooms: readonly string[] = rescheduling ? [rescheduling.room] : rooms.filter((r) => roomAllows(config, r, lessonType));
  const validSlot = (slot: Slot) => {
    const opening = openingFor(config, slot.room, slot.date);
    return !!opening && slot.hour >= opening.open && endHour(slot) <= opening.close &&
    (slot.durationMinutes ?? 60) >= 60 && allowedRooms.includes(slot.room) &&
    new Date(`${slot.date}T00:00:00`).setMinutes(slot.hour * 60) > now.getTime() &&
    !slots.some((other) => overlaps(slot, other));
  };
  const removeSlot = (target: Slot) => setSelectedSlots((current) => current.filter((slot) => slot !== target));
  const selectSlot = (slot: Slot) => {
    if (rescheduling) {
      if (ready && !rescheduleBusy.current && canRescheduleBooking(rescheduling, slot, slots, new Date(), config)) {
        setRescheduleTarget(slot);
        setRescheduleError("");
      }
      return;
    }
    if (!ready || !validSlot(slot)) return;
    setSaved(false);
    setSelectedId(null);
    setSelectedSlots((current) => current.some((other) => overlaps(slot, other)) ? current : [...current, slot]);
  };
  const resizeSlot = (original: Slot, next: Slot) => {
    if (!ready || !validSlot(next)) return;
    setSelectedSlots((current) => current.some((other) => other !== original && overlaps(next, other))
      ? current : current.map((slot) => slot === original ? next : slot));
  };
  const bookingTrigger = useRef<HTMLElement | null>(null);
  const selectedBooking = slots.find((slot) => slot.id === selectedId);
  const closeDetails = (restoreFocus = true) => {
    setSelectedId(null);
    if (restoreFocus && bookingTrigger.current?.isConnected) bookingTrigger.current.focus({ preventScroll: true });
  };
  const selectedDate = new Date(`${date}T00:00:00`);
  const periodStart = view === "month"
    ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1) : selectedDate;
  const first = view === "day" ? selectedDate : addDays(periodStart, -((periodStart.getDay() + 6) % 7));
  const days = Array.from({ length: view === "month" ? 42 : view === "day" ? 1 : 7 }, (_, i) => addDays(first, i));
  const from = dateKey(first);
  const to = dateKey(days[days.length - 1]);
  const range = `${from}/${to}`;
  const ready = loadedRange === range && !error;
  const targetValid = ready && !!rescheduling && !!rescheduleTarget &&
    rescheduleTarget.date >= from && rescheduleTarget.date <= to &&
    canRescheduleBooking(rescheduling, rescheduleTarget, slots, now, config);
  const changeDate = (value: string) => {
    setSelectedId(null);
    setRescheduleTarget(null);
    setDate(value);
  };
  const changeView = (value: CalendarView) => {
    setRescheduleTarget(null);
    setView(value);
  };
  const navigate = (direction: number) => {
    setSelectedId(null);
    setRescheduleTarget(null);
    setDate(dateKey(view === "month"
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth() + direction, 1)
      : addDays(selectedDate, direction * (view === "day" ? 1 : 7))));
  };

  useEffect(() => {
    if (rescheduling) {
      rescheduleNotice.current?.focus({ preventScroll: true });
      rescheduleNotice.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- csak új átfoglalás indulásakor fókuszálunk
  }, [rescheduling?.id]);

  async function saveReschedule() {
    if (rescheduleBusy.current || !targetValid || !rescheduling || !rescheduleTarget) return;
    rescheduleBusy.current = true;
    setRescheduleSaving(true);
    setRescheduleError("");
    try {
      const response = await fetch(withBase(`/admin/api/bookings?id=${encodeURIComponent(rescheduling.id)}`), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: rescheduleTarget.date, hour: rescheduleTarget.hour }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        setRescheduleError(result.error || "Az időpont nem módosítható.");
        setRescheduleTarget(null);
        setLoadedRange("");
        setRetry((value) => value + 1);
        return;
      }
      const updated = result.slot as Pick<AdminSlot, "id" | "date" | "hour">;
      setSlots((current) => current.map((slot) => slot.id === updated.id ? { ...slot, ...updated } : slot));
      setDate(updated.date);
      setRescheduling(null);
      setRescheduleTarget(null);
      setRescheduled(true);
      setRetry((value) => value + 1);
    } catch (failure) {
      console.error("Admin booking rescheduling failed.", { name: (failure as Error).name });
      setRescheduleError("A módosítás eredménye nem ellenőrizhető. Ellenőrizd a naptárt újrapróbálás előtt.");
      setRescheduleTarget(null);
      setLoadedRange("");
      setRetry((value) => value + 1);
    } finally {
      rescheduleBusy.current = false;
      setRescheduleSaving(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(withBase(`/admin/api/bookings?from=${from}&to=${to}`), {
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.slots)) {
          throw new Error(result.error || "A foglalások nem tölthetők be.");
        }
        if (!active) return;
        const loaded = result.slots as AdminSlot[];
        setSlots(loaded);
        setSelectedSlots((current) => current.filter((slot) =>
          new Date(`${slot.date}T00:00:00`).setMinutes(slot.hour * 60) > Date.now() &&
          !loaded.some((other) => overlaps(slot, other))));
        setLoadedRange(range);
        setError("");
        setNow(new Date());
      } catch (failure) {
        if (!active) return;
        const message = (failure as Error).message;
        console.error("Admin calendar refresh failed.", { message });
        setError(message);
      } finally {
        inFlight = false;
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [from, to, range, retry]);

  // A rács a terem heti nyitvatartásához igazodik, de a nyitvatartáson kívüli régi foglalásokat is mutatja.
  const gridRange = timelineRange(config, room, ready ? slots.filter((slot) => slot.date >= from && slot.date <= to) : []);

  return (
    <section aria-label="Admin foglalási naptár">
      <fieldset disabled={rescheduleSaving} className="min-w-0">
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rooms.map((name) => (
          <button key={name} type="button" disabled={!allowedRooms.includes(name)} aria-pressed={room === name} onClick={() => { setSelectedId(null); setRoom(name); }}
            className={`rounded-2xl border-2 px-4 py-5 text-sm font-extrabold transition-colors disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40 ${
              room === name ? "border-[#40CFD5] bg-[#40CFD5]/15" : "border-gray-200 bg-white hover:border-[#40CFD5]"
            }`}>{roomLabel(config, name)}</button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Előző időszak" onClick={() => navigate(-1)}
            className="rounded-xl bg-gray-100 p-3 hover:bg-[#40CFD5]"><ChevronLeft size={20} /></button>
          <button type="button" aria-label="Következő időszak" onClick={() => navigate(1)}
            className="rounded-xl bg-gray-100 p-3 hover:bg-[#40CFD5]"><ChevronRight size={20} /></button>
          <button type="button" onClick={() => changeDate(dateKey(new Date()))} className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold">Ma</button>
          <label className="text-sm font-bold">
            <span className="sr-only">Naptári dátum</span>
            <input type="date" value={date} onChange={(event) => { if (event.target.value) changeDate(event.target.value); }}
              className="rounded-xl border border-gray-200 bg-white p-3" />
          </label>
        </div>
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1" aria-label="Admin naptár nézete">
          {([["day", "Nap"], ["week", "Hét"], ["month", "Hónap"]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => changeView(id)}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${view === id ? "bg-black text-white" : "text-gray-600"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-4 text-xs font-semibold text-gray-600">
        <span className="rounded bg-white px-2 py-1 text-gray-700 ring-1 ring-gray-200">Szabad</span>
        <span className="rounded bg-gray-200 px-2 py-1 text-gray-700">Elmúlt időpont</span>
        <span className="md-closed-slot rounded px-2 py-1 text-gray-700">Zárva</span>
        <span className="rounded bg-amber-100 px-2 py-1 text-amber-900">Jóváhagyásra vár</span>
        <span className="rounded bg-blue-100 px-2 py-1 text-blue-900">Foglalás alatt</span>
      </div>
      <div className="mb-5 min-h-5" aria-live="polite">
      {error ? (
        <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Újrapróbálás</button>
        </p>
      ) : !ready && <p role="status" className="text-sm text-gray-600">Foglalások betöltése…</p>}
      </div>
      <h3 className="mb-4 text-center text-lg font-extrabold">{roomLabel(config, room)}</h3>
      {view === "month" ? (
        <div>
          <h4 className="mb-4 text-center font-bold">
            {new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" }).format(selectedDate)}
          </h4>
          <div className="grid grid-cols-7 gap-1 sm:gap-2" aria-label="Havi naptár">
            {["H", "K", "Sze", "Cs", "P", "Szo", "V"].map((day) => (
              <div key={day} className="py-2 text-center text-xs font-bold text-gray-500">{day}</div>
            ))}
            {days.map((day) => {
              const key = dateKey(day);
              const bookings = ready ? slots.filter((slot) => slot.room === room && slot.date === key) : [];
              const pending = bookings.filter((slot) => slot.status === "pending").length;
              const approved = bookings.filter((slot) => slot.status === "approved").length;
              const inMonth = day.getMonth() === selectedDate.getMonth();
              return (
                <button key={key} type="button"
                  aria-label={`${key}, ${pending} jóváhagyásra vár, ${approved} foglalás alatt; napi nézet megnyitása`}
                  onClick={() => { changeDate(key); changeView("day"); }}
                  className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border p-1 text-sm focus-visible:ring-2 focus-visible:ring-[#40CFD5] ${
                    !inMonth ? "border-gray-100 bg-gray-50 text-gray-400" :
                      key === date ? "border-[#40CFD5] bg-[#40CFD5]/10" : "border-gray-200 bg-white hover:border-[#40CFD5]"
                  }`}>
                  <span className="font-bold">{day.getDate()}.</span>
                  {ready ? (
                    <span className="flex flex-wrap justify-center gap-1 text-[10px]">
                      {pending > 0 && <span className="rounded bg-amber-100 px-1 text-amber-900">{pending} vár</span>}
                      {approved > 0 && <span className="rounded bg-blue-100 px-1 text-blue-900">{approved} alatt</span>}
                    </span>
                  ) : <span aria-hidden="true" className="text-xs">…</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className={view === "day" ? "mx-auto max-w-xl" : "grid min-w-[980px] grid-cols-7"}>
            {days.map((day) => (
              <div key={dateKey(day)}>
                <div className="border-r border-white/20 bg-black px-2 py-3 text-center text-sm font-bold text-white">
                  {new Intl.DateTimeFormat("hu-HU", { month: "short", day: "numeric", weekday: "short" }).format(day)}
                </div>
                <BookingTimeline key={rescheduling?.id ?? "new"} config={config} range={gridRange} room={room} date={dateKey(day)}
                  selectedSlots={rescheduling ? (rescheduleTarget ? [rescheduleTarget] : []) : selectedSlots}
                  reschedulingBooking={rescheduling} readOnly={rescheduleSaving}
                  storedSlots={ready ? slots : []}
                  availabilityReady={ready} now={now}
                  onSelect={selectSlot} onResize={resizeSlot} onRemove={removeSlot} removeOnClick
                  onBookingClick={(slot, trigger) => {
                    bookingTrigger.current = trigger;
                    setDeleted(false);
                    setRescheduled(false);
                    setSelectedId(slot.id);
                  }} />
              </div>
            ))}
          </div>
        </div>
      )}
      </fieldset>
      <p className="mt-4 text-center text-xs text-gray-500">A foglalások 10 másodpercenként frissülnek.</p>
      {saved && <p role="status" className="mt-4 rounded-xl bg-blue-100 p-4 text-blue-900">A foglalást „Foglalás alatt” állapottal mentettük.</p>}
      {rescheduling && (
        <div ref={rescheduleNotice} tabIndex={-1} aria-label="Átfoglalás" className="mt-5 rounded-2xl border-2 border-[#40CFD5] bg-[#40CFD5]/10 p-4">
          <h3 className="font-extrabold">Új időpont kiválasztása · {rescheduling.durationMinutes} perc</h3>
          <p className="mt-2 text-sm">{rescheduling.room} · Eredeti időpont: {rescheduling.date}, {formatBookingHour(rescheduling.hour)}–{formatBookingHour(endHour(rescheduling))}</p>
          <p className="mt-2 text-sm">Vidd az egeret a naptár fölé, majd kattints az új kezdési időre. Türkiz: elfér; piros: nem választható. A terem, az időtartam, az ár és a státusz nem változik.</p>
          <p role="status" className="mt-3 text-sm font-bold">
            {rescheduleTarget ? `${rescheduleTarget.date}, ${formatBookingHour(rescheduleTarget.hour)}–${formatBookingHour(endHour(rescheduleTarget))}${targetValid ? "" : " – már nem választható"}` : "Válassz új időpontot a naptárban."}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={!targetValid || rescheduleSaving} onClick={saveReschedule}
              className="rounded-xl bg-[#40CFD5] px-4 py-3 text-sm font-bold disabled:opacity-50">
              {rescheduleSaving ? "Mentés…" : "Átfoglalás mentése"}
            </button>
            <button type="button" disabled={rescheduleSaving} onClick={() => {
              setRescheduling(null); setRescheduleTarget(null); setRescheduleError("");
            }} className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold disabled:opacity-50">Mégse</button>
          </div>
          {rescheduleError && <p role="alert" className="mt-3 text-sm text-red-800">{rescheduleError}</p>}
        </div>
      )}
      {!rescheduling && selectedSlots.length > 0 && (
        <AdminBookingForm config={config} slots={selectedSlots} lessonType={lessonType} ready={ready} onRemove={removeSlot}
          onLessonTypeChange={(type) => {
            setLessonType(type);
            setSaved(false);
          }}
          onSaved={() => {
            setSelectedSlots([]);
            setSaved(true);
            setLoadedRange("");
            setRetry((value) => value + 1);
          }} />
      )}
      {ready && selectedBooking && (
        <BookingDetails key={selectedBooking.id} booking={selectedBooking} onClose={closeDetails}
          onStartReschedule={(booking) => {
            setSelectedId(null);
            setRescheduling(booking);
            setRescheduleTarget(null);
            setRescheduleError("");
            setRescheduled(false);
            setDeleted(false);
            setSaved(false);
            if (isRoom(booking.room)) setRoom(booking.room);
          }}
          onDeleted={(id) => {
            setSelectedId(null);
            setSlots((current) => current.filter((slot) => slot.id !== id));
            setDeleted(true);
            setRetry((value) => value + 1);
          }} />
      )}
      {deleted && <p role="status" className="mt-4 rounded-xl bg-blue-100 p-4 text-blue-900">A foglalást töröltük, az időpont újra szabad.</p>}
      {rescheduled && <p role="status" className="mt-4 rounded-xl bg-blue-100 p-4 text-blue-900">Az időpontot módosítottuk. A terem, az időtartam, az ár és a státusz változatlan maradt.</p>}
    </section>
  );
}
