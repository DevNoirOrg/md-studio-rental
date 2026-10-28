"use client";

import type React from "react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { canRescheduleBooking, endHour, formatBookingHour, overlaps, type Slot, type StoredSlot } from "@/lib/studio-booking";
import { openingFor, weeklyRange, type RoomsConfig } from "@/lib/room-config";

const rowHeight = 32;

/**
 * A naptár rácsa (kezdő és záró óra) egy teremre: a hét bármely napjának
 * nyitvatartása + a megjelenítendő foglalások (hogy a nyitvatartáson kívüli régi
 * foglalások is látszódjanak).
 */
export function timelineRange(config: RoomsConfig, room: string, slots: Slot[] = []): { start: number; end: number } {
  const c = (config as Record<string, RoomsConfig[keyof RoomsConfig]>)[room];
  const base = c ? weeklyRange(c) : { start: 8, end: 22 };
  const own = slots.filter((slot) => slot.room === room);
  return {
    start: Math.floor(Math.min(base.start, ...own.map((slot) => slot.hour)) * 2) / 2,
    end: Math.ceil(Math.max(base.end, ...own.map((slot) => endHour(slot))) * 2) / 2,
  };
}

type Edge = "top" | "bottom";

interface BookingTimelineProps<T extends StoredSlot> {
  config: RoomsConfig;
  /** A rács kezdete és vége (órában) — a hét összes napján azonos, hogy a sorok egy vonalban legyenek. */
  range: { start: number; end: number };
  room: string;
  date: string;
  selectedSlots: Slot[];
  storedSlots: T[];
  availabilityReady: boolean;
  now: Date;
  onSelect: (slot: Slot) => void;
  onResize: (original: Slot, next: Slot) => void;
  onRemove: (slot: Slot) => void;
  readOnly?: boolean;
  onBookingClick?: (slot: T, trigger: HTMLElement) => void;
  /** A foglalás kártyáján az idősáv alatt megjelenő felirat (admin: foglaló neve + létszám). */
  bookingLabel?: (slot: T) => string | null | undefined;
  removeOnClick?: boolean;
  reschedulingBooking?: StoredSlot | null;
}

export default function BookingTimeline<T extends StoredSlot>({
  config, range, room, date, selectedSlots, storedSlots, availabilityReady, now, onSelect, onResize, onRemove, readOnly = false, onBookingClick, bookingLabel, removeOnClick = false,
  reschedulingBooking = null,
}: BookingTimelineProps<T>) {
  const [preview, setPreview] = useState<Slot | null>(null);
  const opening = openingFor(config, room, date);
  const starts = Array.from({ length: Math.max(0, (range.end - range.start) * 2) }, (_, index) => range.start + index / 2);
  const isOpen = (hour: number) => !!opening && hour >= opening.open && hour < opening.close;
  const selected = selectedSlots.filter((slot) => slot.room === room && slot.date === date);
  const stored = storedSlots.filter((slot) => slot.room === room && slot.date === date);
  const isPast = (hour: number) => new Date(`${date}T${formatBookingHour(hour)}:00`) <= now;
  const sameStart = (a: Slot, b: Slot) => a.room === b.room && a.date === b.date && a.hour === b.hour;
  const allowed = (slot: Slot, original?: Slot): boolean => reschedulingBooking
    ? !readOnly && availabilityReady && canRescheduleBooking(reschedulingBooking, slot, stored, now, config)
    : !readOnly && availabilityReady && !!opening && slot.hour >= opening.open && !isPast(slot.hour) &&
    endHour(slot) <= opening.close && (slot.durationMinutes ?? 60) >= 60 &&
    !stored.some((other) => overlaps(slot, other)) &&
    !selected.some((other) => (!original || !sameStart(other, original)) && overlaps(slot, other));

  const styleFor = (slot: Slot) => ({
    top: (slot.hour - range.start) * 2 * rowHeight,
    height: (endHour(slot) - slot.hour) * 2 * rowHeight,
  });
  const rangeLabel = (slot: Slot) => `${formatBookingHour(slot.hour)}–${formatBookingHour(endHour(slot))}`;

  // ── Húzható nyilak: a kezdés (felső nyíl) és a befejezés (alsó nyíl) fél órás lépésekben húzható.
  // Húzás közben csak egy előnézet látszik; elengedéskor egyszer hívjuk az onResize-t.
  // Foglalt sávnál, a nap szélénél vagy a múltnál megáll. Sima kattintás: ±fél óra, mint eddig.
  const [drag, setDrag] = useState<{ edge: Edge; startY: number; origin: Slot; candidate: Slot } | null>(null);
  const dragMoved = useRef(false);
  const candidateFor = (edge: Edge, origin: Slot, steps: number) => {
    let best = origin;
    const dir = Math.sign(steps);
    for (let k = dir; Math.abs(k) <= Math.abs(steps); k += dir) {
      const duration = (origin.durationMinutes ?? 60) + (edge === "bottom" ? k : -k) * 30;
      const next = edge === "bottom"
        ? { ...origin, durationMinutes: duration }
        : { ...origin, hour: origin.hour + k * 0.5, durationMinutes: duration };
      if (duration < 60 || !allowed(next, origin)) break;
      best = next;
    }
    return best;
  };
  const dragHandlers = (edge: Edge, slot: Slot) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      dragMoved.current = false;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      setDrag({ edge, startY: event.clientY, origin: slot, candidate: slot });
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!drag || drag.edge !== edge || !sameStart(drag.origin, slot)) return;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dy) > 4) dragMoved.current = true;
      const steps = Math.round(dy / rowHeight);
      const candidate = steps === 0 ? drag.origin : candidateFor(edge, drag.origin, steps);
      if (candidate !== drag.candidate) setDrag({ ...drag, candidate });
    },
    onPointerUp: () => {
      if (!drag) return;
      const { origin, candidate } = drag;
      setDrag(null);
      if (dragMoved.current && (candidate.hour !== origin.hour || candidate.durationMinutes !== origin.durationMinutes)) {
        onResize(origin, candidate);
      }
    },
    onPointerCancel: () => setDrag(null),
    style: { touchAction: "none", cursor: "ns-resize" } as const,
  });

  return (
    <div data-timeline-date={date}
      className="relative isolate select-none border-x border-b border-gray-200 bg-white"
      style={{ height: starts.length * rowHeight }}
      onPointerLeave={() => setPreview(null)}
    >
      {starts.map((hour) => {
        const slot = { room, date, hour, durationMinutes: reschedulingBooking?.durationMinutes ?? 60 };
        const available = allowed(slot);
        return (
          <button key={hour} type="button" data-booking-hour={hour}
            aria-label={`${room}, ${date}, ${rangeLabel(slot)} – ${available ? "szabad idősáv kiválasztása" : isOpen(hour) ? "nem választható" : "zárva"}`}
            disabled={reschedulingBooking ? readOnly || !availabilityReady : !available}
            aria-disabled={reschedulingBooking && !available ? true : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setPreview(reschedulingBooking || available ? slot : null);
            }}
            onFocus={() => setPreview(reschedulingBooking || available ? slot : null)}
            onBlur={() => setPreview(null)}
            onClick={() => {
              if (available) {
                setPreview(null);
                onSelect(slot);
              }
            }}
            className={`absolute inset-x-0 flex w-full scroll-mt-28 items-start border-t px-2 pt-1 text-left text-[10px] focus-visible:z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087c81] ${
              !isOpen(hour) ? "md-closed-slot text-gray-400" : isPast(hour) ? "bg-gray-100 text-gray-400" : "text-gray-500"
            } ${reschedulingBooking && !available ? "cursor-not-allowed" : ""} ${Number.isInteger(hour) ? "border-gray-300" : "border-dashed border-gray-200"}`}
            style={{ top: (hour - range.start) * 2 * rowHeight, height: rowHeight }}
          >
            {formatBookingHour(hour)}
            {!opening && hour === range.start && <span className="ml-auto pr-1 font-bold uppercase tracking-widest">Zárva</span>}
          </button>
        );
      })}
      {stored.map((slot) => {
        const clickable = !!onBookingClick && !reschedulingBooking;
        const Block = clickable ? "button" : "div";
        const label = bookingLabel?.(slot);
        return (
        <Block key={slot.id || `${slot.hour}-${slot.status}`} style={styleFor(slot)}
          type={clickable ? "button" : undefined}
          onClick={clickable ? (event: React.MouseEvent<HTMLElement>) => onBookingClick?.(slot, event.currentTarget) : undefined}
          role={clickable ? undefined : "img"} aria-label={`${room}, ${date}, ${rangeLabel(slot)}${label ? `, ${label}` : ""} – ${slot.status === "pending" ? "jóváhagyásra vár" : slot.status === "approved" ? "foglalás alatt" : "foglalt"}`}
          className={`${clickable ? "cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-black" : "pointer-events-none"} absolute inset-x-0 z-10 flex flex-col items-start justify-start overflow-hidden border px-2 py-1 text-xs font-bold ${
            slot.status === "pending" ? "border-amber-400 bg-amber-100 text-amber-900" : "border-blue-400 bg-blue-100 text-blue-900"
          }`}
        >
          <span className="block">{rangeLabel(slot)}</span>
          {label && <span className="block w-full truncate font-semibold" title={label}>{label}</span>}
        </Block>
        );
      })}
      {selected.map((slot) => {
        if (reschedulingBooking) return (
          <div key={slot.hour} style={styleFor(slot)} data-reschedule-selection
            className={`pointer-events-none absolute inset-x-0 z-20 border-2 p-2 text-xs font-bold ${
              allowed(slot) ? "border-[#087c81] bg-[#40CFD5]/30" : "border-red-600 bg-red-100/80 text-red-900"
            }`}>{rangeLabel(slot)} · {allowed(slot) ? "Új időpont" : "Nem választható"}</div>
        );
        const earlier = { ...slot, hour: slot.hour - 0.5, durationMinutes: (slot.durationMinutes ?? 60) + 30 };
        const later = { ...slot, durationMinutes: (slot.durationMinutes ?? 60) + 30 };
        return (
        <div key={slot.hour} style={styleFor(slot)}
          className="absolute inset-x-0 z-20 border border-[#087c81] bg-[#40CFD5]/25 text-black">
          {removeOnClick ? (
          <button type="button" onClick={() => onRemove(slot)}
            aria-label={`${room}, ${date}, ${rangeLabel(slot)} kijelölésének törlése`}
            className="flex h-full w-full items-center justify-center px-1 text-[11px] font-extrabold text-[#065f63] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">
            {rangeLabel(slot)}
          </button>
          ) : (
          <>
          <div className="flex h-full w-full items-center justify-center px-1 text-[11px] font-extrabold text-[#065f63]">
            {rangeLabel(slot)}
          </div>
          <button type="button" onClick={() => onRemove(slot)}
            aria-label={`${room}, ${date}, ${rangeLabel(slot)} kijelölésének törlése`}
            title="Kijelölés törlése"
            className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black text-white shadow-sm transition-colors hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-black"
          ><X size={14} strokeWidth={2.75} aria-hidden="true" /></button>
          </>
          )}
          <button type="button"
            aria-label={`${room}, ${date}, ${rangeLabel(slot)} kezdése fél órával korábban`}
            title="Kezdés fél órával korábban — vagy húzd fel/le"
            disabled={!allowed(earlier, slot) && (slot.durationMinutes ?? 60) <= 60}
            {...dragHandlers("top", slot)}
            onClick={() => {
              if (dragMoved.current) { dragMoved.current = false; return; }
              if (allowed(earlier, slot)) onResize(slot, earlier);
            }}
            className="absolute left-1/2 top-0 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded bg-white/70 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
          ><ChevronUp size={20} aria-hidden="true" /></button>
          <button type="button"
            aria-label={`${room}, ${date}, ${rangeLabel(slot)} befejezése fél órával később`}
            title="Befejezés fél órával később — vagy húzd fel/le"
            disabled={!allowed(later, slot) && (slot.durationMinutes ?? 60) <= 60}
            {...dragHandlers("bottom", slot)}
            onClick={() => {
              if (dragMoved.current) { dragMoved.current = false; return; }
              if (allowed(later, slot)) onResize(slot, later);
            }}
            className="absolute bottom-0 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded bg-white/70 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
          ><ChevronDown size={20} aria-hidden="true" /></button>
        </div>
        );
      })}
      {drag && drag.origin.date === date && drag.origin.room === room && (
        <div data-drag-preview aria-hidden="true" style={styleFor(drag.candidate)}
          className="pointer-events-none absolute inset-x-0 z-[35] flex items-center justify-center border-2 border-dashed border-[#087c81] bg-[#40CFD5]/35 text-[11px] font-extrabold text-[#065f63]">
          {rangeLabel(drag.candidate)}
        </div>
      )}
      {preview && preview.date === date && preview.room === room && (reschedulingBooking || allowed(preview)) && (
        <div data-booking-preview data-available={allowed(preview)}
          style={{ ...styleFor(preview), ...(reschedulingBooking ? { maxHeight: (range.end - preview.hour) * 2 * rowHeight } : {}) }}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 z-30 border-2 border-dashed ${
            allowed(preview) ? "border-[#087c81] bg-[#40CFD5]/25" : "border-red-600 bg-red-200/60 text-red-900"
          }`}>
          {reschedulingBooking && <span className="block p-1 text-[10px] font-bold">
            {rangeLabel(preview)} · {preview.durationMinutes} perc · {allowed(preview) ? "Átfoglalható" : "Nem fér el / nem választható"}
          </span>}
        </div>
      )}
    </div>
  );
}
