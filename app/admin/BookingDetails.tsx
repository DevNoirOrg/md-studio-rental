"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { endHour, formatBookingHour, type AdminSlot, type LessonType } from "@/lib/studio-booking";
import { withBase } from "@/lib/base-path";
import { markRequestPaid } from "@/app/admin/panel-actions";

const lessonNames: Record<LessonType, string> = { privat: "Privát óra", kiscsoportos: "Kiscsoportos óra", csoportos: "Csoportos óra" };
const currency = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

interface BookingDetailsProps {
  booking: AdminSlot;
  onClose: (restoreFocus?: boolean) => void;
  onDeleted: (id: string) => void;
  onStartReschedule: (booking: AdminSlot) => void;
  /** A foglalás változott (pl. fizetettnek jelölve) → a naptár frissítése. */
  onUpdated?: () => void;
}

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Budapest" }).format(new Date(iso));

/** A foglalás állapota a fizetéssel együtt: jóváhagyásra vár / fizetésre vár / fizetve / foglalás alatt. */
function statusOf(booking: AdminSlot): { label: string; cls: string } {
  if (booking.status === "pending") return { label: "Jóváhagyásra vár", cls: "bg-amber-100 text-amber-900" };
  if (booking.payment?.status === "awaiting") return { label: "Fizetésre vár", cls: "bg-violet-100 text-violet-900" };
  if (booking.payment?.status === "paid") return { label: "Fizetve", cls: "bg-blue-100 text-blue-900" };
  return { label: "Foglalás alatt", cls: "bg-blue-100 text-blue-900" };
}

const invoiceText: Record<string, string> = {
  pending: "Kiállítás folyamatban…",
  issued: "Kiállítva",
  error: "Hiba",
  skipped: "Nincs automatikus számla",
};

export default function BookingDetails({ booking, onClose, onDeleted, onStartReschedule, onUpdated }: BookingDetailsProps) {
  const [marking, setMarking] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [paidMessage, setPaidMessage] = useState("");
  async function markPaid() {
    if (!booking.payment || busyRef.current) return;
    busyRef.current = true;
    setMarking(true);
    setError("");
    try {
      const result = await markRequestPaid(booking.payment.requestId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPaidMessage("Fizetettnek jelölve.");
      setConfirmPaid(false);
      onUpdated?.();
    } catch {
      setError("Nem sikerült menteni. Próbáld újra.");
    } finally {
      busyRef.current = false;
      setMarking(false);
    }
  }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const busy = deleting;
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  async function deleteBooking() {
    if (busyRef.current) return;
    busyRef.current = true;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(withBase(`/admin/api/bookings?id=${encodeURIComponent(booking.id)}`), { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        setError(result.error || "A foglalás nem törölhető.");
        return;
      }
      onDeleted(booking.id);
    } catch (failure) {
      console.error("Admin booking deletion failed.", { name: (failure as Error).name });
      setError("A törlés eredménye nem ellenőrizhető. Ellenőrizd a naptárt újrapróbálás előtt.");
    } finally {
      busyRef.current = false;
      setDeleting(false);
    }
  }
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        close.current();
      }
    };
    const handleOutsideClick = (event: MouseEvent) => {
      if (!busyRef.current && event.target instanceof Node && !panel.current?.contains(event.target)) {
        close.current(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("click", handleOutsideClick, true);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("click", handleOutsideClick, true);
    };
  }, [booking.id]);
  const customer = booking.customer;
  return (
    <aside ref={panel} role="dialog" aria-modal="false" aria-labelledby="booking-details-title"
      className="fixed inset-y-0 right-0 z-[80] w-full overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-[-8px_0_40px_rgba(0,0,0,0.18)] sm:max-w-md sm:p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <h2 id="booking-details-title" className="section-title text-3xl">Foglalás részletei</h2>
        <button ref={closeButton} type="button" disabled={busy} onClick={() => onClose()} aria-label="Részletek bezárása"
          className="rounded-full bg-gray-100 p-2 hover:bg-[#40CFD5] focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <span className={`inline-block rounded-lg px-3 py-2 text-sm font-bold ${statusOf(booking).cls}`}>{statusOf(booking).label}</span>
      {booking.status === "approved" && booking.payment && (
        <section aria-label="Fizetés" className="mt-5 space-y-2 rounded-2xl bg-gray-50 p-4 text-sm">
          {booking.payment.status === "awaiting" && (
            <p><strong>Fizetési határidő:</strong> {booking.payment.due ? dateTime(booking.payment.due) : "nincs (a foglalás kezdetéig fizethet)"}</p>
          )}
          {booking.payment.status === "paid" && booking.payment.paidAt && (
            <p><strong>Fizetve:</strong> {dateTime(booking.payment.paidAt)} · {booking.payment.via === "stripe" ? "online, bankkártyával" : "kézzel jelölve"}</p>
          )}
          {booking.payment.status === "paid" && booking.payment.invoice.status && (
            <p className={booking.payment.invoice.status === "error" ? "text-red-800" : ""}>
              <strong>Számla:</strong> {invoiceText[booking.payment.invoice.status] ?? booking.payment.invoice.status}
              {booking.payment.invoice.number && ` · ${booking.payment.invoice.number}`}
              {booking.payment.invoice.error && <span className="mt-1 block text-xs">{booking.payment.invoice.error}</span>}
            </p>
          )}
          {booking.payment.status !== "paid" && (
            confirmPaid ? (
              <div className="rounded-xl border border-blue-200 bg-white p-3">
                <p className="font-bold">Fizetettnek jelölöd az igény összes jóváhagyott időpontját?</p>
                <p className="mt-1 text-gray-600">Pl. átutalásnál vagy helyszíni fizetésnél. Ilyenkor nem készül automatikus számla, és nem megy bejutási e-mail.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={marking} onClick={markPaid}
                    className="rounded-lg bg-blue-600 px-3 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50">{marking ? "Mentés…" : "Igen, fizetett"}</button>
                  <button type="button" disabled={marking} onClick={() => setConfirmPaid(false)} className="rounded-lg bg-gray-100 px-3 py-2 font-bold">Mégse</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setConfirmPaid(true); setPaidMessage(""); }}
                className="font-bold text-[#087c81] underline underline-offset-2">Fizetettnek jelölöm</button>
            )
          )}
          {paidMessage && <p role="status" className="font-bold text-blue-900">{paidMessage}</p>}
        </section>
      )}
      <dl className="mt-6 space-y-5 text-sm">
        <div><dt className="text-gray-500">Terem</dt><dd className="mt-1 font-bold">{booking.room}</dd></div>
        <div><dt className="text-gray-500">Dátum</dt><dd className="mt-1 font-bold">
          {new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${booking.date}T12:00:00`))}
        </dd></div>
        <div><dt className="text-gray-500">Idősáv</dt><dd className="mt-1 font-bold">
          {formatBookingHour(booking.hour)}–{formatBookingHour(endHour(booking))} · {booking.durationMinutes} perc
        </dd></div>
        <div><dt className="text-gray-500">Óratípus</dt><dd className="mt-1 font-bold">{lessonNames[booking.lessonType]}</dd></div>
        <div><dt className="text-gray-500">Ár</dt><dd className="mt-1 text-lg font-extrabold text-[#087c81]">{currency.format(booking.price)}</dd></div>
        {booking.status === "approved" && booking.calendar && (
          <div><dt className="text-gray-500">Google Naptár</dt><dd className="mt-1 font-bold">
            {booking.calendar.pending ? (
              booking.calendar.error ? (
                <span className="text-red-700">Nem sikerült beírni — {booking.calendar.error}</span>
              ) : <span className="text-amber-700">Szinkronizálásra vár</span>
            ) : booking.calendar.synced ? (
              <span className="text-emerald-700">✓ Bent van a terem naptárában</span>
            ) : <span className="text-gray-500">Nincs a naptárban (a bekötés előtti foglalás)</span>}
          </dd></div>
        )}
      </dl>
      <div className="mt-8 border-t border-gray-200 pt-6">
        <button type="button" disabled={busy} onClick={() => onStartReschedule(booking)}
          className="w-full rounded-xl bg-[#40CFD5] px-5 py-3 font-bold hover:bg-[#38bbc1] focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40">
          Időpont módosítása
        </button>
      </div>
      <div className="mt-8 border-t border-gray-200 pt-6">
        {confirmDelete ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-900">Biztosan törlöd ezt a foglalást?</p>
            <p className="mt-2 text-sm text-red-800">Csak ez az időpont törlődik, és újra foglalhatóvá válik. A többi időpont változatlan marad. Ez nem vonható vissza.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={deleting} onClick={deleteBooking}
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Törlés…" : "Igen, törlöm"}
              </button>
              <button type="button" disabled={deleting} onClick={() => { setConfirmDelete(false); setError(""); }}
                className="rounded-xl bg-white px-4 py-3 text-sm font-bold disabled:opacity-50">Mégse</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="w-full rounded-xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 focus-visible:ring-4 focus-visible:ring-red-300">
            Foglalás törlése
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
      <h3 className="mt-8 border-t border-gray-200 pt-6 text-lg font-extrabold">Ügyfél adatai</h3>
      <dl className="mt-5 space-y-5 break-words text-sm">
        <div><dt className="text-gray-500">Név</dt><dd className="mt-1 font-bold">{customer.name}</dd></div>
        {customer.language === "en" && (
          <div><dt className="text-gray-500">Nyelv</dt><dd className="mt-1 font-bold text-amber-700">Angol — az angol oldalról foglalt, angolul válaszolj</dd></div>
        )}
        <div><dt className="text-gray-500">Telefonszám</dt><dd className="mt-1">
          <a href={`tel:${customer.phone.replace(/[\s()-]/g, "")}`} className="font-bold text-[#087c81] underline">{customer.phone}</a>
        </dd></div>
        <div><dt className="text-gray-500">E-mail-cím</dt><dd className="mt-1">
          <a href={`mailto:${customer.email}`} className="font-bold text-[#087c81] underline">{customer.email}</a>
        </dd></div>
      </dl>
    </aside>
  );
}
