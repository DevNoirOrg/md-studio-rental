"use client";

import { useState } from "react";
import { loadBillingoOptions, savePaymentSettings } from "@/app/admin/panel-actions";
import { Button, Card, Field, PageHeader, SaveBar, inputCls, isSame, textareaCls, useSaver } from "@/components/admin/ui";
import type { EditInfo } from "@/lib/admin-types";
import { STUDIOS, STUDIO_NAMES, VAT_OPTIONS, type PaymentSettings } from "@/lib/payment-settings";
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

export default function PaymentsEditor({ initial, info, loadError, status }: {
  initial: PaymentSettings; info: EditInfo; loadError: boolean; status: Status;
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

  const idSelect = (key: "billingoBlockId" | "billingoBankAccountId", list: BillingoOption[] | undefined, emptyLabel: string) => (
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
        description="Online fizetés (Stripe), számlázás (Billingo), fizetési határidő és a bejutási infók e-mail szövege."
      />
      {loadError && (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          A beállítások nem tölthetők be (most az alapértékek látszanak). Ellenőrizd, hogy lefutott-e a supabase/2026-11-page-content.sql
          és a supabase/2026-11-payments.sql a Supabase SQL Editorban.
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
              hint="Bekapcsolva a jóváhagyó e-mailben fizetési link megy, fizetés után automatikusan megy a számla és a bejutási infók. Kikapcsolva minden úgy működik, mint eddig — csak a visszaigazoló e-mailek mennek ki, fizetési link nélkül." />
            {draft.enabled && status.stripe === "missing" && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">A Stripe nincs bekötve — amíg nincs STRIPE_SECRET_KEY, fizetési link nem megy ki.</p>
            )}
            <Toggle id="deadlineEnabled" checked={draft.deadlineEnabled} onChange={(v) => set("deadlineEnabled", v)} label="Fizetési határidő"
              hint="Ha az ügyfél a határidőig nem fizet, az időpontok automatikusan felszabadulnak, és erről ő és a stúdió is e-mailt kap. 12 órával a lejárat előtt emlékeztetőt kap. Kikapcsolva a link a foglalás kezdetéig él, a nem fizetőket kézzel kell kezelni." />
            {draft.deadlineEnabled && (
              <Field label="Határidő a jóváhagyástól (óra)" htmlFor="deadlineHours" hint="Legkésőbb az első időpont előtt 2 órával mindenképp lejár.">
                <input id="deadlineHours" type="number" min={3} max={720} step={1} className={`${inputCls} max-w-[10rem]`}
                  value={Number.isFinite(draft.deadlineHours) ? draft.deadlineHours : ""}
                  onChange={(e) => set("deadlineHours", e.target.value === "" ? NaN : Number(e.target.value))} />
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
            <Field label="ÁFA" htmlFor="vat" hint="A könyvelő tudja: alanyi adómentes (AAM) vagy 27%.">
              <select id="vat" className={inputCls} value={draft.vat} onChange={(e) => set("vat", e.target.value)}>
                {VAT_OPTIONS.map((v) => <option key={v} value={v}>{vatLabels[v] ?? v}</option>)}
              </select>
            </Field>
            <div />
            <Field label="Tétel megnevezése" htmlFor="itemName-hu" hint="Utána jön a terem, a dátum és az időpont, pl. „Teremhasználat – Astoria · Nagy Terem, 2026-11-20 14:00–16:00”.">
              <input id="itemName-hu" className={inputCls} value={draft.itemName.hu} onChange={(e) => set("itemName", { ...draft.itemName, hu: e.target.value })} />
            </Field>
            <Field label="Tétel megnevezése angol számlán" htmlFor="itemName-en" hint="Az angol oldalról foglalók angol nyelvű számlát kapnak.">
              <input id="itemName-en" className={inputCls} value={draft.itemName.en} placeholder={draft.itemName.hu}
                onChange={(e) => set("itemName", { ...draft.itemName, en: e.target.value })} />
            </Field>
          </div>
          {optionsError && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{optionsError}</p>}
        </Card>

        <Card title="Bejutási infók" description="A sikeres fizetés után küldött e-mailbe kerül (és az adminban felvett foglalásnál, ha bepipálod). Az e-mailben előtte az időpontok listája áll. Ami angolul üres, az angol e-mailben magyarul megy.">
          <div className="grid gap-6 lg:grid-cols-2">
            {STUDIOS.map((studio) => (
              <div key={studio} className="space-y-4 rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-md-teal">{STUDIO_NAMES[studio]}</p>
                {(["hu", "en"] as const).map((lang) => (
                  <Field key={lang} label={lang === "hu" ? "Magyarul" : "Angolul"} htmlFor={`access-${studio}-${lang}`}>
                    <textarea id={`access-${studio}-${lang}`} rows={6} className={textareaCls}
                      placeholder={lang === "hu" ? "Pl. cím, bejárat, kapukód, emelet, teendők érkezéskor…" : draft.access[studio].hu}
                      value={draft.access[studio][lang]}
                      onChange={(e) => set("access", { ...draft.access, [studio]: { ...draft.access[studio], [lang]: e.target.value } })} />
                  </Field>
                ))}
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
