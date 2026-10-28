# Google Naptár bekötése — útmutató

A foglalási rendszer a **jóváhagyott** foglalásokat („Foglalás alatt”) automatikusan beírja a stúdió
Google Naptárába (`info.mddancestudio@gmail.com`). **Egy közös naptár** van az összes teremmel; a
termeket az esemény színe és a cím eleje különbözteti meg:

| Terem | Szín a naptárban | Az esemény címe |
|---|---|---|
| Astoria – Nagy Terem | piros (Paradicsom) | „Astoria Nagy · Kiscsoportos óra – Kiss Péter” |
| Astoria – Kis Terem | sárga (Banán) | „Astoria Kis · …” |
| Opera – Nagy Terem | lila (Szőlő) | „Opera Nagy · …” |
| Opera – Közepes Terem | zöld (Bazsalikom) | „Opera Közepes · …” |

Átfoglaláskor az esemény átkerül, törléskor törlődik. A jóváhagyásra váró és az elutasított igények
**nem** kerülnek be.

Fontos:
- A szinkron **egyirányú**: a naptárban kézzel ne módosítsd a rendszer eseményeit (a következő
  szinkron felülírhatja). Átfoglalni / törölni az adminban kell: `…/studio-berles/admin`.
- A naptárba kézzel beírt egyéb eseményeket a rendszer **nem látja** — a weboldal ezekre az
  időpontokra is engedi a foglalási igényt. Ilyet a jóváhagyásnál kell kiszűrni, vagy a foglalást
  az adminban felvenni (akkor a naptárba is bekerül).
- A bekötés előtt már jóváhagyott foglalások nem kerülnek be utólag (csak ha átfoglalod őket).
- Ha a Google épp nem érhető el, a foglalás akkor is működik; a naptárbejegyzés a következő admin
  oldalbetöltéskor vagy az admin → Foglalások → **„Szinkronizálás most”** gombbal pótolódik.

---

## 1. Google „robot” fiók (szolgáltatásfiók) létrehozása — egyszer, ~10 perc

Ezzel a fiókkal ír a rendszer a naptárakba; senkinek nem kell az adminban Google-lel belépnie.
Bármelyik Google-fiókkal elvégezhető (célszerű a stúdió fiókjával).

1. Nyisd meg: <https://console.cloud.google.com> → fent a projektválasztó → **New project / Új projekt**
   → név: `MD Studio foglalas` → Create.
2. Bal menü → **APIs & Services → Library** → keresd: **Google Calendar API** → **Enable**.
3. Bal menü → **IAM & Admin → Service Accounts** → **Create service account**
   → név: `foglalasi-rendszer` → **Create and continue** → szerepkört NE adj → **Done**.
4. Kattints a létrejött fiókra → **Keys** fül → **Add key → Create new key → JSON → Create**.
   Letöltődik egy `.json` fájl. **Ez titkos kulcs** — ne küldd el senkinek e-mailben/chatben,
   csak a Vercelbe másold be (3. lépés), utána a fájlt törölheted.
5. Másold ki a fiók e-mail címét (pl. `foglalasi-rendszer@md-studio-foglalas.iam.gserviceaccount.com`).

## 2. A naptár megosztása a robottal

Az `info.mddancestudio@gmail.com` fiókkal belépve, a <https://calendar.google.com> oldalon (számítógépen):

1. Bal oldalt a „Saját naptáraim” alatt a naptár (a fiók fő naptára, vagy egy erre létrehozott
   „Foglalások” naptár) neve mellett **⋮ → Beállítások és megosztás** (Settings and sharing).
2. **Megosztás meghatározott személyekkel** → **Személyek hozzáadása** → az 1/5. lépés e-mail címe
   → jogosultság: **Módosíthatja az eseményeket** (Make changes to events) → Küldés.
3. Lejjebb, **Naptár integrálása** (Integrate calendar) → másold ki a **Naptárazonosítót**
   (Calendar ID). A fiók fő naptáránál ez maga a Gmail-cím: `info.mddancestudio@gmail.com`.

## 3. Beállítás a Vercelen

Vercel → **md-studio-rental** projekt → Settings → **Environment Variables** (Production):

| Változó | Érték |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | a letöltött `.json` fájl **teljes tartalma** (nyisd meg Jegyzettömbbel, mindent másolj be) |
| `GOOGLE_CALENDAR_ID` | a naptárazonosító, pl. `info.mddancestudio@gmail.com` |

Ezek **nem** kaphatnak `NEXT_PUBLIC_` előtagot. Mentés után: Deployments → **Redeploy**.

Az `APP_BASE_URL` legyen beállítva (pl. `https://www.hiphoptanciskola.com`) — ebből készül az
eseményekben a „Megnyitás az adminban” link.

## 4. Adatbázis

Supabase → SQL Editor: futtasd le újra a `supabase/studio-bookings.sql`-t (újrafuttatható,
foglalást nem töröl; hozzáadja a naptár-szinkron mezőit).

## 5. Próba

1. Admin → **Foglalások** → vegyél fel egy próbafoglalást (pl. holnapra).
2. Pár másodperc múlva meg kell jelennie a Google Naptárban a terem színével
   („Astoria Nagy · Privát óra – Név”, a leírásban telefon, e-mail, ár, link az adminra).
3. Az oldal alján a **Google Naptár** dobozban látszik, ha valami nem ment át (és miért);
   a **Szinkronizálás most** gomb újrapróbálja.
4. Töröld a próbafoglalást az adminban → az esemény is eltűnik a naptárból.

Gyakori hiba: „A naptár nem érhető el (404/403)” → a naptár nincs megosztva a robot e-mail címével
„Módosíthatja az eseményeket” joggal, vagy elírtad a naptárazonosítót.

Ha korábban a régi (termenkénti) beállítást használtátok: a `GOOGLE_CALENDAR_ASTORIA_…` /
`GOOGLE_CALENDAR_OPERA_…` változók törölhetők, helyettük a `GOOGLE_CALENDAR_ID` kell.

---

## Értesítések beállítása — minden adminnak, egyszer

Az értesítéseket a Google Naptár küldi. Mindenki a **saját** Google-fiókjában állítja be a közös
foglalási naptárnál (a naptárat előbb meg kell osztani vele az `info.mddancestudio@gmail.com`
fiókból, legalább „Az összes eseményrészlet megtekintése” joggal).

A <https://calendar.google.com> oldalon (számítógépen), a foglalási naptárnál:
**⋮ → Beállítások és megosztás**, majd:

1. **Értesítés foglaláskor** — „Egyéb értesítések” (Other notifications) → **Új események**
   (New events) → **E-mail**. (Érdemes a „Módosított események” és a „Lemondott események”
   értesítést is bekapcsolni — átfoglalás, törlés.)
2. **Emlékeztető a foglalás előtt** — „Esemény-értesítések” (Event notifications) →
   **Értesítés hozzáadása** → pl. **30 perc** → **Értesítés** (ez a telefonon felugró üzenet).

Telefonon: legyen telepítve a **Google Naptár** alkalmazás ugyanazzal a fiókkal, és a foglalási
naptár legyen bepipálva (látható) az alkalmazásban — így jön a felugró emlékeztető.
