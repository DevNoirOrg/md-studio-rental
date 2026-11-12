"use client";

import { useState } from "react";
import { loadBillingoOptions, savePaymentSettings } from "@/app/admin/panel-actions";
import { Button, Card, Field, PageHeader, SaveBar, inputCls, isSame, textareaCls, useSaver } from "@/components/admin/ui";
import type { EditInfo } from "@/lib/admin-types";
import { STUDIOS, STUDIO_NAMES, VAT_OPTIONS, hasCodePlaceholder, type PaymentSettings, type Studio } from "@/lib/payment-settings";
import type { BillingoOption } from "@/lib/billingo";

interface Status {
  stripe: "live" | "test" | "missing";
  webhook: boolean;
  billingo: boolean;
  mail: boolean;
  webhookUrl: string;
}

const vatLabels: Record<string, string> = {
  "27%": "27% ÁFA",
  AAM: "AAM — alanyi adómentes",
  TAM: "TAM — tárgyi adómentes",
  "18%": "18% ÁFA",
  "5%": "5% ÁFA",
  "0%": "0%",
};

function StatusRow({ ok, label, detail }: { ok: boolean | "warn"; label: string; detail: string }) {
  const tone = ok === true ? "bg-emerald-100 text-emerald-800" : ok === "warn" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-widest ${tone}`}>
        {ok === true ? "OK" : ok === "warn" ? "Teszt" : "Hiányzik"}
      </span>
      <span className="font-bold text-ink">{label}</span>
      <span className="text-sm text-slate-500">{detail}</span>
    </li>
  );
}

function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" className="mt-1 h-5 w-5 accent-md-teal" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-bold text-ink">{label}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

const monthName = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
};

const hourInput = (value: number, onChange: (v: number) => void, id: string) => (
  <input id={id} type="number" min={1} max={720} step={1} className={`${inputCls} max-w-[10rem]`}
    value={Number.isFinite(value) ? value : ""}
    onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
);

export default function PaymentsEditor({ initial, info, loadError, status, months }: {
  initial: PaymentSettings; info: EditInfo; loadError: boolean; status: Status;
  /** az aktuális és a következő hónap ("YYYY-MM") */
  months: string[];
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const { pending, status: saveStatus, save } = useSaver();
  const dirty = !isSame(draft, saved);
  const set = <K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const [options, setOptions] = useState<{ blocks: BillingoOption[]; bankAccounts: BillingoOption[] } | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);

  async function fetchOptions() {
    setLoadingOptions(true);
    setOptionsError("");
    try {
      const result = await loadBillingoOptions();
      if (result.ok) setOptions({ blocks: result.blocks, bankAccounts: result.bankAccounts });
      else setOptionsError(result.error);
    } catch {
      setOptionsError("A Billingo adatai nem tölthetők be.");
    } finally {
      setLoadingOptions(false);
    }
  }

  const usesCode = (studio: Studio) => hasCodePlaceholder(draft.access[studio].hu) || hasCodePlaceholder(draft.access[studio].en);
  const missingCodes = STUDIOS.flatMap((studio) => (usesCode(studio)
    ? months.filter((month) => !draft.codes[studio].some((c) => c.month === month && c.code.trim())).map((month) => ({ studio, month }))
    : []));
  const setCodes = (studio: Studio, list: PaymentSettings["codes"][Studio]) => set("codes", { ...draft.codes, [studio]: list });
  const nextFreeMonth = (studio: Studio) => {
    const taken = new Set(draft.codes[studio].map((c) => c.month));
    let [y, m] = months[0].split("-").map(Number);
    for (let i = 0; i < 36; i++) {
      const month = `${y}-${String(m).padStart(2, "0")}`;
      if (!taken.has(month)) return month;
      m = m === 12 ? 1 : m + 1;
      if (m === 1) y++;
    }
    return months[0];
  };

  const idSelect = (key: "billingoBlockId" | "billingoBankAccountId" | "billingoProformaBlockId", list: BillingoOption[] | undefined, emptyLabel: string) => (
    list ? (
      <select id={key} className={inputCls} value={draft[key] ?? ""}
        onChange={(e) => set(key, e.target.value ? Number(e.target.value) : null)}>
        <option value="">{emptyLabel}</option>
        {list.map((o) => <option key={o.id} value={o.id}>{o.name} (#{o.id})</option>)}
      </select>
    ) : (
      <input id={key} className={inputCls} inputMode="numeric" value={draft[key] ?? ""} placeholder="Azonosító (vagy töltsd be a listát)"
        onChange={(e) => set(key, /^\d+$/.test(e.target.value) ? Number(e.target.value) : null)} />
    )
  );

  return (
    <div>
      <PageHeader
        title="Fizetés és e-mailek"
        description="Online fizetés (Stripe), számlázás (Billingo), fizetési határidő, a bejutási infók e-mail szövege és a havi kódok."
      />
      {loadError && (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          A beállítások nem tölthetők be (most az alapértékek látszanak). Ellenőrizd, hogy lefutott-e a supabase/2026-11-page-content.sql,
          a supabase/2026-11-payments.sql és a supabase/2026-11-calendars-reminders.sql a Supabase SQL Editorban.
        </p>
      )}

      <div className="space-y-6">
        <Card title="Bekötések" description="A titkos kulcsok a Vercel környezeti változóiban vannak (nem itt).">
          <ul className="divide-y divide-slate-100">
            <StatusRow ok={status.stripe === "live" ? true : status.stripe === "test" ? "warn" : false} label="Stripe"
              detail={status.stripe === "live" ? "éles kulcs" : status.stripe === "test" ? "teszt kulcs — próbakártyával fizethető, valódi pénz nem mozog" : "STRIPE_SECRET_KEY"} />
            <StatusRow ok={status.webhook} label="Stripe webhook" detail={status.webhook ? status.webhookUrl : `STRIPE_WEBHOOK_SECRET — végpont: ${status.webhookUrl}`} />
            <StatusRow ok={status.billingo} label="Billingo" detail={status.billingo ? "API kulcs beállítva" : "BILLINGO_API_KEY — nélküle nem készül automatikus számla"} />
            <StatusRow ok={status.mail} label="E-mail küldés (Resend)" detail={status.mail ? "beállítva" : "RESEND_API_KEY / RESEND_FROM_EMAIL"} />
          </ul>
        </Card>

        <Card title="Online fizetés">
          <div className="space-y-5">
            <Toggle id="enabled" checked={draft.enabled} onChange={(v) => set("enabled", v)} label="Online fizetés bekapcsolva"
              hint="Bekapcsolva a jóváhagyó e-mailben fizetési link megy, fizetés után automatikusan megy a számla, a bejutási infók pedig az időpont előtt 24 órával. Kikapcsolva minden úgy működik, mint eddig — csak a visszaigazoló e-mailek mennek ki, fizetési link nélkül." />
            {draft.enabled && status.stripe === "missing" && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">A Stripe nincs bekötve — amíg nincs STRIPE_SECRET_KEY, fizetési link nem megy ki.</p>
            )}
            <Field label="Közeli foglalás (óra)" htmlFor="nearHours"
              hint="Ha jóváhagyáskor az első időpont ennyi órán belül van, nincs határidő: a foglalás bent marad, a fizetési link az időpont után is működik. Az adminban piros, amíg nincs kifizetve; ha az időpont után sem fizet, az utolsó időpont utáni napon délelőtt egy emlékeztetőt kap.">
              {hourInput(draft.nearHours, (v) => set("nearHours", v), "nearHours")}
            </Field>
            <Toggle id="deadlineEnabled" checked={draft.deadlineEnabled} onChange={(v) => set("deadlineEnabled", v)} label="Fizetési határidő a távolabbi foglalásoknál"
              hint="Ha az első időpont távolabb van, az ügyfélnek a jóváhagyástól a megadott ideje van fizetni; 12 órával a lejárat előtt emlékeztetőt kap, ha nem fizet, az időpontok felszabadulnak, és erről ő és a stúdió is e-mailt kap. Kikapcsolva soha nem szabadul fel semmi." />
            {draft.deadlineEnabled && (
              <Field label="Fizetési idő a jóváhagyástól (óra)" htmlFor="payWithinHours" hint="Legkésőbb az első időpont kezdetéig.">
                {hourInput(draft.payWithinHours, (v) => set("payWithinHours", v), "payWithinHours")}
              </Field>
            )}
          </div>
        </Card>

        <Card title="Számlázás (Billingo)" description="A számla fizetéskor automatikusan elkészül (fizetettként, bankkártyás fizetéssel), a Billingo beküldi a NAV-nak és e-mailben elküldi a vevőnek."
          actions={<Button onClick={fetchOptions} disabled={loadingOptions || !status.billingo}>{loadingOptions ? "Betöltés…" : "Számlatömbök betöltése"}</Button>}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Számlatömb" htmlFor="billingoBlockId" hint="Nélküle nem készül automatikus számla.">
              {idSelect("billingoBlockId", options?.blocks, "— nincs kiválasztva —")}
            </Field>
            <Field label="Bankszámla (nem kötelező)" htmlFor="billingoBankAccountId">
              {idSelect("billingoBankAccountId", options?.bankAccounts, "— a Billingo alapértelmezése —")}
            </Field>
            <Field label="Díjbekérő tömb (teszteléshez)" htmlFor="billingoProformaBlockId"
              hint="Amíg a Stripe sandbox (teszt) kulccsal megy, számla helyett díjbekérő készül ebbe a tömbbe — az nem adóügyi bizonylat, nem megy a NAV-hoz. Ha üres, a fenti számlatömböt használja.">
              {idSelect("billingoProformaBlockId", options?.blocks, "— a számlatömb —")}
            </Field>
            <Field label="ÁFA" htmlFor="vat" hint="A könyvelő tudja: tárgyi adómentes (TAM), alanyi adómentes (AAM) vagy 27%.">
              <select id="vat" className={inputCls} value={draft.vat} onChange={(e) => set("vat", e.target.value)}>
                {VAT_OPTIONS.map((v) => <option key={v} value={v}>{vatLabels[v] ?? v}</option>)}
              </select>
            </Field>
            <Field label="Tétel megnevezése" htmlFor="itemName-hu" hint="Utána jön a terem, a dátum és az időpont, pl. „Teremhasználat – Astoria · Nagy Terem, 2026-11-20 14:00–16:00”.">
              <input id="itemName-hu" className={inputCls} value={draft.itemName.hu} onChange={(e) => set("itemName", { ...draft.itemName, hu: e.target.value })} />
            </Field>
            <Field label="Tétel megnevezése angol számlán" htmlFor="itemName-en" hint="Az angol oldalról foglalók angol nyelvű számlát kapnak.">
              <input id="itemName-en" className={inputCls} value={draft.itemName.en} placeholder={draft.itemName.hu}
                onChange={(e) => set("itemName", { ...draft.itemName, en: e.target.value })} />
            </Field>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Megjegyzés a számlán" htmlFor="invoiceComment-hu" hint="Pl. a tárgyi adómentesség jogcíme (a pontos szöveget a könyvelő adja meg).">
              <textarea id="invoiceComment-hu" rows={3} className={textareaCls} value={draft.invoiceComment.hu}
                placeholder="Pl. Az Áfa tv. 86. § (1) bekezdés l) pontja alapján tárgyi adómentes."
                onChange={(e) => set("invoiceComment", { ...draft.invoiceComment, hu: e.target.value })} />
            </Field>
            <Field label="Megjegyzés angol számlán" htmlFor="invoiceComment-en" hint="Ha üres, a magyar megy.">
              <textarea id="invoiceComment-en" rows={3} className={textareaCls} value={draft.invoiceComment.en} placeholder={draft.invoiceComment.hu}
                onChange={(e) => set("invoiceComment", { ...draft.invoiceComment, en: e.target.value })} />
            </Field>
          </div>
          {status.stripe === "test" && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              Teszt üzemmód (Stripe sandbox kulcs): fizetés után számla helyett díjbekérő készül a Billingóban, ami nem megy a NAV-hoz.
              Az éles (sk_live_) kulccsal automatikusan valódi számla készül.
            </p>
          )}
          {optionsError && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{optionsError}</p>}
        </Card>

        <Card title="Bejutási infók" description="Minden foglalási nap előtt 24 órával e-mailben megy (ha 24 órán belüli az időpont, a fizetés után azonnal); amíg nincs kifizetve, helyette a fizetési link megy. Az adminban felvett foglalásnál akkor, ha bepipálod. Ami angolul üres, az angol e-mailben magyarul megy. A {KÓD} helyére a foglalás hónapjának kódja kerül (lent).">
          <div className="grid gap-6 lg:grid-cols-2">
            {STUDIOS.map((studio) => (
              <div key={studio} className="space-y-4 rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-md-teal">{STUDIO_NAMES[studio]}</p>
                {(["hu", "en"] as const).map((lang) => (
                  <Field key={lang} label={lang === "hu" ? "Magyarul" : "Angolul"} htmlFor={`access-${studio}-${lang}`}>
                    <textarea id={`access-${studio}-${lang}`} rows={6} className={textareaCls}
                      placeholder={lang === "hu" ? "Pl. cím, bejárat, kapukód: {KÓD}, emelet, teendők érkezéskor…" : draft.access[studio].hu}
                      value={draft.access[studio][lang]}
                      onChange={(e) => set("access", { ...draft.access, [studio]: { ...draft.access[studio], [lang]: e.target.value } })} />
                  </Field>
                ))}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Havi bejutási kódok" description="Ha a kód havonta változik: írd a bejutási szövegbe a {KÓD} jelet, és itt add meg hónaponként a kódot. Az e-mailbe a foglalási nap hónapjának kódja kerül. Ha arra a hónapra nincs kód, az ügyfél „a bejutási kódot hamarosan külön küldjük” szöveget kap, a stúdió pedig figyelmeztető e-mailt.">
          {missingCodes.length > 0 && (
            <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              Hiányzó kód: {missingCodes.map((c) => `${STUDIO_NAMES[c.studio]} – ${monthName(c.month)}`).join(", ")}.
            </p>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            {STUDIOS.map((studio) => (
              <div key={studio} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-md-teal">{STUDIO_NAMES[studio]}</p>
                {!usesCode(studio) && (
                  <p className="text-sm text-slate-500">A bejutási szövegben nincs {"{KÓD}"} — a kódokat csak akkor használjuk, ha beírod.</p>
                )}
                {draft.codes[studio].map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input type="month" aria-label="Hónap" className={`${inputCls} max-w-[11rem]`} value={c.month}
                      onChange={(e) => setCodes(studio, draft.codes[studio].map((x, j) => (j === i ? { ...x, month: e.target.value } : x)))} />
                    <input aria-label="Kód" className={`${inputCls} min-w-0 flex-1`} value={c.code} placeholder="Kód"
                      onChange={(e) => setCodes(studio, draft.codes[studio].map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
                    <Button onClick={() => setCodes(studio, draft.codes[studio].filter((_, j) => j !== i))}>Törlés</Button>
                  </div>
                ))}
                <Button onClick={() => setCodes(studio, [...draft.codes[studio], { month: nextFreeMonth(studio), code: "" }])}>+ Hónap hozzáadása</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <SaveBar
        dirty={dirty}
        pending={pending}
        status={saveStatus}
        info={info}
        label="Beállítások mentése"
        onSave={() => save(() => savePaymentSettings(draft), undefined, () => setSaved(draft))}
        onReset={() => setDraft(saved)}
      />
    </div>
  );
}
