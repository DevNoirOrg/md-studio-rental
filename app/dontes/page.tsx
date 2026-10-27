"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Clock3, MapPin, Wallet } from "lucide-react";
import { withBase } from "@/lib/base-path";
import { endHour, formatBookingHour, type LessonType } from "@/lib/studio-booking";

type DecisionAction = "approve" | "reject" | "approve-all";
interface DecisionInput { token: string | null; action: string | null; slot: string | null }

interface RequestSlot {
  id: string;
  room: string;
  roomLabel: string;
  date: string;
  hour: number;
  durationMinutes: number;
  price: number;
  status: "pending" | "approved" | "rejected" | string;
}
interface RequestDetails {
  lessonType: LessonType;
  customer: { name: string; email: string; phone: string };
  slots: RequestSlot[];
}

const labels: Record<DecisionAction, string> = {
  approve: "Időpont jóváhagyása",
  reject: "Időpont elutasítása",
  "approve-all": "Összes függő időpont jóváhagyása",
};
const lessonNames: Record<string, string> = { privat: "Privát óra", kiscsoportos: "Kiscsoportos óra", csoportos: "Csoportos óra" };
const statusBadge: Record<string, { text: string; cls: string }> = {
  pending: { text: "Jóváhagyásra vár", cls: "bg-amber-100 text-amber-900" },
  approved: { text: "Jóváhagyva", cls: "bg-blue-100 text-blue-900" },
  rejected: { text: "Elutasítva", cls: "bg-red-100 text-red-800" },
};
const currency = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" });

const isAction = (value: string | null): value is DecisionAction => value !== null && value in labels;

export default function BookingDecisionPage() {
  return (
    <Suspense fallback={null}>
      <BookingDecision />
    </Suspense>
  );
}

function SlotCard({ slot, highlight }: { slot: RequestSlot; highlight: boolean }) {
  const badge = statusBadge[slot.status] ?? { text: slot.status, cls: "bg-gray-100 text-gray-700" };
  return (
    <li className={`rounded-2xl border-2 p-4 text-left ${highlight ? "border-[#40CFD5] bg-[#40CFD5]/10" : "border-gray-100 bg-gray-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-extrabold text-black">
          <MapPin size={16} className="shrink-0 text-[#087c81]" aria-hidden="true" /> {slot.roomLabel}
        </p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>{badge.text}</span>
      </div>
      <div className="mt-2 grid gap-1 text-sm text-gray-700">
        <p className="flex items-center gap-2">
          <CalendarDays size={15} className="shrink-0 text-gray-400" aria-hidden="true" />
          {longDate.format(new Date(`${slot.date}T12:00:00Z`))}
        </p>
        <p className="flex items-center gap-2">
          <Clock3 size={15} className="shrink-0 text-gray-400" aria-hidden="true" />
          <strong className="text-black">{formatBookingHour(slot.hour)}–{formatBookingHour(endHour(slot))}</strong>
          <span className="text-gray-500">({slot.durationMinutes} perc)</span>
        </p>
        <p className="flex items-center gap-2">
          <Wallet size={15} className="shrink-0 text-gray-400" aria-hidden="true" /> {currency.format(slot.price)}
        </p>
      </div>
    </li>
  );
}

function BookingDecision() {
  const params = useSearchParams();
  const input = useMemo<DecisionInput>(() => ({
    token: params.get("token"), action: params.get("action"), slot: params.get("slot"),
  }), [params]);
  const [details, setDetails] = useState<RequestDetails | null>(null);
  const [loadError, setLoadError] = useState("");
  // az érintett időpontok az oldal megnyitásakori állapot szerint (döntés után se tűnjenek el)
  const [targetIds, setTargetIds] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const sendingRef = useRef(false);

  const label = isAction(input.action) ? labels[input.action] : null;

  // Melyik igényről / időpontról van szó: betöltjük a tokenhez tartozó időpontokat.
  const load = useCallback(async () => {
    if (!input.token) return;
    try {
      const response = await fetch(withBase(`/api/studio-bookings/decision?token=${encodeURIComponent(input.token)}`), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.slots)) throw new Error(result.error || "A foglalási igény nem tölthető be.");
      const loaded = result as RequestDetails;
      setDetails(loaded);
      setTargetIds((current) => current ?? loaded.slots
        .filter((slot) => (input.action === "approve-all" ? slot.status === "pending" : slot.id === input.slot))
        .map((slot) => slot.id));
      setLoadError("");
    } catch (caught) {
      setLoadError((caught as Error).message);
    }
  }, [input.token, input.action, input.slot]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- betöltés a hivatkozás megnyitásakor
    void load();
  }, [load]);

  // Az érintett időpont(ok): egy időpontnál az adott sáv, „összes”-nél minden függő sáv.
  const targets = details?.slots.filter((slot) => targetIds?.includes(slot.id)) ?? [];
  const others = details?.slots.filter((slot) => !targets.includes(slot)) ?? [];
  const targetMissing = !!details && input.action !== "approve-all" && targets.length === 0;
  const alreadyDecided = !!details && !message && (
    input.action === "approve-all" ? targets.length === 0 : targets.length > 0 && targets.every((slot) => slot.status !== "pending"));

  const submit = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const response = await fetch(withBase("/api/studio-bookings/decision"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || !Number.isInteger(result.changed)) {
        setError(result.error || "Nem sikerült menteni a döntést.");
        return;
      }
      setMessage(result.changed === 0
        ? "Az időpontokról már született döntés. Nem történt új módosítás."
        : input.action === "reject"
          ? "Az időpontot elutasítottad, ismét szabad a naptárban."
          : `${result.changed} időpont jóváhagyva. A naptárban „Foglalás alatt” állapotban jelenik meg.`);
      // a frissített állapotok megjelenítése (a kártyák jelvényei)
      await load();
    } catch (caught) {
      console.error("Booking decision request failed.", { name: (caught as Error).name });
      setError("A mentés eredménye nem ellenőrizhető. Próbáld újra; a már lezárt időpontok változatlanok maradnak.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const valid = !!label && !!input.token;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f7] p-5">
      <section className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl sm:p-8">
        <p className="mb-2 text-center text-sm font-bold text-[#087c81]">MD Dance School · Stúdió bérlés</p>
        <h1 className="section-title text-center text-3xl">{label || "Foglalási döntés"}</h1>

        {!valid ? (
          <p role="alert" className="mt-6 text-center text-red-700">Hiányzó vagy érvénytelen hivatkozás.</p>
        ) : loadError ? (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-center text-sm text-red-800">
            {loadError} <button type="button" onClick={() => void load()} className="underline">Újrapróbálás</button>
          </p>
        ) : !details ? (
          <p role="status" className="mt-6 text-center text-sm text-gray-500">Az igény adatainak betöltése…</p>
        ) : (
          <>
            <dl className="mt-6 grid gap-x-4 gap-y-2 rounded-2xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">Ügyfél</dt><dd className="font-bold">{details.customer.name}</dd></div>
              <div><dt className="text-gray-500">Óratípus</dt><dd className="font-bold">{lessonNames[details.lessonType] ?? details.lessonType}</dd></div>
              <div><dt className="text-gray-500">Telefon</dt><dd className="font-bold">{details.customer.phone}</dd></div>
              <div className="min-w-0"><dt className="text-gray-500">E-mail</dt><dd className="truncate font-bold">{details.customer.email}</dd></div>
            </dl>

            <h2 className="mt-6 text-sm font-extrabold uppercase tracking-widest text-[#087c81]">
              {input.action === "approve-all" ? "Ezeket az időpontokat hagyod jóvá" : input.action === "reject" ? "Ezt az időpontot utasítod el" : "Ezt az időpontot hagyod jóvá"}
            </h2>
            {targetMissing ? (
              <p role="alert" className="mt-3 text-sm text-red-700">Ez az időpont már nem található (lehet, hogy közben törölték).</p>
            ) : targets.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">Ennél az igénynél már nincs jóváhagyásra váró időpont.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {targets.map((slot) => <SlotCard key={slot.id} slot={slot} highlight />)}
              </ul>
            )}

            {message ? (
              <p role="status" className="mt-6 rounded-xl bg-blue-50 p-4 text-center font-semibold text-blue-900">{message}</p>
            ) : alreadyDecided ? (
              <p role="status" className="mt-6 rounded-xl bg-gray-100 p-4 text-center text-sm font-semibold text-gray-700">
                Erről már született döntés — nincs teendő.
              </p>
            ) : !targetMissing && (
              <>
                <p className="mt-6 text-center text-sm text-gray-600">
                  Erősítsd meg a döntést. Csak a még jóváhagyásra váró időpontok változnak.
                </p>
                {error && <p role="alert" className="mt-3 text-center text-sm text-red-700">{error}</p>}
                <button type="button" disabled={sending} onClick={submit}
                  className={`mt-4 w-full rounded-xl p-3.5 font-bold disabled:opacity-50 ${
                    input.action === "reject" ? "bg-red-600 text-white hover:bg-red-700" : "bg-[#40CFD5] text-black hover:bg-black hover:text-white"
                  }`}>
                  {sending ? "Mentés…" : `${label} megerősítése`}
                </button>
              </>
            )}

            {others.length > 0 && (
              <details className="mt-6 text-sm">
                <summary className="cursor-pointer font-bold text-gray-600">Az igény további időpontjai ({others.length})</summary>
                <ul className="mt-3 space-y-2">
                  {others.map((slot) => <SlotCard key={slot.id} slot={slot} highlight={false} />)}
                </ul>
              </details>
            )}
          </>
        )}
        <div className="mt-6 text-center">
          <Link href="/" className="font-bold text-[#087c81]">Vissza a naptárhoz</Link>
        </div>
      </section>
    </main>
  );
}
