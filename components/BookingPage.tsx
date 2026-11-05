"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  X,
  UserRound,
  UsersRound,
  UserRoundGroup,
  MousePointerClick,
  Plus,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import BookingTimeline, { timelineRange } from "@/components/BookingTimeline";
import HalftoneDots from "@/components/HalftoneDots";
import RoomShowcase from "@/components/RoomShowcase";
import ConsentChecks, { emptyConsents } from "@/components/ConsentChecks";
import {
  validateBookingTime, rooms, emailPattern, bookingPrice, endHour, overlaps, formatBookingHour,
  type LessonType, type Room, type Slot, type StoredSlot,
} from "@/lib/studio-booking";
import { openingFor, roomAllows, roomLabel, weeklyRange, type RoomsConfig } from "@/lib/room-config";
import { useRoomsConfig } from "@/components/RoomsConfigContext";
import { withBase } from "@/lib/base-path";
import { useLocale } from "@/components/LocaleContext";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { PageContent } from "@/lib/page-content";

type CalendarView = "day" | "week" | "month";
interface RoomRequest { room: Room; id: number; scroll?: boolean }

const lessonIcons: Record<LessonType, typeof UserRound> = {
  privat: UserRound,
  kiscsoportos: UsersRound,
  csoportos: UserRoundGroup,
};
// Az óratípus-kártyák szövege az adminban szerkeszthető (admin → Szövegek).
const lessonTypes = (content: PageContent) =>
  (["privat", "kiscsoportos", "csoportos"] as const).map((id) => ({ id, ...content.lessons[id], Icon: lessonIcons[id] }));

const viewIds: CalendarView[] = ["day", "week", "month"];

/** Pénz- és dátumformázók az oldal nyelvén (angolul brit formátum, az ár forintban marad). */
function formatters(locale: Locale) {
  const tag = intlLocale(locale);
  return {
    currency: new Intl.NumberFormat(tag, { style: "currency", currency: "HUF", maximumFractionDigits: 0 }),
    date: new Intl.DateTimeFormat(tag, { year: "numeric", month: "long", day: "numeric" }),
    tag,
  };
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

// Helyi dátumkulcs: az UTC-re alakítás nem tolhatja el a foglalás napját.
function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date) {
  const weekday = date.getDay();
  return addDays(startOfDay(date), weekday === 0 ? -6 : 1 - weekday);
}

function isPastSlot(date: Date, hour: number, now = new Date()) {
  const slotStart = new Date(date);
  slotStart.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return slotStart <= now;
}

// A havi összesítésből a foglalt, elmúlt, zárt és jóváhagyásra váró sávok is kimaradnak.
// (Egyórás kezdési lehetőségek félóránként, a terem aznapi nyitvatartásán belül.)
function getAvailableHourCount(config: RoomsConfig, room: string, date: Date, now: Date, bookedSlots: StoredSlot[]) {
  const opening = openingFor(config, room, dateKey(date));
  if (!opening) return 0;
  const starts = Array.from({ length: Math.max(0, (opening.close - opening.open - 1) * 2 + 1) }, (_, index) => opening.open + index / 2);
  return starts.filter(
    (hour) =>
      !isPastSlot(date, hour, now) &&
      !bookedSlots.some(
        (slot) =>
          overlaps(slot, { room, date: dateKey(date), hour, durationMinutes: 60 }),
      ),
  ).length;
}

// Hétfővel induló, hathetes rács, a szomszédos hónapok napjaival kiegészítve.
function getMonthDays(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = addDays(firstDay, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

// A naptár görgetési célja: az aktuális félóra, nyitvatartáson kívül a nyitás.
function nowScrollHour(now: Date, range: { start: number; end: number }) {
  const hour = now.getHours() + Math.floor(now.getMinutes() / 30) / 2;
  return hour >= range.start && hour < range.end ? hour : range.start;
}

function formatHour(hour: number) {
  return formatBookingHour(hour);
}

// A többi űrlappal (jelentkezés, tánctábor) egyező beviteli mező stílus
const dialogInput =
  "w-full rounded-2xl border-2 border-transparent bg-gray-50 px-5 py-4 font-semibold text-black placeholder:font-medium placeholder:text-gray-300 transition-colors focus:border-[#40CFD5]/60 focus:outline-none disabled:opacity-60";

function BookingDialog({ onClose, slots, lessonType }: { onClose: (submitted: boolean) => void; slots: Slot[]; lessonType: LessonType }) {
  const config = useRoomsConfig();
  const { locale, d } = useLocale();
  const t = d.dialog;
  const fmt = formatters(locale);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const sendingRef = useRef(false);
  const [consents, setConsents] = useState(emptyConsents);
  const [consentTried, setConsentTried] = useState(false);
  const totalPrice = slots.reduce((total, slot) => total + bookingPrice(slot, lessonType, config), 0);
  const sortedSlots = [...slots].sort((a, b) =>
    a.date.localeCompare(b.date) || a.hour - b.hour || a.room.localeCompare(b.room),
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingRef.current || submitted) return;
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    const emailInput = form.elements.namedItem("email") as HTMLInputElement;
    const phoneInput = form.elements.namedItem("phone") as HTMLInputElement;
    // A formázó jelek megengedettek, az ellenőrzéshez csak az országkód és a szám marad.
    const normalizedPhone = phoneInput.value.replace(/[\s()-]/g, "");

    nameInput.setCustomValidity(
      nameInput.value.trim() ? "" : t.errName,
    );
    // A böngésző e-mail-ellenőrzését a mező domainvégződést előíró mintája egészíti ki.
    emailInput.setCustomValidity(
      emailInput.validity.valueMissing
        ? t.errEmailMissing
        : emailInput.validity.typeMismatch || emailInput.validity.patternMismatch
          ? t.errEmailInvalid
          : "",
    );
    phoneInput.setCustomValidity(
      /^\+[1-9]\d{6,14}$/.test(normalizedPhone) &&
        /^[+\d\s()-]+$/.test(phoneInput.value)
        ? ""
        : t.errPhone,
    );

    if (!form.reportValidity()) return;
    setConsentTried(true);
    if (!consents.tajekoztato || !consents.adatkezeles) {
      document.getElementById("booking-tajekoztato-row")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSubmitError("");
    try {
      const response = await fetch(withBase("/api/studio-bookings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: locale,
          lessonType,
          slots,
          customer: {
            name: nameInput.value.trim(),
            email: emailInput.value,
            phone: phoneInput.value,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        setSubmitError(result.error || t.errSend);
        return;
      }
      // Csak a Resend által elfogadott e-mail után jelenik meg a sikerüzenet.
      setSubmitted(true);
    } catch (caught) {
      console.error("Booking submission failed.", { name: (caught as Error).name });
      setSubmitError(t.errUnknown);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sendingRef.current) onClose(submitted);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitted]);

  // Portál a <body>-ba, hogy a fix menüsor se lógjon a párbeszédablak fölé.
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sendingRef.current) onClose(submitted);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-dialog-title"
        aria-describedby="booking-dialog-description"
        className={`relative my-auto w-full rounded-[2rem] bg-white p-6 shadow-2xl sm:p-9 ${submitted ? "max-w-lg" : "max-w-4xl"}`}
      >
        <button
          type="button"
          disabled={sending}
          onClick={() => onClose(submitted)}
          aria-label={t.closeAria}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-black"
        >
          <X size={22} />
        </button>

        {submitted ? (
          <div className="py-5 text-center">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#40CFD5] text-black">
              <Check size={30} />
            </span>
            <h2
              id="booking-dialog-title"
              className="section-title text-3xl text-black sm:text-4xl"
            >
              {t.thanks}
            </h2>
            <p
              id="booking-dialog-description"
              className="mt-3 text-sm leading-relaxed text-gray-600"
            >
              {t.sent}
            </p>
            <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-relaxed text-amber-900">
              {t.validOnly}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              {t.savedPending}
            </p>
            <button
              type="button"
              onClick={() => onClose(submitted)}
              className="mt-6 w-full rounded-2xl bg-black px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#40CFD5] hover:text-black"
            >
              {t.close}
            </button>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_300px] md:gap-10">
          <div className="order-2 md:order-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#087c81]">
              {t.kicker}
            </p>
            <h2
              id="booking-dialog-title"
              className="section-title pr-8 text-3xl text-black sm:text-4xl"
            >
              {t.title}
            </h2>
            <p
              id="booking-dialog-description"
              className="mb-6 mt-2 text-sm leading-relaxed text-gray-600"
            >
              {t.lead}
            </p>

            <form onSubmit={handleSubmit} noValidate aria-busy={sending} className="space-y-5">
              <div>
                <label htmlFor="booking-name" className="mb-2.5 ml-3 block text-[11px] font-extrabold uppercase tracking-widest text-gray-400">
                  {t.name}
                </label>
                <input
                  id="booking-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  disabled={sending}
                  maxLength={200}
                  autoFocus
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  className={dialogInput}
                />
              </div>
              <div>
                <label htmlFor="booking-email" className="mb-2.5 ml-3 block text-[11px] font-extrabold uppercase tracking-widest text-gray-400">
                  {t.email}
                </label>
                <input
                  id="booking-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  pattern={emailPattern}
                  required
                  disabled={sending}
                  maxLength={254}
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  className={dialogInput}
                />
              </div>
              <div>
                <label htmlFor="booking-phone" className="mb-2.5 ml-3 block text-[11px] font-extrabold uppercase tracking-widest text-gray-400">
                  {t.phone}
                </label>
                <input
                  id="booking-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+36 30 123 4567"
                  aria-describedby="booking-phone-hint"
                  required
                  disabled={sending}
                  maxLength={40}
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  className={dialogInput}
                />
                <p id="booking-phone-hint" className="ml-3 mt-2 text-xs text-gray-500">
                  {t.phoneHint}
                </p>
              </div>
              <ConsentChecks
                idPrefix="booking"
                values={consents}
                showErrors={consentTried}
                onChange={(k, v) => setConsents((p) => ({ ...p, [k]: v }))}
              />
              {submitError && (
                <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {submitError}
                </p>
              )}
              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-2xl bg-black px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white shadow-xl transition-colors hover:bg-[#40CFD5] hover:text-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40 disabled:cursor-wait disabled:opacity-60"
              >
                {sending ? t.sending : t.submit}
              </button>
              <p className="text-center text-xs text-gray-500">
                {t.forwardNote}
              </p>
            </form>
          </div>

          {/* Jobb oldalt: a kiválasztott időpontok és termek összesítője */}
          <aside
            aria-label={t.summaryAria}
            className="order-1 flex flex-col rounded-3xl bg-[#40CFD5]/10 p-5 ring-1 ring-[#40CFD5]/40 mt-8 md:order-2 md:mt-10 md:self-start"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#087c81]">
              {t.summary(slots.length)}
            </p>
            <ul className="mt-3 max-h-[min(340px,40vh)] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {sortedSlots.map((slot) => (
                <li
                  key={`${slot.room}-${slot.date}-${slot.hour}`}
                  className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                >
                  <p className="text-sm font-extrabold text-black">{roomLabel(config, slot.room)}</p>
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <span className="text-xs font-semibold text-gray-600">
                      {fmt.date.format(new Date(`${slot.date}T00:00:00`))}
                      <br />
                      {formatHour(slot.hour)}–{formatHour(endHour(slot))}
                    </span>
                    <span className="shrink-0 text-sm font-extrabold text-[#087c81]">
                      {fmt.currency.format(bookingPrice(slot, lessonType, config))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#40CFD5]/40 pt-4">
              <span className="text-sm font-bold text-black">{t.total}</span>
              <span className="text-xl font-extrabold text-[#087c81]">{fmt.currency.format(totalPrice)}</span>
            </div>
          </aside>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function getCalendarTitle(view: CalendarView, date: Date, locale: Locale) {
  const { tag, date: dateFormat } = formatters(locale);
  if (view === "day") {
    return new Intl.DateTimeFormat(tag, {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(date);
  }

  if (view === "week") {
    const weekStart = getWeekStart(date);
    const weekEnd = addDays(weekStart, 6);
    return `${dateFormat.format(weekStart)} – ${dateFormat.format(weekEnd)}`;
  }

  return new Intl.DateTimeFormat(tag, {
    year: "numeric",
    month: "long",
  }).format(date);
}

function StudioCalendar({ lessonType, initialRoom, roomRequest }: { lessonType: LessonType; initialRoom: Room | null; roomRequest: RoomRequest | null }) {
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfDay(new Date()),
  );
  const config = useRoomsConfig();
  const { locale, d } = useLocale();
  const t = d.calendar;
  const fmt = formatters(locale);
  // Csak azok a termek, ahol a választott óratípus foglalható (adminban állítható).
  const availableRooms: readonly Room[] = rooms.filter((room) => roomAllows(config, room, lessonType));
  const [activeRoom, setActiveRoom] = useState<Room>(
    initialRoom && availableRooms.includes(initialRoom) ? initialRoom : availableRooms[0],
  );
  const roomRange = (room: Room) => weeklyRange(config[room]);
  const calendarRef = useRef<HTMLElement>(null);
  const [scrollRequest, setScrollRequest] = useState<{ hour: number; at: number } | null>(() => ({ hour: nowScrollHour(new Date(), roomRange(activeRoom)), at: 0 }));
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([]);
  const [drawerExpanded, setDrawerExpanded] = useState(true);
  const hasSelectedSlots = selectedSlots.length > 0;
  const hasMultipleSlots = selectedSlots.length > 1;
  const [storedSlots, setStoredSlots] = useState<StoredSlot[]>([]);
  const [availabilityError, setAvailabilityError] = useState("");
  const [loadedRange, setLoadedRange] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const rangeDays = getMonthDays(selectedDate);
  const rangeFrom = dateKey(rangeDays[0]);
  const rangeTo = dateKey(rangeDays[41]);
  const rangeKey = `${rangeFrom}/${rangeTo}`;
  const availabilityReady = loadedRange === rangeKey && !availabilityError;
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingSlots, setBookingSlots] = useState<Slot[]>([]);
  // „Ma” gomb: animált váltás + a mai nap rövid felvillanása
  const [todayFlash, setTodayFlash] = useState(0);
  const [slideDir, setSlideDir] = useState(0);
  // Időpont beírása számokkal (dátum + kezdés + vége) az aktív teremre
  const [manualDate, setManualDate] = useState(() => dateKey(new Date()));
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualError, setManualError] = useState("");
  // Az alsó, fix összesítő magasságával megegyező térköz az oldal alján,
  // hogy teljesen legörgetve se takarja el a láblécet.
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerOpen = selectedSlots.length > 0;
  useEffect(() => {
    const el = drawerRef.current;
    if (!drawerOpen || !el) return;
    const apply = () => { document.body.style.paddingBottom = `${el.offsetHeight}px`; };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [drawerOpen]);

  // A naptárhoz görgetünk, az aktuális időpont környékére (a képernyő közepére igazítva).
  const requestScrollToNow = () => {
    setScrollRequest({ hour: nowScrollHour(new Date(), roomRange(activeRoom)), at: Date.now() });
  };
  // Óratípus választásakor (a naptár megjelenésekor) a kezdeti scrollRequest már az aktuális időre mutat.
  // A terem-modal „Foglalás” gombja: a megfelelő fül kiválasztása + odagörgetés (render közbeni állapotigazítás).
  const [handledRoomRequest, setHandledRoomRequest] = useState<number | null>(null);
  if (roomRequest && roomRequest.id !== handledRoomRequest) {
    setHandledRoomRequest(roomRequest.id);
    if (availableRooms.includes(roomRequest.room)) setActiveRoom(roomRequest.room);
    if (roomRequest.scroll !== false) {
      setScrollRequest({ hour: nowScrollHour(new Date(roomRequest.id), roomRange(roomRequest.room)), at: roomRequest.id });
    }
  }

  useEffect(() => {
    if (!scrollRequest) return;
    const frame = window.requestAnimationFrame(() => {
      const calendar = calendarRef.current;
      const target = calendar?.querySelector<HTMLElement>(
        `[data-booking-hour="${scrollRequest.hour}"]`,
      ) || calendar;
      target?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "center",
        inline: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollRequest]);

  // A szerver a közös adatbázisból adja vissza az állapotokat; fókuszkor is frissítünk.
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(withBase(`/api/studio-bookings?from=${rangeFrom}&to=${rangeTo}&lang=${locale}`), {
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.slots)) {
          throw new Error(result.error || t.availabilityFailed);
        }
        if (!active) return;
        const loaded = result.slots as StoredSlot[];
        setStoredSlots((current) => [
          ...current.filter((slot) => slot.date < rangeFrom || slot.date > rangeTo),
          ...loaded,
        ]);
        setSelectedSlots((current) => current.filter((slot) =>
          !loaded.some((saved) => overlaps(slot, saved)),
        ));
        setAvailabilityError("");
        setLoadedRange(rangeKey);
      } catch (caught) {
        if (!active) return;
        const error = caught as Error;
        console.error("Calendar availability refresh failed.", { name: error.name });
        setAvailabilityError(error.message || t.availabilityFailed);
      } finally {
        inFlight = false;
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [rangeFrom, rangeTo, rangeKey, refreshVersion, locale, t.availabilityFailed]);

  // Több kijelölésnél alapból csukott; további sávoknál megőrzi a kézi nyitást.
  const drawerKey = `${hasMultipleSlots}/${hasSelectedSlots}`;
  const [drawerKeySeen, setDrawerKeySeen] = useState(drawerKey);
  if (drawerKey !== drawerKeySeen) {
    setDrawerKeySeen(drawerKey);
    setDrawerExpanded(!hasMultipleSlots);
  }

  useEffect(() => {
    // Félpercenként frissítjük az időt, és töröljük a közben lejárt kijelöléseket.
    const timer = window.setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      setSelectedSlots((current) =>
        current.filter(
          (slot) =>
            !isPastSlot(new Date(`${slot.date}T00:00:00`), slot.hour, now),
        ),
      );
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  // Az előző/következő gomb az aktív nézet szerint napot, hetet vagy hónapot léptet.
  const navigateDate = (direction: number) => {
    setSlideDir(direction);
    setSelectedDate((current) => {
      if (view === "month") {
        return new Date(
          current.getFullYear(),
          current.getMonth() + direction,
          1,
        );
      }
      return addDays(current, direction * (view === "week" ? 7 : 1));
    });
  };

  // Tiltott sávot nem választunk ki; ugyanarra kattintva megszüntetjük a kijelölést.
  const selectSlot = (slot: Slot) => {
    const slotDate = new Date(`${slot.date}T00:00:00`);
    if (
      !availabilityReady ||
      isPastSlot(slotDate, slot.hour) ||
      storedSlots.some((saved) => overlaps(slot, saved))
    ) {
      return;
    }

    setSelectedSlots((current) => {
      const alreadySelected = current.some(
        (selected) =>
          selected.room === slot.room &&
          selected.date === slot.date &&
          selected.hour === slot.hour,
      );
      if (alreadySelected) {
        return current.filter(
          (selected) =>
            selected.room !== slot.room ||
            selected.date !== slot.date ||
            selected.hour !== slot.hour,
        );
      }
      if (current.some((selected) => overlaps(slot, selected))) return current;
      return [...current, slot];
    });
  };
  const resizeSlot = (original: Slot, next: Slot) => {
    if (!availabilityReady || isPastSlot(new Date(`${next.date}T00:00:00`), next.hour) ||
        storedSlots.some((saved) => overlaps(next, saved))) return;
    setSelectedSlots((current) => {
      const sameStart = (slot: Slot) => slot.room === original.room &&
        slot.date === original.date && slot.hour === original.hour;
      if (current.some((slot) => !sameStart(slot) && overlaps(slot, next))) return current;
      return current.map((slot) => sameStart(slot) ? next : slot);
    });
  };
  const removeSlot = (slotToRemove: Slot) => {
    setSelectedSlots((current) =>
      current.filter(
        (slot) =>
          slot.room !== slotToRemove.room ||
          slot.date !== slotToRemove.date ||
          slot.hour !== slotToRemove.hour,
      ),
    );
  };
  // Sikeres űrlap után, az ablak bezárásakor kerülnek az időpontok függő állapotba.
  const closeBookingDialog = (submitted: boolean) => {
    if (submitted) {
      setSelectedSlots([]);
    }
    setBookingDialogOpen(false);
    setRefreshVersion((current) => current + 1);
  };
  // „13:00–20:00” típusú beírás → kijelölés az aktív teremben
  const parseTime = (value: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (min !== 0 && min !== 30) return NaN;
    return h + min / 60;
  };
  const addManualSlot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError("");
    const start = parseTime(manualStart);
    const end = parseTime(manualEnd);
    if (!manualDate || start === null || end === null) {
      setManualError(t.manualMissing);
      return;
    }
    if (Number.isNaN(start) || Number.isNaN(end)) {
      setManualError(t.manualHalfHours);
      return;
    }
    const durationMinutes = Math.round((end - start) * 60);
    if (durationMinutes < 60) {
      setManualError(t.manualMinimum);
      return;
    }
    const slot = { room: activeRoom, date: manualDate, hour: start, durationMinutes };
    const timeError = validateBookingTime(slot, new Date(), config, locale);
    if (timeError) {
      setManualError(timeError);
      return;
    }
    if (!availabilityReady) {
      setManualError(t.manualLoading);
      return;
    }
    if (storedSlots.some((saved) => overlaps(slot, saved))) {
      setManualError(t.manualTaken);
      return;
    }
    if (selectedSlots.some((sel) => overlaps(slot, sel))) {
      setManualError(t.manualOverlap);
      return;
    }
    setSelectedSlots((current) => [...current, slot]);
    setSelectedDate(startOfDay(new Date(`${manualDate}T00:00:00`)));
    setScrollRequest({ hour: start, at: Date.now() });
    setManualStart("");
    setManualEnd("");
  };

  const visibleWeekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(getWeekStart(selectedDate), index),
  );
  const monthDays = getMonthDays(selectedDate);
  // Félóránként időarányosan számoljuk a terem óradíját.
  const totalPrice = selectedSlots.reduce(
    (total, slot) => total + bookingPrice(slot, lessonType, config),
    0,
  );
  // A rács a terem heti nyitvatartásához igazodik (a hét minden napján azonos sorok).
  const range = timelineRange(config, activeRoom);
  const hourly = config[activeRoom]?.prices[lessonType];

  return (
    <>
    <motion.section
      ref={calendarRef}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className={`mt-12 scroll-mt-28 rounded-3xl bg-white p-4 shadow-[0_10px_36px_rgba(0,0,0,0.09)] sm:p-7 ${
        selectedSlots.length ? "mb-52" : ""
      }`}
      aria-label={t.aria}
    >
      {availabilityError ? (
        <div role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {availabilityError} {t.availabilityBlocked}
          <button type="button" onClick={() => setRefreshVersion((current) => current + 1)}
            className="ml-2 underline">{t.retry}</button>
        </div>
      ) : !availabilityReady && (
        <p role="status" className="mb-5 text-sm text-gray-600">{t.loading}</p>
      )}
      <div className="mb-5 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.25em] text-[#087c81]">{t.step2}</p>
          <h2 className="section-title mt-3 text-3xl text-black sm:text-4xl">
            {t.title}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t.lead}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-gray-100 p-1" aria-label={t.viewAria}>
            {viewIds.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                  view === id
                    ? "bg-black text-white"
                    : "text-gray-600 hover:text-black"
                }`}
              >
                {t.views[id]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const today = startOfDay(new Date());
              setSlideDir(today < selectedDate ? -1 : today > selectedDate ? 1 : 0);
              setSelectedDate(today);
              setTodayFlash(Date.now());
              requestScrollToNow();
            }}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-black transition-colors hover:border-[#40CFD5]"
          >
            {t.today}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f7f7f7] p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t.prev}
            onClick={() => navigateDate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black shadow-sm transition-colors hover:bg-[#40CFD5]"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label={t.next}
            onClick={() => navigateDate(1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black shadow-sm transition-colors hover:bg-[#40CFD5]"
          >
            <ChevronRight size={20} />
          </button>
          <h3 className="ml-1 text-sm font-extrabold capitalize text-black sm:ml-3 sm:text-base">
            {getCalendarTitle(view, selectedDate, locale)}
          </h3>
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
          <CalendarDays size={18} aria-hidden="true" />
          <span className="sr-only">{t.pickDate}</span>
          <input
            type="date"
            value={dateKey(selectedDate)}
            min={dateKey(new Date())}
            onChange={(event) => {
              if (event.target.value) {
                const next = startOfDay(new Date(`${event.target.value}T00:00:00`));
                setSlideDir(next < selectedDate ? -1 : 1);
                setSelectedDate(next);
              }
            }}
            className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-black"
          />
        </label>
      </div>

      {/* Időpont beírása számokkal — az aktív terem fülére vonatkozik */}
      <form onSubmit={addManualSlot} noValidate
        className="mb-5 rounded-2xl border border-gray-200 p-3 sm:p-4" aria-label={t.manualAria}>
        <div className="flex flex-wrap items-end gap-3">
          <p className="w-full text-xs font-extrabold uppercase tracking-widest text-gray-500 lg:w-auto lg:self-center lg:pr-2">
            {t.manualOr}
          </p>
          <label className="flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-widest text-gray-400">
            {t.manualDate}
            <input type="date" value={manualDate} min={dateKey(new Date())}
              onChange={(e) => setManualDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm font-semibold normal-case tracking-normal text-black" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-widest text-gray-400">
            {t.manualStart}
            <input type="text" inputMode="numeric" placeholder="13:00" value={manualStart} maxLength={5}
              onChange={(e) => setManualStart(e.target.value)}
              className="w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold tracking-normal text-black placeholder:text-gray-300" />
          </label>
          <span className="pb-2 font-bold text-gray-400" aria-hidden="true">–</span>
          <label className="flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-widest text-gray-400">
            {t.manualEnd}
            <input type="text" inputMode="numeric" placeholder="20:00" value={manualEnd} maxLength={5}
              onChange={(e) => setManualEnd(e.target.value)}
              className="w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold tracking-normal text-black placeholder:text-gray-300" />
          </label>
          <button type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-black px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#40CFD5] hover:text-black">
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" /> {t.manualAdd}
          </button>
          <p className="text-xs text-gray-500 lg:ml-auto lg:self-center">
            {t.manualRoom} <strong className="text-black">{roomLabel(config, activeRoom)}</strong>
          </p>
        </div>
        {manualError && (
          <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {manualError}
          </p>
        )}
      </form>

      {/* Teremválasztó fülek (mint korábban) */}
      <div className="mb-5" role="tablist" aria-label={t.roomsAria}>
        {availableRooms.length < rooms.length && (
          <p className="mb-2 text-center text-sm font-semibold text-[#087c81]">
            {availableRooms.length === 1 ? t.onlyRoom : t.onlyRooms}
          </p>
        )}
        <div className="overflow-x-auto rounded-2xl bg-gray-100 p-1.5">
          <div className="flex w-max min-w-full justify-center gap-1.5">
            {availableRooms.map((room) => (
              <button
                key={room}
                type="button"
                role="tab"
                id={`room-tab-${rooms.indexOf(room)}`}
                aria-controls="room-calendar-panel"
                aria-selected={activeRoom === room}
                onClick={() => setActiveRoom(room)}
                className={`min-h-11 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-colors sm:px-5 ${
                  activeRoom === room
                    ? "bg-black text-white shadow-sm"
                    : "text-gray-600 hover:bg-white hover:text-black"
                }`}
              >
                {roomLabel(config, room)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        id="room-calendar-panel"
        role="tabpanel"
        aria-labelledby={`room-tab-${rooms.indexOf(activeRoom)}`}
        className="rounded-2xl border border-gray-200 bg-[#f7f7f7] p-3 sm:p-4"
      >
        {/* Terem neve + kompakt súgó és jelmagyarázat (a korábbi „Heti foglaltság” címke helyén) */}
        <div className="mb-4 flex flex-col gap-x-6 gap-y-2.5 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="shrink-0 text-lg font-extrabold text-black">
            {roomLabel(config, activeRoom)}
            {Number.isFinite(hourly) && (
              <span className="ml-2 whitespace-nowrap text-sm font-bold text-[#087c81]">{fmt.currency.format(hourly)} {d.rooms.perHour}</span>
            )}
          </h3>
          <div className="flex flex-col gap-x-5 gap-y-1.5 text-xs text-gray-600 xl:flex-row xl:items-center">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label={t.usageAria}>

              <li className="flex items-center gap-1.5">

                <MousePointerClick size={14} aria-hidden="true" className="text-[#087c81]" />

                {t.usageClick}

              </li>

              <li className="flex items-center gap-1.5">

                <span className="flex" aria-hidden="true">

                  <ChevronUp size={14} className="text-[#087c81]" />

                  <ChevronDown size={14} className="-ml-1 text-[#087c81]" />

                </span>

                {t.usageArrows}

              </li>

              <li className="flex items-center gap-1.5">

                <Clock3 size={14} aria-hidden="true" className="text-[#087c81]" />

                {t.usageMinimum}

              </li>

            </ul>

            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-semibold" aria-label={t.legendAria}>

              <li className="flex items-center gap-1.5">

                <span className="h-3 w-3 rounded bg-white ring-1 ring-gray-300" />

                {t.free}

              </li>

              <li className="flex items-center gap-1.5">

                <span className="h-3 w-3 rounded bg-gray-300" />

                {t.past}

              </li>

              <li className="flex items-center gap-1.5">

                <span className="md-closed-slot h-3 w-3 rounded ring-1 ring-gray-300" />

                {t.closed}

              </li>

              <li className="flex items-center gap-1.5">

                <span className="h-3 w-3 rounded bg-blue-100 ring-1 ring-blue-400" />

                {t.booked}

              </li>

            </ul>
          </div>
        </div>

      {/* Időszak-váltáskor (lapozás, „Ma”) a naptár becsúszik az új időszakra */}
      <AnimatePresence mode="wait" initial={false} custom={slideDir}>
      <motion.div
        key={`${view}-${getCalendarTitle(view, selectedDate, locale)}`}
        custom={slideDir}
        variants={{
          enter: (d: number) => ({ opacity: 0, x: d * 60 }),
          center: { opacity: 1, x: 0 },
          exit: (d: number) => ({ opacity: 0, x: d * -60 }),
        }}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
      {view === "day" && (
        <div className="mx-auto max-w-xl">
          {/* A nézett nap még egyszer, az idősávok fölött */}
          <div
            key={`day-head-${todayFlash}`}
            className={`flex min-h-[62px] flex-col items-center justify-center px-2 py-2 text-center ${
              dateKey(selectedDate) === dateKey(new Date()) ? "bg-[#40CFD5] text-black" : "bg-black text-white"
            } ${todayFlash && dateKey(selectedDate) === dateKey(new Date()) ? "md-today-flash" : ""}`}
          >
            <span className="text-xs font-bold capitalize">
              {new Intl.DateTimeFormat(fmt.tag, { weekday: "long" }).format(selectedDate)}
            </span>
            <span className="text-lg font-extrabold">
              {fmt.date.format(selectedDate)}
            </span>
          </div>
          <BookingTimeline
            config={config}
            range={range}
            room={activeRoom}
            date={dateKey(selectedDate)}
            selectedSlots={selectedSlots}
            storedSlots={storedSlots}
            availabilityReady={availabilityReady}
            onSelect={selectSlot}
            onResize={resizeSlot}
            onRemove={removeSlot}
            now={currentTime}
          />
        </div>
      )}

      {view === "week" && (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[980px] grid-cols-7">
            {visibleWeekDays.map((date) => (
              <div key={dateKey(date)}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(date);
                    setView("day");
                  }}
                  key={dateKey(date) === dateKey(new Date()) ? `today-${todayFlash}` : undefined}
                  className={`flex min-h-[62px] w-full flex-col items-center justify-center border-r border-white/20 px-2 py-2 text-center transition-colors ${
                    dateKey(date) === dateKey(selectedDate)
                      ? "bg-[#40CFD5] text-black"
                      : "bg-black text-white hover:bg-gray-800"
                  } ${todayFlash && dateKey(date) === dateKey(new Date()) ? "md-today-flash" : ""}`}
                >
                  <span className="text-xs font-bold">
                    {new Intl.DateTimeFormat(fmt.tag, {
                      weekday: "short",
                    }).format(date)}
                  </span>
                  <span className="text-lg font-extrabold">{t.dayNumber(date.getDate())}</span>
                </button>
                <BookingTimeline
                  config={config}
                  range={range}
                  room={activeRoom}
                  date={dateKey(date)}
                  selectedSlots={selectedSlots}
                  storedSlots={storedSlots}
                  availabilityReady={availabilityReady}
                  onSelect={selectSlot}
                  onResize={resizeSlot}
                  onRemove={removeSlot}
                  now={currentTime}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "month" && (
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {t.weekdays.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-extrabold uppercase text-gray-500 sm:text-sm"
            >
              {day}
            </div>
          ))}
          {monthDays.map((date) => {
            const inMonth = date.getMonth() === selectedDate.getMonth();
            const isPastDay = dateKey(date) < dateKey(currentTime);
            // a látogató nem látja, mi vár jóváhagyásra: minden foglalás egyszerűen „foglalt”
            const bookedCount = storedSlots.filter(
              (slot) => slot.room === activeRoom && slot.date === dateKey(date),
            ).length;
            const closed = !openingFor(config, activeRoom, dateKey(date));
            const available = availabilityReady ? getAvailableHourCount(
              config,
              activeRoom,
              date,
              currentTime,
              storedSlots,
            ) : 0;

            return (
              <button
                key={dateKey(date)}
                type="button"
                onClick={() => {
                  setSelectedDate(date);
                  setView("day");
                }}
                aria-label={t.dayAria(fmt.date.format(date), isPastDay ? "past" : closed ? "closed" : available > 0 ? "free" : "full")}
                className={`flex min-h-[72px] flex-col items-center justify-center rounded-xl border text-sm transition-colors sm:min-h-[90px] ${
                  todayFlash && dateKey(date) === dateKey(new Date()) ? "md-today-flash" : ""
                } ${isPastDay && inMonth ? "opacity-60" : ""} ${
                  !inMonth
                    ? "border-transparent bg-gray-50 text-gray-300"
                    : dateKey(date) === dateKey(selectedDate)
                      ? "border-[#40CFD5] bg-[#40CFD5]/15 text-black"
                      : "border-gray-100 bg-white text-black hover:border-[#40CFD5] hover:bg-[#40CFD5]/10"
                }`}
              >
                <span className="font-bold">{date.getDate()}</span>
                {inMonth && !isPastDay && (
                  <>
                    <span className={`mt-1 text-[10px] font-bold sm:text-[11px] ${
                      !availabilityReady ? "text-gray-400" : available > 0 ? "text-[#087c81]" : "text-gray-400"
                    }`}>
                      {closed ? t.closed : !availabilityReady ? "…" : available > 0 ? t.hasFree : t.full}
                    </span>
                    <span className="mt-1 flex gap-1" aria-hidden="true">
                      {available > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#40CFD5]" />
                      )}
                      {bookedCount > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      )}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
      </motion.div>
      </AnimatePresence>
      </div>

      <p className="mt-4 text-center text-xs text-gray-500">
        {t.refreshNote}
      </p>
    </motion.section>
    {/* A fix összesítő portállal a <body>-ba kerül, így semmilyen szekció (pl. a lábléc) nem takarja el. */}
    {selectedSlots.length > 0 && createPortal(
      <div
        ref={drawerRef}
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 bottom-0 z-[60] border-t border-[#40CFD5]/60 bg-white/95 shadow-[0_-8px_30px_rgba(0,0,0,0.14)] backdrop-blur-md"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 sm:pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#087c81]">
                {d.drawer.selected(selectedSlots.length)}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {d.drawer.notFinal}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-expanded={drawerExpanded}
                aria-controls="selected-booking-slots"
                onClick={() => setDrawerExpanded((current) => !current)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[#087c81] transition-colors hover:bg-[#40CFD5]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#40CFD5]"
              >
                {drawerExpanded ? d.drawer.collapse : d.drawer.expand}
                {drawerExpanded ? (
                  <ChevronDown size={18} aria-hidden="true" />
                ) : (
                  <ChevronUp size={18} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlots([])}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-100 hover:text-black"
              >
                {d.drawer.clear}
              </button>
            </div>
          </div>
          {/* Három 64 px-es sor és két 8 px-es térköz után a lista belül görgethető. */}
          <ul
            id="selected-booking-slots"
            hidden={!drawerExpanded}
            aria-label={d.drawer.listAria}
            tabIndex={0}
            className="max-h-[min(208px,30vh)] space-y-2 overflow-y-auto overscroll-contain rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#40CFD5]"
          >
            {selectedSlots.map((slot) => (
              <li
                key={`${slot.room}-${slot.date}-${slot.hour}`}
                className="flex h-16 items-center justify-between gap-3 rounded-xl border border-[#40CFD5]/50 bg-[#40CFD5]/10 px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <p className="min-w-0 text-sm font-extrabold text-black">
                    <span className="block truncate">{roomLabel(config, slot.room)}</span>
                    <span className="block truncate text-xs font-semibold text-gray-700">
                      {fmt.date.format(new Date(`${slot.date}T00:00:00`))} ·{" "}
                      {formatHour(slot.hour)}–{formatHour(endHour(slot))}
                    </span>
                  </p>
                  <span className="shrink-0 text-sm font-extrabold text-[#087c81]">
                    {fmt.currency.format(bookingPrice(slot, lessonType, config))}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeSlot(slot)}
                  aria-label={d.drawer.removeAria(`${roomLabel(config, slot.room)}, ${slot.date}, ${formatHour(slot.hour)}`)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-white hover:text-black"
                >
                  <X size={18} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 py-3">
            <div className="flex items-center gap-3">
              <span className="font-bold text-black">{d.drawer.total}</span>
              <span className="text-lg font-extrabold text-[#087c81]">
                {fmt.currency.format(totalPrice)}
              </span>
            </div>
            <button
              type="button"
              disabled={!availabilityReady}
              onClick={() => {
                // A nyitáskori lista marad az e-mail alapja az időzítő frissítései után is.
                setBookingSlots([...selectedSlots]);
                setBookingDialogOpen(true);
              }}
              className="rounded-xl bg-[#40CFD5] px-5 py-2.5 text-sm font-extrabold text-black transition-colors hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40"
            >
              {d.drawer.book}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
    {bookingDialogOpen && (
      <BookingDialog
        onClose={closeBookingDialog}
        slots={bookingSlots}
        lessonType={lessonType}
      />
    )}
    </>
  );
}

/** content: az adminban szerkeszthető szövegek, már az oldal nyelvén (lib/page-content.ts). */
export default function BookingPage({ content }: { content: PageContent }) {
  const config = useRoomsConfig();
  const { locale, d } = useLocale();
  const types = lessonTypes(content);
  const [selectedType, setSelectedType] = useState<LessonType | null>(null);
  // A terem-modalból kért foglalás: melyik terem füle legyen kiválasztva
  const [pendingRoom, setPendingRoom] = useState<Room | null>(null);
  const [roomRequest, setRoomRequest] = useState<RoomRequest | null>(null);
  const [typeHint, setTypeHint] = useState("");

  const scrollToLessonTypes = () => {
    window.requestAnimationFrame(() =>
      document.getElementById("lesson-type-title")?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  // A terem-modal „Foglalás” gombja: mindig az 1. lépéshez (óratípus) görget, és megjegyzi a termet.
  const bookRoom = (room: Room) => {
    setPendingRoom(room);
    scrollToLessonTypes();
    if (!selectedType) {
      setTypeHint(d.steps.hintPickType(roomLabel(config, room)));
      return;
    }
    if (!roomAllows(config, room, selectedType)) {
      const title = types.find((type) => type.id === selectedType)?.title ?? d.steps.thisType;
      setTypeHint(d.steps.hintNotAllowed(title, roomLabel(config, room)));
      return;
    }
    // Már van óratípus: a naptárban átváltunk a terem fülére (görgetés nélkül).
    setTypeHint(d.steps.hintOpened(roomLabel(config, room)));
    setRoomRequest({ room, id: Date.now(), scroll: false });
  };

  return (
    <main className="min-h-screen bg-[#f7f7f7]">
      <SiteHeader locale={locale} />
      <section
        className="relative z-10 flex min-h-[390px] items-center justify-center bg-black px-5 pb-16 pt-32 text-center sm:min-h-[440px] sm:pt-36"
        style={{
          backgroundImage:
            "linear-gradient(0deg, rgba(0,0,0,0.76), rgba(0,0,0,0.48)), url('" + withBase("/brand/hero-crowd.jpg") + "')",
          backgroundPosition: "center 42%",
          backgroundSize: "cover",
          overflowX: "clip",
        }}
      >
        {/* Animált halftone-pöttyök, mint a többi oldal fejlécében */}
        <HalftoneDots size={240} zIndex={1} style={{ bottom: -80, left: -90 }} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#f7f7f7] to-transparent"
        />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65 }}
          className="relative z-10 max-w-4xl"
        >
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-[#40CFD5] sm:text-sm">
            {d.hero.kicker}
          </p>
          <h1 className="section-title text-5xl text-white sm:text-7xl md:text-8xl">
            {d.hero.title}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
            {d.hero.lead}
          </p>
        </motion.div>
      </section>

      <section className="relative px-4 pb-20 pt-6 sm:px-6 sm:pb-28" style={{ overflowX: "clip" }}>
        {/* Ugyanaz az animált halftone-minta, mint a többi oldalon */}
        <HalftoneDots className="hidden md:block" size={240} zIndex={0} style={{ top: "44%", right: -120 }} />

        <div className="relative z-10 mx-auto max-w-7xl">
          {/* 4 terem kártyája — kattintásra részletes modal */}
          <RoomShowcase onBook={bookRoom} lessonType={selectedType} />

          {/* Innen indul a foglalás */}
          <div className="mb-10 flex items-center gap-4 sm:mb-12">
            <div className="h-[2px] flex-1 bg-black/10" />
            <p className="flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.25em] text-white sm:text-sm">
              <CalendarDays size={16} aria-hidden="true" className="text-[#40CFD5]" />
              {d.steps.start}
            </p>
            <div className="h-[2px] flex-1 bg-black/10" />
          </div>

          <div className="mb-8 text-center sm:mb-10">
            <p className="text-sm font-extrabold uppercase tracking-[0.25em] text-[#087c81]">{d.steps.step1}</p>
            <h2 id="lesson-type-title" className="section-title mt-3 scroll-mt-32 text-4xl text-black sm:text-5xl">
              {content.lessonTitle}
            </h2>
            <p className="mt-3 text-sm text-gray-600 sm:text-base">
              {content.lessonLead}
            </p>
            {typeHint && (
              <p role="status" className="mx-auto mt-4 inline-block rounded-full bg-[#40CFD5]/15 px-4 py-2 text-sm font-semibold text-[#087c81]">
                {typeHint}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
            {types.map(({ id, title, capacity, description, Icon }, index) => {
              const selected = selectedType === id;
              // Ha egyik teremben sem foglalható (adminban kikapcsolták), nem választható.
              const bookable = rooms.some((room) => roomAllows(config, room, id));

              return (
                <motion.button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  disabled={!bookable}
                  onClick={() => {
                    setSelectedType(id);
                    setTypeHint("");
                  }}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: index * 0.1 }}
                  whileHover={bookable ? { y: -5 } : undefined}
                  whileTap={bookable ? { scale: 0.99 } : undefined}
                  className={`relative flex min-h-[220px] flex-col items-center rounded-3xl border-2 px-6 py-7 text-center shadow-[0_8px_28px_rgba(0,0,0,0.07)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? "border-[#40CFD5] bg-[#40CFD5]/10"
                      : "border-white bg-white hover:border-[#40CFD5]"
                  }`}
                >
                  <span
                    className={`mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ${
                      selected ? "bg-[#40CFD5] text-black" : "bg-black text-white"
                    }`}
                  >
                    <Icon size={32} strokeWidth={1.8} aria-hidden="true" />
                  </span>

                  <span className="text-xl font-extrabold text-black sm:text-2xl">
                    {title}
                  </span>
                  <span className="mt-2 font-bold text-[#179da3]">{d.steps.max} {capacity}</span>
                  <span className="mt-3 max-w-xs text-sm leading-relaxed text-gray-600">
                    {bookable ? description : d.steps.notBookableNow}
                  </span>

                  {selected && (
                    <span
                      aria-label={d.steps.selected}
                      className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-[#40CFD5] text-black"
                    >
                      <Check size={17} strokeWidth={3} />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Óratípusváltáskor új naptár indul; a mentett foglaltságot újra betöltjük. */}
          {selectedType && (
            <StudioCalendar
              key={selectedType}
              lessonType={selectedType}
              initialRoom={pendingRoom}
              roomRequest={roomRequest}
            />
          )}

          {/* Tájékoztató szöveg a naptár alatt — az adminban szerkeszthető (admin → Szövegek). */}
          <div className="mt-16 space-y-10 rounded-3xl bg-gray-50 p-6 sm:p-10">
            {content.intro.length > 0 && (
              <div className="space-y-4 text-sm leading-relaxed text-gray-700 sm:text-base">
                {content.intro.map((text, i) => <p key={i}>{text}</p>)}
              </div>
            )}

            {(content.approvalTitle || content.approval.length > 0) && (
              <div>
                {content.approvalTitle && <h3 className="section-title text-2xl text-black sm:text-3xl">{content.approvalTitle}</h3>}
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700 sm:text-base">
                  {content.approval.map((text, i) => <p key={i}>{text}</p>)}
                </div>
              </div>
            )}

            <div>
              {content.feesTitle && <h3 className="section-title text-2xl text-black sm:text-3xl">{content.feesTitle}</h3>}
              {content.feesNote && (
                <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                  {content.feesNote}
                </p>
              )}

              {content.studios.length > 0 && (
                <div className="mt-5 grid gap-6 sm:grid-cols-2">
                  {content.studios.map((studio, i) => (
                    <div key={i} className="rounded-2xl bg-white p-5 shadow-sm">
                      <p className="text-sm font-extrabold uppercase tracking-widest text-[#087c81]">{studio.title}</p>
                      <ul className="mt-3 space-y-1.5 text-sm text-gray-700 sm:text-base">
                        {studio.items.map((item, j) => <li key={j}>{item}</li>)}
                        {studio.note && <li className="text-gray-500">{studio.note}</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {content.feesFooter && (
                <p className="mt-5 text-sm text-gray-700 sm:text-base">
                  {content.feesFooter}
                </p>
              )}

              {content.cancel.length > 0 && (
                <div className="mt-5 space-y-3 text-sm leading-relaxed text-gray-700 sm:text-base">
                  {content.cancel.map((text, i) => (
                    <p key={i}>
                      {i === 0 && content.cancelLabel && <><strong>{content.cancelLabel}</strong>{" "}</>}
                      {text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <SiteFooter locale={locale} />
    </main>
  );
}
