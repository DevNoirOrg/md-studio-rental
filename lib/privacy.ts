/*
  Adatkezelési tájékoztató (az MD Dance School oldaléval azonos szöveg).
  A szöveg sima szöveg, három egyszerű szabállyal:
    - üres sor        → új bekezdés
    - "# Cím"         → fejezetcím (ebből készül a tartalomjegyzék is)
    - "- elem" sorok  → felsorolás
  Az első fejezetcím előtti szöveg kiemelt dobozban jelenik meg az oldal tetején.
  FIGYELEM: MINTA — véglegesítés előtt jogilag ellenőrizni kell!
*/

export const PRIVACY_URL = "/adatkezeles";

export type PrivacyBlock = { type: "p"; lines: string[] } | { type: "ul"; items: string[] };
export type PrivacySection = { id: string; title: string; blocks: PrivacyBlock[] };

export const privacyText = "MINTA — az adatkezelő adatait, a weboldal címét és az adatfeldolgozókat véglegesítés előtt ellenőrizni kell. (Ezt a bekezdést utána törölheted.)\n\n# A tájékoztató célja, hatálya, irányadó jogszabályok\n\nJelen tájékoztató célja, hogy rögzítse az adatkezelő által alkalmazott adatvédelmi és adatkezelési elveket, valamint az adatkezelő adatvédelmi és adatkezelési politikáját, amelyet magára nézve kötelezőnek ismer el. A tájékoztató az [az MD Dance School weboldalának címe] weboldalon keresztül megvalósuló adatkezelésekre — a táncórákra és a tánctáborra történő jelentkezésre, a stúdióbérlésre és a kapcsolatfelvételre — vonatkozik, és visszavonásig érvényes.\n\nAz adatkezelés során az adatkezelő az alábbi jogszabályok szerint jár el:\n\n- az Európai Parlament és a Tanács (EU) 2016/679 rendelete (általános adatvédelmi rendelet, GDPR);\n- az információs önrendelkezési jogról és az információszabadságról szóló 2011. évi CXII. törvény (Infotv.);\n- a Polgári Törvénykönyvről szóló 2013. évi V. törvény (Ptk.);\n- a gazdasági reklámtevékenység alapvető feltételeiről és egyes korlátairól szóló 2008. évi XLVIII. törvény (Grtv.).\n\n# Az adatkezelő\n\nNév: Xoa98 Kft.\nSzékhely: 1115 Budapest, Tétényi út 10/c.\nAdószám: 12372845-2-43\nE-mail: masterdancetanciskola@gmail.com\nTelefon: +36 (30) 633-6682\nAdatvédelmi felelős: Tran Ba Duy Phuong\nWeboldal: [az MD Dance School weboldalának címe]\n\n# Fogalmak\n\n- Személyes adat: azonosított vagy azonosítható természetes személyre (érintett) vonatkozó bármely információ.\n- Adatkezelés: a személyes adatokon végzett bármely művelet — gyűjtés, rögzítés, tárolás, felhasználás, továbbítás, törlés stb.\n- Adatkezelő: aki a személyes adatok kezelésének céljait és eszközeit meghatározza.\n- Adatfeldolgozó: aki az adatkezelő nevében személyes adatokat kezel.\n- Hozzájárulás: az érintett akaratának önkéntes, konkrét, tájékoztatáson alapuló és egyértelmű kinyilvánítása.\n- Adatvédelmi incidens: a biztonság olyan sérülése, amely a személyes adatok véletlen vagy jogellenes megsemmisítését, elvesztését, módosítását, jogosulatlan közlését vagy az azokhoz való jogosulatlan hozzáférést eredményezi.\n\n# Az adatkezelés elvei\n\nA személyes adatok kezelése során az adatkezelő gondoskodik arról, hogy az adatok:\n\n- kezelése jogszerű, tisztességes és az érintett számára átlátható legyen;\n- gyűjtése csak meghatározott, egyértelmű és jogszerű célból történjen (célhoz kötöttség);\n- a cél szempontjából megfelelőek, relevánsak és szükségesek legyenek (adattakarékosság);\n- pontosak és szükség esetén naprakészek legyenek;\n- tárolása csak a cél eléréséhez szükséges ideig történjen;\n- megfelelő biztonságát technikai és szervezési intézkedésekkel biztosítsa.\n\nAz adatkezelő felelős ezen elvek betartásáért, és képes annak igazolására (elszámoltathatóság).\n\n# A kezelt adatok köre és az adatkezelés célja\n\nTáncórára jelentkezés\n\nKezelt adatok: teljes név, e-mail cím, telefonszám, születési dátum, a választott órák (terem, nap, időpont), korábbi tánctapasztalat (ha megadja), a megjegyzés mezőben önként megadott adatok\n16 év alatti jelentkezőnél: a szülő / törvényes képviselő neve és e-mail címe\nCél: a jelentkezés fogadása, a jelentkezővel (illetve szülőjével) való kapcsolattartás, a csoportba sorolás és az órák szervezése\nJogalap: az érintett önkéntes hozzájárulása — GDPR 6. cikk (1) bek. a) pont\nIdőtartam: az utolsó kapcsolatfelvételtől számított 1 év, vagy a hozzájárulás visszavonásáig\n\n16 év alatti jelentkező esetén a hozzájárulást a szülői felügyeletet gyakorló személy adja meg, ezért az űrlap ilyenkor a szülő adatait is kéri.\n\nTánctábor-jelentkezés\n\nKezelt adatok: a táborlakó neve, születési dátuma, telefonszáma, pólómérete, a kapcsolattartó e-mail címe, a választott turnus, a fizetési mód, a lakcím (számlázási cím), a szülő / gondviselő neve és telefonszáma, a „Fontos tudnivaló” mezőben önként megadott adatok (pl. allergia, étrend), valamint hogy honnan hallott a táborról és ki töltötte ki a jelentkezést\nCél: a tábori jelentkezés fogadása, a férőhely biztosítása, a befizetéssel kapcsolatos tájékoztatás és a tábor szervezése\nJogalap: az érintett (kiskorú esetén a törvényes képviselő) önkéntes hozzájárulása — GDPR 6. cikk (1) bek. a) pont\nIdőtartam: a tábor végétől számított 1 év, vagy a hozzájárulás visszavonásáig\n\nStúdióbérlés (teremfoglalás)\n\nKezelt adatok: név, e-mail cím, telefonszám, az óra típusa, a foglalt terem(ek), dátum(ok) és időpont(ok)\nCél: a foglalási igény fogadása és visszaigazolása, a teremhasználat megszervezése, kapcsolattartás\nA jóváhagyott foglalások adatai (név, telefonszám, e-mail cím, óratípus, időpont, ár) a stúdió belső, nem nyilvános Google Naptárába is bekerülnek, hogy a teremért felelős munkatársak értesüljenek a foglalásról.\nJogalap: az érintett önkéntes hozzájárulása — GDPR 6. cikk (1) bek. a) pont\nIdőtartam: a foglalt időponttól számított 1 év, vagy a hozzájárulás visszavonásáig\n\nKapcsolatfelvétel („Írj nekünk” űrlap, e-mail, telefon, közösségi média)\n\nKezelt adatok: név, e-mail cím, telefonszám, az üzenetben megadott adatok\nCél: a megkeresések megválaszolása, kapcsolattartás\nJogalap: az érintett önkéntes hozzájárulása — GDPR 6. cikk (1) bek. a) pont\nIdőtartam: az utolsó kapcsolatfelvételtől számított 1 év, vagy a hozzájárulás visszavonásáig\n\n# Az adatkezelés módja\n\nAz adatokat az érintett maga adja meg a weboldal űrlapjain (órajelentkezés, tánctábor-jelentkezés, stúdióbérlés, „Írj nekünk”). Az adatkezelő az adatokat elektronikus úton kezeli, azokat csak a fenti célokra használja fel, és nem hoz kizárólag automatizált adatkezelésen alapuló döntést. Az űrlapok a két jelölőnégyzet („Elolvastam és elfogadom…” és „Hozzájárulok…”) bepipálásával és az űrlap elküldésével történik; a pipák nélkül az űrlap nem küldhető el.\n\n# Technikai adatok és sütik (cookie-k)\n\nA weboldal a működéshez szükséges, a felhasználói élményt javító, valamint statisztikai célú sütiket használhat. A statisztikai sütik (pl. Google Analytics, „_ga”) összesített, személyes azonosításra nem alkalmas adatokat gyűjtenek a látogatottságról. A sütik a böngésző beállításaiban bármikor törölhetők vagy letilthatók; ez a weboldal egyes funkcióinak működését befolyásolhatja.\n\n# Adattovábbítás\n\nAz adatkezelő a személyes adatokat harmadik fél részére csak az érintett előzetes hozzájárulásával vagy jogszabályi kötelezettség alapján (pl. hatósági megkeresésre) továbbítja.\n\n# Adatfeldolgozók\n\nTárhelyszolgáltató: [a tárhelyszolgáltató neve, címe — pl. Vercel Inc.]\nAdatbázis (foglalások tárolása): [pl. Supabase Inc.]\nE-mail küldés (értesítések): [pl. Resend]\nFoglalási naptár (a jóváhagyott foglalások belső naptára): Google Ireland Ltd. — Gordon House, Barrow Street, Dublin 4, Írország (Google Naptár)\nWeboldal karbantartás, adatmentés: [a fejlesztő / üzemeltető neve, címe]\nLátogatottság-mérés: Google Ireland Ltd. — Gordon House, Barrow Street, Dublin 4, Írország (Google Analytics)\n\n# Külső szolgáltatók\n\nA weboldal hivatkozásokat tartalmazhat közösségi média felületekre (Instagram, TikTok, Facebook) és beágyazott tartalmakat (pl. videó, térkép) jeleníthet meg. Ezeken a felületeken az adott szolgáltató saját adatkezelési szabályzata az irányadó.\n\n# Adatbiztonság, az adatok megismerése\n\nAz adatkezelő megfelelő technikai és szervezési intézkedésekkel védi az adatokat a jogosulatlan hozzáférés, megváltoztatás, továbbítás, nyilvánosságra hozatal, törlés vagy megsemmisülés ellen. Az adatokhoz csak az adatkezelő erre feljogosított munkatársai, illetve oktatói férhetnek hozzá, kizárólag a fenti célok érdekében.\n\n# Az adatkezelés időtartama, törlés\n\nA személyes adatokat az adatkezelő az 5. pontban megjelölt ideig kezeli. Az adatokat törli, ha kezelésük jogellenes, az adatkezelés célja megszűnt, a tárolási idő lejárt, az érintett visszavonja a hozzájárulását vagy törlést kér, illetve ha ezt bíróság vagy hatóság elrendeli.\n\n# Az érintett jogai\n\n- Tájékoztatás és hozzáférés: tájékoztatást kérhet a róla kezelt adatokról.\n- Helyesbítés: kérheti a pontatlan adatok javítását.\n- Törlés („elfeledtetés”): kérheti adatai törlését.\n- Korlátozás: kérheti az adatkezelés korlátozását.\n- Tiltakozás: tiltakozhat személyes adatainak kezelése ellen.\n- Adathordozhatóság: kérheti adatai tagolt, géppel olvasható formában történő kiadását.\n- A hozzájárulás visszavonása: hozzájárulását bármikor visszavonhatja; ez nem érinti a visszavonás előtti adatkezelés jogszerűségét.\n\nKérelmét postai úton vagy e-mailben (masterdancetanciskola@gmail.com) nyújthatja be. Az adatkezelő a kérelemre legkésőbb egy hónapon belül válaszol; ez a határidő indokolt esetben további két hónappal meghosszabbítható, amiről az érintettet tájékoztatja.\n\n# Jogorvoslati lehetőségek\n\nHa úgy érzi, hogy személyes adatainak kezelése sérti a jogait, kérjük, először forduljon közvetlenül az adatkezelőhöz. Panaszával a felügyeleti hatósághoz is fordulhat:\n\nHatóság: Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH)\nCím: 1055 Budapest, Falk Miksa utca 9–11.\nTelefon: +36 (1) 391-1400\nE-mail: ugyfelszolgalat@naih.hu\nWeboldal: https://naih.hu\n\nJogainak megsértése esetén bírósághoz is fordulhat; a per — az érintett választása szerint — a lakóhelye vagy tartózkodási helye szerinti törvényszék előtt is megindítható.\n";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "fejezet"
  );
}

export function parsePrivacyText(text: string): { intro: PrivacyBlock[]; sections: PrivacySection[] } {
  const intro: PrivacyBlock[] = [];
  const sections: PrivacySection[] = [];
  const used = new Set<string>();
  const chunks = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    while (lines.length && lines[0].startsWith("#")) {
      const title = lines.shift()!.replace(/^#+\s*/, "");
      let id = slugify(title);
      let n = 2;
      while (used.has(id)) id = `${slugify(title)}-${n++}`;
      used.add(id);
      sections.push({ id, title, blocks: [] });
    }
    if (lines.length === 0) continue;
    const target = sections.length ? sections[sections.length - 1].blocks : intro;
    let para: string[] = [];
    let list: string[] = [];
    for (const line of lines) {
      if (/^[-–•]\s+/.test(line)) {
        if (para.length) { target.push({ type: "p", lines: para }); para = []; }
        list.push(line.replace(/^[-–•]\s+/, ""));
      } else {
        if (list.length) { target.push({ type: "ul", items: list }); list = []; }
        para.push(line);
      }
    }
    if (para.length) target.push({ type: "p", lines: para });
    if (list.length) target.push({ type: "ul", items: list });
  }
  return { intro, sections };
}
