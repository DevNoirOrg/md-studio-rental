# Online fizetés (Stripe) és számlázás (Billingo) — útmutató

## A folyamat

1. **Foglalás** → az ügyfél „Megkaptuk a foglalási igényedet” e-mailt kap (a stúdió értesítője is megy, mint eddig).
2. **Döntés** (a stúdiónak küldött e-mail jóváhagyó/elutasító gombjaival). Amikor az igény **minden** időpontjáról
   döntöttek, az ügyfél egy e-mailt kap:
   - elfogadott időpont(ok) → „Elfogadtuk” + **fizetési link** (csak az elfogadott időpontok árával),
     az elutasítottak felsorolásával; a naptárban az esemény címe: „… (fizetésre vár)”;
   - minden elutasítva → „Nem tudjuk elfogadni”.
3. **Fizetés** a Stripe biztonságos oldalán (bankkártya, Apple / Google Pay). Utána automatikusan:
   - „Sikeres fizetés” e-mail a **bejutási infókkal** (admin → Fizetés és e-mailek);
   - **Billingo számla** (fizetettként, bankkártyás fizetéssel) — a Billingo beküldi a NAV-nak és e-mailben elküldi;
   - értesítő a stúdiónak; a naptárból lekerül a „(fizetésre vár)”.
4. **Határidő** (kikapcsolható): a jóváhagyástól 48 óra (állítható), de legkésőbb 2 órával az első időpont előtt.
   12 órával előtte emlékeztető megy; ha lejár, az időpontok felszabadulnak, az ügyfél és a stúdió e-mailt kap.

Amíg az **„Online fizetés bekapcsolva”** kapcsoló ki van kapcsolva (admin → Fizetés és e-mailek), minden úgy
működik, mint eddig, csak a visszaigazoló e-mailek mennek ki — a jóváhagyó e-mailben fizetési link helyett
„A fizetés részleteiről külön írunk” áll.

Kézi esetek: az adminban a foglalás részleteinél **„Fizetettnek jelölöm”** (átutalás / helyszíni fizetés — ilyenkor
nincs automatikus számla és bejutási e-mail). Visszatérítés: a Stripe felületén; sztornó: a Billingóban.

## 1. Adatbázis (egyszer)

Supabase → SQL Editor: futtasd le a `supabase/2026-11-payments.sql`-t (nem destruktív, újrafuttatható).
Ha még nem futott: a `supabase/2026-11-page-content.sql` is kell (ez hozza létre a beállítások tábláját).

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

## 4. Időzített teendők

A lejárt határidők, az emlékeztetők és a félbemaradt számlák / e-mailek pótlása a foglalóoldal és az admin
forgalmával percenként legfeljebb egyszer lefut, ezen kívül a Vercel Cron naponta (`vercel.json`). Pro csomagon
érdemes óránkéntire állítani (`"schedule": "0 * * * *"`). Ha a `CRON_SECRET` be van állítva, a cron csak azzal fut.
