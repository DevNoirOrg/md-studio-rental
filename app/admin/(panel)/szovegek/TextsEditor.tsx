"use client";

import { useState } from "react";
import { savePageContent } from "@/app/admin/panel-actions";
import {
  Button, Card, Field, IconButton, PageHeader, SaveBar, StringListEditor, inputCls, isSame, textareaCls, useSaver,
} from "@/components/admin/ui";
import type { EditInfo } from "@/lib/admin-types";
import type { LessonType } from "@/lib/room-config";
import type { PageContent, PageContentSettings, StudioFees } from "@/lib/page-content";

const lessonIds: LessonType[] = ["privat", "kiscsoportos", "csoportos"];
const lessonAdminNames: Record<LessonType, string> = { privat: "Privát óra", kiscsoportos: "Kiscsoportos óra", csoportos: "Csoportos óra" };

/** Bekezdések listája: minden bekezdés egy többsoros mező (hozzáadás, sorrend, törlés). */
function ParagraphsEditor({ items, onChange, addLabel = "+ Új bekezdés", placeholders = [] }: {
  items: string[]; onChange: (items: string[]) => void; addLabel?: string; placeholders?: string[];
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <textarea rows={3} className={textareaCls} value={item} placeholder={placeholders[i]}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <div className="flex flex-col gap-1">
            <IconButton label="Feljebb" onClick={() => move(i, -1)} disabled={i === 0}>↑</IconButton>
            <IconButton label="Lejjebb" onClick={() => move(i, 1)} disabled={i === items.length - 1}>↓</IconButton>
            <IconButton label="Törlés" onClick={() => onChange(items.filter((_, j) => j !== i))} className="hover:!bg-red-50 hover:!text-red-600">✕</IconButton>
          </div>
        </div>
      ))}
      {items.length < 20 && <Button variant="ghost" onClick={() => onChange([...items, ""])}>{addLabel}</Button>}
    </div>
  );
}

function ContentForm({ lang, value, hu, onChange }: {
  lang: "hu" | "en"; value: PageContent; hu: PageContent; onChange: (update: (c: PageContent) => PageContent) => void;
}) {
  const set = <K extends keyof PageContent>(key: K, v: PageContent[K]) => onChange((c) => ({ ...c, [key]: v }));
  const id = (name: string) => `${lang}-${name}`;
  // angolul a magyar szöveg látszik helyőrzőként és a mező alatt
  const hint = (text: string) => (lang === "en" && text ? `Magyarul: ${text}` : undefined);
  const ph = (text: string) => (lang === "en" ? text : undefined);
  const setStudio = (i: number, patch: Partial<StudioFees>) =>
    onChange((c) => ({ ...c, studios: c.studios.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const moveStudio = (i: number, d: -1 | 1) => onChange((c) => {
    const next = [...c.studios];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return { ...c, studios: next };
  });

  return (
    <div className="space-y-6">
      <Card title="1. lépés: óratípusok" description="A „Milyen órát tartanál?” rész címe, alcíme és a három óratípus kártyája. Az óradíjakat és hogy melyik teremben foglalható, a Termek menüben állíthatod.">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Cím" htmlFor={id("lessonTitle")} hint={hint(hu.lessonTitle)}>
            <input id={id("lessonTitle")} className={inputCls} value={value.lessonTitle} placeholder={ph(hu.lessonTitle)}
              onChange={(e) => set("lessonTitle", e.target.value)} />
          </Field>
          <Field label="Alcím" htmlFor={id("lessonLead")} hint={hint(hu.lessonLead)}>
            <input id={id("lessonLead")} className={inputCls} value={value.lessonLead} placeholder={ph(hu.lessonLead)}
              onChange={(e) => set("lessonLead", e.target.value)} />
          </Field>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {lessonIds.map((type) => {
            const l = value.lessons[type];
            const setL = (patch: Partial<typeof l>) =>
              onChange((c) => ({ ...c, lessons: { ...c.lessons, [type]: { ...c.lessons[type], ...patch } } }));
            return (
              <div key={type} className="space-y-4 rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-md-teal">{lessonAdminNames[type]}</p>
                <Field label="Név" htmlFor={id(`${type}-title`)} hint={hint(hu.lessons[type].title)}>
                  <input id={id(`${type}-title`)} className={inputCls} value={l.title} placeholder={ph(hu.lessons[type].title)}
                    onChange={(e) => setL({ title: e.target.value })} />
                </Field>
                <Field label="Létszám (a „Max.” után)" htmlFor={id(`${type}-capacity`)} hint={hint(hu.lessons[type].capacity)}>
                  <input id={id(`${type}-capacity`)} className={inputCls} value={l.capacity} placeholder={ph(hu.lessons[type].capacity)}
                    onChange={(e) => setL({ capacity: e.target.value })} />
                </Field>
                <Field label="Leírás" htmlFor={id(`${type}-description`)} hint={hint(hu.lessons[type].description)}>
                  <textarea id={id(`${type}-description`)} rows={3} className={textareaCls} value={l.description}
                    placeholder={ph(hu.lessons[type].description)} onChange={(e) => setL({ description: e.target.value })} />
                </Field>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Bevezető" description="A naptár alatti szürke doboz első bekezdései.">
        <ParagraphsEditor items={value.intro} onChange={(v) => set("intro", v)} placeholders={lang === "en" ? hu.intro : []} />
      </Card>

      <Card title="Foglalások jóváhagyása">
        <div className="space-y-5">
          <Field label="Cím" htmlFor={id("approvalTitle")} hint={hint(hu.approvalTitle)}>
            <input id={id("approvalTitle")} className={inputCls} value={value.approvalTitle} placeholder={ph(hu.approvalTitle)}
              onChange={(e) => set("approvalTitle", e.target.value)} />
          </Field>
          <Field label="Bekezdések">
            <ParagraphsEditor items={value.approval} onChange={(v) => set("approval", v)} placeholders={lang === "en" ? hu.approval : []} />
          </Field>
        </div>
      </Card>

      <Card title="Bérleti díjak" description="Tájékoztató díjtáblázat — a foglaláskor számolt árat a Termek menüben állíthatod.">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Cím" htmlFor={id("feesTitle")} hint={hint(hu.feesTitle)}>
              <input id={id("feesTitle")} className={inputCls} value={value.feesTitle} placeholder={ph(hu.feesTitle)}
                onChange={(e) => set("feesTitle", e.target.value)} />
            </Field>
            <Field label="Megjegyzés a cím alatt" htmlFor={id("feesNote")} hint={hint(hu.feesNote)}>
              <textarea id={id("feesNote")} rows={2} className={textareaCls} value={value.feesNote} placeholder={ph(hu.feesNote)}
                onChange={(e) => set("feesNote", e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {value.studios.map((studio, i) => (
              <div key={i} className="space-y-4 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-md-teal">{i + 1}. kártya</p>
                  <div className="flex gap-1">
                    <IconButton label="Előrébb" onClick={() => moveStudio(i, -1)} disabled={i === 0}>←</IconButton>
                    <IconButton label="Hátrébb" onClick={() => moveStudio(i, 1)} disabled={i === value.studios.length - 1}>→</IconButton>
                    <IconButton label="Kártya törlése" onClick={() => set("studios", value.studios.filter((_, j) => j !== i))}
                      className="hover:!bg-red-50 hover:!text-red-600">✕</IconButton>
                  </div>
                </div>
                <Field label="Stúdió neve" htmlFor={id(`studio-${i}-title`)} hint={hint(hu.studios[i]?.title ?? "")}>
                  <input id={id(`studio-${i}-title`)} className={inputCls} value={studio.title} placeholder={ph(hu.studios[i]?.title ?? "")}
                    onChange={(e) => setStudio(i, { title: e.target.value })} />
                </Field>
                <Field label="Díjak (soronként)">
                  <StringListEditor items={studio.items} onChange={(items) => setStudio(i, { items })} addLabel="+ Új sor" max={20}
                    placeholder={lang === "en" ? "pl. Small room: HUF 10,000 / hour" : "pl. Kis terem: 10.000 Ft / óra"} />
                </Field>
                <Field label="Halványabb utolsó sor (nem kötelező)" htmlFor={id(`studio-${i}-note`)} hint={hint(hu.studios[i]?.note ?? "")}>
                  <input id={id(`studio-${i}-note`)} className={inputCls} value={studio.note} placeholder={ph(hu.studios[i]?.note ?? "")}
                    onChange={(e) => setStudio(i, { note: e.target.value })} />
                </Field>
              </div>
            ))}
          </div>
          {value.studios.length < 6 && (
            <Button variant="ghost" onClick={() => set("studios", [...value.studios, { title: "", items: [""], note: "" }])}>
              + Új stúdiókártya
            </Button>
          )}

          <Field label="Sor a kártyák alatt" htmlFor={id("feesFooter")} hint={hint(hu.feesFooter)}>
            <input id={id("feesFooter")} className={inputCls} value={value.feesFooter} placeholder={ph(hu.feesFooter)}
              onChange={(e) => set("feesFooter", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Lemondások" description="A címke félkövéren az első bekezdés elején jelenik meg.">
        <div className="space-y-5">
          <Field label="Címke" htmlFor={id("cancelLabel")} hint={hint(hu.cancelLabel)}>
            <input id={id("cancelLabel")} className={`${inputCls} max-w-xs`} value={value.cancelLabel} placeholder={ph(hu.cancelLabel)}
              onChange={(e) => set("cancelLabel", e.target.value)} />
          </Field>
          <Field label="Bekezdések">
            <ParagraphsEditor items={value.cancel} onChange={(v) => set("cancel", v)} placeholders={lang === "en" ? hu.cancel : []} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

export default function TextsEditor({ initial, info, loadError }: { initial: PageContentSettings; info: EditInfo; loadError: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [lang, setLang] = useState<"hu" | "en">("hu");
  const { pending, status, save } = useSaver();
  const dirty = !isSame(draft, saved);

  return (
    <div>
      <PageHeader
        title="Szövegek"
        description="A foglalóoldal óratípus-kártyái és a naptár alatti tájékoztató (jóváhagyás, bérleti díjak, lemondás), magyarul és angolul."
      />
      {loadError && (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          A mentett szövegeket nem sikerült betölteni — most az alapértékek látszanak. Ha még nem futott le a
          supabase/2026-11-page-content.sql, előbb azt kell lefuttatni a Supabase SQL Editorban, különben a mentés sem fog menni.
        </p>
      )}
      <div className="mb-5 flex items-center gap-1 border-b border-slate-200" role="tablist" aria-label="Szerkesztési nyelv">
        {(["hu", "en"] as const).map((code) => (
          <button key={code} type="button" role="tab" aria-selected={lang === code} onClick={() => setLang(code)}
            className={`border-b-2 px-4 py-3 text-sm font-extrabold transition-colors ${
              lang === code ? "border-md-teal text-ink" : "border-transparent text-slate-400 hover:text-ink"
            }`}>
            {code === "hu" ? "Magyar" : "English"}
          </button>
        ))}
      </div>
      {lang === "en" && (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Az angol oldalon (/studio-berles/en) ezek a szövegek látszanak. Ami üresen marad, az ott magyarul jelenik meg.
        </p>
      )}

      <ContentForm
        key={lang}
        lang={lang}
        value={draft[lang]}
        hu={draft.hu}
        onChange={(update) => setDraft((d) => ({ ...d, [lang]: update(d[lang]) }))}
      />

      <SaveBar
        dirty={dirty}
        pending={pending}
        status={status}
        info={info}
        label="Szövegek mentése"
        onSave={() => save(() => savePageContent(draft), undefined, () => setSaved(draft))}
        onReset={() => setDraft(saved)}
      />
    </div>
  );
}
