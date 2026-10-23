"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { endHour, formatBookingHour, type AdminSlot, type LessonType } from "@/lib/studio-booking";

const lessonNames: Record<LessonType, string> = { privat: "Privát óra", kiscsoportos: "Kiscsoportos óra", csoportos: "Csoportos óra" };
const currency = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

interface BookingDetailsProps {
  booking: AdminSlot;
  onClose: (restoreFocus?: boolean) => void;
  onDeleted: (id: string) => void;
  onStartReschedule: (booking: AdminSlot) => void;
}

export default function BookingDetails({ booking, onClose, onDeleted, onStartReschedule }: BookingDetailsProps) {
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
      const response = await fetch(`/admin/api/bookings?id=${encodeURIComponent(booking.id)}`, { method: "DELETE" });
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
      <span className={`inline-block rounded-lg px-3 py-2 text-sm font-bold ${
        booking.status === "pending" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-900"
      }`}>{booking.status === "pending" ? "Jóváhagyásra vár" : "Foglalás alatt"}</span>
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
