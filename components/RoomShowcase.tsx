"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Snowflake,
  Ruler,
  MoveHorizontal,
  ArrowUpFromLine,
  Users,
  Volume2,
  Square,
  Layers,
  Lightbulb,
  Wallet,
  Check,
  X,
  Maximize2,
  CalendarCheck,
} from "lucide-react";
import { rooms, type Room } from "@/lib/studio-booking";
import { roomDetails, roomPrice } from "@/lib/rooms";

const huNumber = new Intl.NumberFormat("hu-HU");
const huCurrency = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

/* ── Egy terem kártyája: háttérkép, bal alul név + m² + klíma-ikon ── */
function RoomCard({ room, index, onOpen }: { room: Room; index: number; onOpen: (room: Room) => void }) {
  const d = roomDetails[room];
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(room)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      whileHover={{ y: -6 }}
      aria-label={`${room} részletei`}
      className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[1.75rem] bg-black text-left shadow-[0_14px_40px_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/60"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
        style={{ backgroundImage: `url('${d.image}')` }}
      />
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      {/* Részletek-jelzés jobb felül */}
      <span className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors group-hover:bg-[#40CFD5] group-hover:text-black">
        <Maximize2 size={17} strokeWidth={2.2} />
      </span>

      {/* Bal alul: név, m², klíma */}
      <span className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <span className="block text-[11px] font-bold uppercase tracking-[0.25em] text-[#40CFD5]">{d.location}</span>
        <span className="section-title mt-1 block text-3xl text-white">{d.name}</span>
        <span className="mt-3 flex items-center gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold text-white backdrop-blur-sm">
            {huNumber.format(d.area)} m²
          </span>
          {d.ac && (
            <span
              title="Klimatizált"
              aria-label="Klimatizált"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#40CFD5] text-black"
            >
              <Snowflake size={16} strokeWidth={2.4} />
            </span>
          )}
        </span>
      </span>
    </motion.button>
  );
}

/* ── Részletes modal: balra info-sáv, jobbra nagy kép ── */
function RoomModal({ room, onClose, onBook }: { room: Room; onClose: () => void; onBook: (room: Room) => void }) {
  const d = roomDetails[room];
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const props = [
    { Icon: Ruler, label: "Alapterület", value: `${huNumber.format(d.area)} m²` },
    { Icon: MoveHorizontal, label: "Méretek", value: `${huNumber.format(d.length)} × ${huNumber.format(d.width)} m` },
    { Icon: ArrowUpFromLine, label: "Belmagasság", value: `${huNumber.format(d.height)} m` },
    { Icon: Users, label: "Befogadóképesség", value: `max. ${d.capacity} fő` },
    { Icon: Snowflake, label: "Klíma", value: d.ac ? "Van" : "Nincs" },
    { Icon: Volume2, label: "Hangrendszer", value: d.sound },
    { Icon: Square, label: "Tükör", value: d.mirror },
    { Icon: Layers, label: "Padló", value: d.floor },
    { Icon: Lightbulb, label: "Világítás", value: d.light },
    { Icon: Wallet, label: "Óradíj", value: `${huCurrency.format(roomPrice(room))} / óra` },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-[92vh] max-h-[860px] w-full max-w-6xl flex-col-reverse overflow-hidden rounded-[2rem] bg-white shadow-2xl lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]"
      >
        {/* Info-sáv */}
        {/* min-h-0: a rács/flex elem nem nőhet a tartalmánál nagyobbra, így tényleg görgethető */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#179da3]">{d.location}</p>
          <h2 id="room-modal-title" className="section-title mt-1 text-4xl text-black">{d.name}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">{d.description}</p>

          {/* Foglalás: bezárja a modalt, kiválasztja a terem fülét és a naptárhoz görget */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onBook?.(room);
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white shadow-xl transition-colors hover:bg-[#40CFD5] hover:text-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/50"
          >
            <CalendarCheck size={18} strokeWidth={2.2} aria-hidden="true" />
            Foglalás
          </button>

          <dl className="mt-6 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-gray-50/70">
            {props.map(({ Icon, label, value }) => (
              <div key={label} className="flex gap-3 px-4 py-3">
                <Icon size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-[#179da3]" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-[11px] font-extrabold uppercase tracking-widest text-gray-400">{label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-black">{value}</dd>
                </div>
              </div>
            ))}
          </dl>

          {(d.extras?.length ?? 0) > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {d.extras?.map((x) => (
                <li key={x} className="flex items-center gap-1.5 rounded-full bg-[#40CFD5]/15 px-3 py-1.5 text-xs font-bold text-black">
                  <Check size={13} strokeWidth={3} /> {x}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Nagy kép */}
        <div className="relative h-56 shrink-0 bg-black sm:h-80 lg:h-auto lg:min-h-[560px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${d.image}')` }}
            role="img"
            aria-label={`${room} fotója`}
          />
        </div>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Bezárás"
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-colors hover:bg-[#40CFD5] hover:text-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/60"
        >
          <X size={20} />
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function RoomShowcase({ onBook }: { onBook: (room: Room) => void }) {
  const [openRoom, setOpenRoom] = useState<Room | null>(null);
  const close = useCallback(() => setOpenRoom(null), []);
  // Portál csak a kliensen (hidratálás után) — setState-effekt nélkül.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  return (
    <section aria-labelledby="rooms-title" className="mb-16 sm:mb-20">
      <div className="mb-8 text-center sm:mb-10">
        <h2 id="rooms-title" className="section-title text-4xl text-black sm:text-5xl">Termeink</h2>
        <p className="mt-3 text-sm text-gray-600 sm:text-base">
          Négy terem két stúdióban — kattints egy teremre a részletekért.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {rooms.map((room, i) => (
          <RoomCard key={room} room={room} index={i} onOpen={setOpenRoom} />
        ))}
      </div>
      {/* Portál a <body>-ba, hogy a fix menüsor se lógjon a modal fölé */}
      {mounted &&
        createPortal(
          <AnimatePresence>{openRoom && <RoomModal room={openRoom} onClose={close} onBook={onBook} />}</AnimatePresence>,
          document.body,
        )}
    </section>
  );
}
