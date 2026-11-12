# Online fizetés (Stripe) és számlázás (Billingo) — útmutató

## A folyamat

1. **Foglalás** → az ügyfél „Megkaptuk a foglalási igényedet” e-mailt kap (a stúdió értesítője is megy, mint eddig).
2. **Döntés** (a stúdiónak küldött e-mail jóváhagyó/elutasító gombjaival). Amikor az igény **minden** időpontjáról
   döntöttek, az ügyfél egy e-mailt kap:
   - elfogadott időpont(ok) → „Elfogadtuk” + **fizetési link** (csak az elfogadott időpontok árával),
     az elutasítottak felsorolásával; a Google Naptárban az esemény címe: „… (nincs fizetve)”,
     az admin naptárban piros;
   - minden elutasítva → „Nem tudjuk elfogadni”.
3. **Fizetés** a Stripe biztonságos oldalán (bankkártya, Apple / Google Pay). Utána automatikusan:
   - „Sikeres fizetés” visszaigazoló e-mail — **kód nélkül**, „a bejutási infókat az időpont előtt 24 órával
     küldjük” szöveggel; ha valamelyik nap 24 órán belül van, annak a bejutási infói azonnal benne vannak;
   - **Billingo számla** (fizetettként, bankkártyás fizetéssel) — a Billingo beküldi a NAV-nak és e-mailben elküldi;
   - értesítő a stúdiónak; a naptárban zöld lesz, a címből lekerül a „(nincs fizetve)”.
4. **Fizetési szabály** (admin → Fizetés és e-mailek, alapértékek 48 / 24 óra):
   - ha jóváhagyáskor az első időpont **48 órán belül** van: **nincs határidő**, semmi nem szabadul fel, a fizetési
     link az időpont után is működik. Amíg nincs fizetve, az admin naptárban piros. Ha az időpont után sem fizet,
     az **utolsó időpont utáni napon 10:00-kor** egyszer kimegy egy „még nincs rendezve” e-mail a fizetési linkkel;
   - ha **távolabb** van: a jóváhagyástól **24 óra** a fizetésre. 12 órával a lejárat előtt emlékeztető megy; ha lejár,
     az időpontok felszabadulnak, az ügyfél és a stúdió e-mailt kap. A „Fizetési határidő” kapcsolóval ez kikapcsolható
     — kikapcsolva soha nem szabadul fel semmi.
5. **24 órával minden foglalási nap előtt** emlékeztető e-mail (mindkét stúdiónál):
   - ha ki van fizetve: a **bejutási infókkal** (a hónap kódjával, lásd lent);
   - ha nincs: kód nélkül, a **fizetési linkkel** — a bejutási infók a fizetés után azonnal mennek.

Színek az admin naptárban: **sárga** = jóváhagyásra vár, **piros** = jóváhagyva, nincs fizetve, **zöld** = fizetve
(online vagy kézzel jelölve), **kék** = foglalás online fizetés nélkül (pl. kikapcsolt online fizetésnél).

Amíg az **„Online fizetés bekapcsolva”** kapcsoló ki van kapcsolva (admin → Fizetés és e-mailek), minden úgy
működik, mint eddig, csak a visszaigazoló e-mailek mennek ki — a jóváhagyó e-mailben fizetési link helyett
„A fizetés részleteiről külön írunk” áll.

Kézi esetek: az adminban a foglalás részleteinél **„Fizetettnek jelölöm”** (átutalás / helyszíni fizetés — ilyenkor
nincs automatikus számla; a 24 órával előtti emlékeztető a bejutási infókkal megy). Visszatérítés: a Stripe felületén;
sztornó: a Billingóban.

Az adminban felvett foglalásnál a **„Bejutási infók küldése”** pipa ugyanígy működik: azonnal megy egy visszaigazolás
(a 24 órán belüli napok bejutási infóival), a többi nap infói 24 órával előtte.

## Havi bejutási kódok

Admin → Fizetés és e-mailek:

1. A **Bejutási infók** szövegébe írd a kód helyére: `{KÓD}` (pl. „Kapukód: {KÓD}”).
2. A **Havi bejutási kódok** dobozban stúdiónként: **+ Hónap hozzáadása** → hónap és kód → Mentés.

Az e-mailbe mindig a **foglalási nap hónapjának** kódja kerül (egy novemberi foglaláshoz a novemberi kód akkor is,
ha a foglalás októberben történt). Ha arra a hónapra nincs kód, az ügyfél „a bejutási kódot hamarosan külön küldjük”
szöveget kap, a stúdió pedig figyelmeztető e-mailt. Az admin figyelmeztet, ha az aktuális vagy a következő hónap
kódja hiányzik.

## 1. Adatbázis (egyszer)

Supabase → SQL Editor: futtasd le sorban (mind nem destruktív, újrafuttatható):

1. `supabase/2026-11-page-content.sql` (ha még nem futott — ez hozza létre a beállítások tábláját),
2. `supabase/2026-11-payments.sql`,
3. `supabase/2026-11-calendars-reminders.sql` (termenkénti naptárak, 24 órás emlékeztetők).

## 2. Stripe

1. Stripe → Developers → **API keys** → a **Secret key** (`sk_test_…` teszthez) → Vercel: `STRIPE_SECRET_KEY`.
2. Stripe → Developers → **Webhooks** → **Add endpoint**
   - URL: `https://www.hiphoptanciskola.com/studio-berles/api/stripe/webhook` (preview-n a preview címe)
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`
   - a végpont **Signing secret**-je (`whsec_…`) → Vercel: `STRIPE_WEBHOOK_SECRET`
3. Stripe → Settings → **Customer emails** → a „Successful payments” nyugta-e-mailt **kapcsold ki**
   (a számlát a Billingo küldi, a visszaigazolást a foglalási rendszer).
4. Vercel → Redeploy. Admin → Fizetés és e-mailek: a „Bekötések” dobozban zöld/sárga jelzés.

Teszt: tesztkulccsal a `4242 4242 4242 4242` kártyaszámmal (bármilyen jövőbeli lejárat, bármilyen CVC) lehet fizetni.

## 3. Billingo

1. Billingo → Beállítások → **API** → új API kulcs → Vercel: `BILLINGO_API_KEY` → Redeploy.
2. Admin → Fizetés és e-mailek → **Számlatömbök betöltése** → számlatömb (és ha kell, bankszámla) kiválasztása,
   **ÁFA** (27% vagy AAM — a könyvelő tudja), a számlatétel megnevezése → Mentés.
3. Az első éles számlát érdemes egy próbafoglalással ellenőrizni (szükség esetén sztornózni a Billingóban).

Számlatömb nélkül nem készül automatikus számla — ilyenkor a foglalás részleteinél „Nincs automatikus számla” látszik.

## 4. Időzített teendők — óránkénti futtatás (cron-job.org)

A lejáratok, az emlékeztetők (12 órával a határidő előtt, 24 órával a foglalási nap előtt), a „még nincs rendezve”
e-mailek és a félbemaradt számlák pótlása a foglalóoldal és az admin forgalmával is lefut (percenként legfeljebb
egyszer), de forgalom nélkül nem — ezért **óránként** kívülről kell elindítani. A Vercel Hobby csomag cronja csak
naponta fut (`vercel.json`, ez maradhat tartaléknak), ezért az óránkénti hívást a cron-job.org (ingyenes) végzi.

**1. Titkos kulcs a Vercelben**

1. Generálj egy hosszú, véletlen jelszót (pl. jelszókezelővel, legalább 32 karakter, csak betű és szám).
2. Vercel → md-studio-rental → Settings → **Environment Variables** → `CRON_SECRET` = ez a jelszó (Production).
3. Deployments → **Redeploy**.

**2. Feladat a cron-job.org-on**

1. <https://cron-job.org> → **Sign up** (ingyenes), e-mail megerősítés, belépés.
2. **Dashboard → Create cronjob**.
3. **Title:** `MD stúdió – fizetések`
4. **URL:** `https://www.hiphoptanciskola.com/studio-berles/api/cron/payments`
5. **Execution schedule:** *Every hour* (pl. minden óra 5. percében: „Every hour at minute 5”).
6. Fent az **Advanced** fül → **Headers** → **Add header**:
   - Key: `Authorization`
   - Value: `Bearer ` + a `CRON_SECRET` értéke (a „Bearer” után egy szóköz!), pl. `Bearer a1b2c3…`
7. **Request method:** GET. **Timeout:** a legnagyobb, ami engedett (30 mp).
8. **Notifications:** pipáld be, hogy szóljon, ha a futás többször egymás után hibás.
9. **Create** → a listában a feladat mellett **Test run** (▶): a válasz `200`, a törzsben pl.
   `{"expired":0,"reminded":0,"retried":0,"dayReminders":0,"overdue":0}`.

Ha `401` jön: rossz a fejléc (hiányzik a „Bearer ”, vagy a Vercelben más a `CRON_SECRET`, vagy nem volt Redeploy).
A `CRON_SECRET` értékét ne küldd el senkinek e-mailben vagy chatben — csak a Vercelbe és a cron-job.org-ba kell.
