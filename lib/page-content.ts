import type { LessonType } from "./room-config.ts";
import type { Locale } from "./i18n.ts";

/*
  A foglalóoldal adminban szerkeszthető szövegei (admin → Szövegek), magyarul és angolul:
    - az 1. lépés címe, alcíme és a három óratípus kártyája,
    - a naptár alatti tájékoztató (bevezető, jóváhagyás, bérleti díjak, lemondás).
  A rental.settings tábla 'page' sorában van: { hu: PageContent, en: PageContent }.
  Ami nincs elmentve, az az alábbi alapérték; az angolban üresen hagyott szöveg
  (vagy teljesen üres lista) az angol oldalon magyarul jelenik meg.
*/

export interface LessonText {
  title: string;
  /** A kártyán a „Max.” után, pl. „3 fő”. */
  capacity: string;
  description: string;
}

export interface StudioFees {
  title: string;
  items: string[];
  /** Halványabb, utolsó sor (pl. lámpacsomag). */
  note: string;
}

export interface PageContent {
  lessonTitle: string;
  lessonLead: string;
  lessons: Record<LessonType, LessonText>;
  intro: string[];
  approvalTitle: string;
  approval: string[];
  feesTitle: string;
  feesNote: string;
  studios: StudioFees[];
  feesFooter: string;
  cancelLabel: string;
  cancel: string[];
}

export interface PageContentSettings {
  hu: PageContent;
  en: PageContent;
}

export const PAGE_CONTENT_KEY = "page";
const LESSON_IDS: LessonType[] = ["privat", "kiscsoportos", "csoportos"];

export const defaultPageContent: PageContentSettings = {
  hu: {
    lessonTitle: "Milyen órát tartanál?",
    lessonLead: "Válassz egyet a három óratípus közül.",
    lessons: {
      privat: { title: "Privát óra", capacity: "3 fő", description: "Egyéni óra vagy személyre szabott gyakorlás." },
      kiscsoportos: { title: "Kiscsoportos óra", capacity: "18 fő", description: "Közös tánc kisebb létszámú csoporttal." },
      csoportos: { title: "Csoportos óra", capacity: "36 fő", description: "Táncóra nagyobb csoport számára." },
    },
    intro: [
      "A termeket kiadjuk táncoktatásra, jógaoktatásra és workshopokra, melyek fotózásra és forgatásra alkalmas alap fény- és hangstúdió-eszközökkel vannak ellátva.",
      "A terem padlózatának megóvása érdekében step és néptánc órákat nem tudunk fogadni. Váltócipő használata kötelező!",
    ],
    approvalTitle: "Foglalások jóváhagyása",
    approval: [
      "Minden beérkező foglalási igényt egyedileg átnézünk és jóváhagyunk. A jóváhagyást követően a foglalási folyamat automatikusan folytatódik, a további tudnivalókat és a fizetéssel kapcsolatos információkat pedig a megadott e-mail-címre küldjük.",
      "Kérjük, vedd figyelembe, hogy indokolt esetben fenntartjuk a foglalási igény elutasításának jogát. A foglalás az időpont jóváhagyását és a sikeres fizetést követően válik véglegessé.",
    ],
    feesTitle: "Bérleti díjak",
    feesNote: "A pontos díjakat és a lámpacsomag / forgatásos bérlés opcióját hamarosan beépítjük a foglalási folyamatba — addig itt tájékoztató jelleggel:",
    studios: [
      {
        title: "Astoria stúdió",
        items: [
          "Kis terem: 10.000 Ft / óra",
          "Nagy terem: 15.000 Ft / óra",
          "Terembérlés forgatásra eszközzel: 20.000 Ft / óra (lámpák, softbox, dimmer, állvány és egyéb eszközhasználattal)",
        ],
        note: "Lámpacsomag: +5.000 Ft a nagy terem bérlése mellé",
      },
      {
        title: "Opera stúdió",
        items: [
          "9.000 Ft / óra",
          "Terembérlés videóklip, film és professzionális forgatásra: 15.000 Ft / óra",
        ],
        note: "Lámpacsomag: +6.000 Ft, amivel a bérlés 15.000 Ft-ra jön ki",
      },
    ],
    feesFooter: "Magánóra 3 főig mindkét stúdióban: 4.000 Ft / óra.",
    cancelLabel: "Lemondások:",
    cancel: [
      "a foglalás a fizetés teljesítésével válik véglegessé. Kérjük, vedd figyelembe, hogy amennyiben a bérlés vagy az esemény elmarad, a befizetett összeget nem áll módunkban visszatéríteni.",
      "Természetesen megértjük, hogy a tervek néha változhatnak! Ha legalább 48 órával a foglalt időpont előtt jelzed felénk, hogy mégsem tudtok jönni, lehetőséget biztosítunk a foglalás egyszeri, díjmentes áthelyezésére egy másik, szabad időpontra.",
    ],
  },
  en: {
    lessonTitle: "What kind of class will you hold?",
    lessonLead: "Choose one of the three class types.",
    lessons: {
      privat: { title: "Private class", capacity: "3 people", description: "One-to-one class or personalised practice." },
      kiscsoportos: { title: "Small group class", capacity: "18 people", description: "Dancing together in a smaller group." },
      csoportos: { title: "Group class", capacity: "36 people", description: "A dance class for a larger group." },
    },
    intro: [
      "Our rooms can be rented for dance classes, yoga classes and workshops, and they come with basic lighting and sound equipment suitable for photo and video shoots.",
      "To protect the floor, we can't host tap or folk dance classes. Changing into clean indoor shoes is required!",
    ],
    approvalTitle: "Booking approval",
    approval: [
      "We review and approve every booking request individually. Once approved, the booking process continues automatically, and we'll send further information and payment details to the email address you provided.",
      "Please note that we reserve the right to decline a booking request where justified. A booking becomes final once the time has been approved and payment has been received.",
    ],
    feesTitle: "Rental fees",
    feesNote: "Exact fees and the lighting package / film shoot rental options will soon be built into the booking process — until then, for information:",
    studios: [
      {
        title: "Astoria studio",
        items: [
          "Small room: HUF 10,000 / hour",
          "Large room: HUF 15,000 / hour",
          "Room rental for filming with equipment: HUF 20,000 / hour (including lights, softbox, dimmer, stands and other equipment)",
        ],
        note: "Lighting package: +HUF 5,000 with the large room",
      },
      {
        title: "Opera studio",
        items: [
          "HUF 9,000 / hour",
          "Room rental for music videos, film and professional shoots: HUF 15,000 / hour",
        ],
        note: "Lighting package: +HUF 6,000, bringing the rental to HUF 15,000",
      },
    ],
    feesFooter: "Private class for up to 3 people in either studio: HUF 4,000 / hour.",
    cancelLabel: "Cancellations:",
    cancel: [
      "a booking becomes final once payment has been made. Please note that if the rental or event doesn't take place, we're unable to refund the amount paid.",
      "Of course, we understand that plans sometimes change! If you let us know at least 48 hours before the booked time that you can't make it, we'll let you move your booking once, free of charge, to another available time.",
    ],
  },
};

// ---------------------------------------------------------------------
//  Beolvasás: a tárolt (esetleg hiányos) érték ráfésülése az alapértékre
// ---------------------------------------------------------------------
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const strList = (v: unknown, d: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : d);

function normalizeContent(raw: unknown, d: PageContent): PageContent {
  const r = isObj(raw) ? raw : {};
  const lessons = isObj(r.lessons) ? r.lessons : {};
  return {
    lessonTitle: str(r.lessonTitle, d.lessonTitle),
    lessonLead: str(r.lessonLead, d.lessonLead),
    lessons: Object.fromEntries(LESSON_IDS.map((id) => {
      const l = isObj(lessons[id]) ? lessons[id] : {};
      return [id, {
        title: str(l.title, d.lessons[id].title),
        capacity: str(l.capacity, d.lessons[id].capacity),
        description: str(l.description, d.lessons[id].description),
      }];
    })) as Record<LessonType, LessonText>,
    intro: strList(r.intro, d.intro),
    approvalTitle: str(r.approvalTitle, d.approvalTitle),
    approval: strList(r.approval, d.approval),
    feesTitle: str(r.feesTitle, d.feesTitle),
    feesNote: str(r.feesNote, d.feesNote),
    studios: Array.isArray(r.studios)
      ? r.studios.filter(isObj).map((s) => ({ title: str(s.title, ""), items: strList(s.items, []), note: str(s.note, "") }))
      : d.studios,
    feesFooter: str(r.feesFooter, d.feesFooter),
    cancelLabel: str(r.cancelLabel, d.cancelLabel),
    cancel: strList(r.cancel, d.cancel),
  };
}

export function normalizePageContent(raw: unknown): PageContentSettings {
  const r = isObj(raw) ? raw : {};
  return { hu: normalizeContent(r.hu, defaultPageContent.hu), en: normalizeContent(r.en, defaultPageContent.en) };
}

/** Az oldal nyelvén megjelenő szövegek: angolul az üres szöveg / üres lista helyén a magyar áll. */
export function localizePageContent(settings: PageContentSettings, locale: Locale): PageContent {
  const hu = settings.hu;
  if (locale !== "en") return hu;
  const en = settings.en;
  const s = (a: string, b: string) => (a.trim() ? a : b);
  const list = (a: string[], b: string[]) => (a.some((x) => x.trim()) ? a : b);
  return {
    lessonTitle: s(en.lessonTitle, hu.lessonTitle),
    lessonLead: s(en.lessonLead, hu.lessonLead),
    lessons: Object.fromEntries(LESSON_IDS.map((id) => [id, {
      title: s(en.lessons[id].title, hu.lessons[id].title),
      capacity: s(en.lessons[id].capacity, hu.lessons[id].capacity),
      description: s(en.lessons[id].description, hu.lessons[id].description),
    }])) as Record<LessonType, LessonText>,
    intro: list(en.intro, hu.intro),
    approvalTitle: s(en.approvalTitle, hu.approvalTitle),
    approval: list(en.approval, hu.approval),
    feesTitle: s(en.feesTitle, hu.feesTitle),
    feesNote: s(en.feesNote, hu.feesNote),
    studios: en.studios.some((st) => st.title.trim() || st.items.some((x) => x.trim())) ? en.studios : hu.studios,
    feesFooter: s(en.feesFooter, hu.feesFooter),
    cancelLabel: s(en.cancelLabel, hu.cancelLabel),
    cancel: list(en.cancel, hu.cancel),
  };
}
