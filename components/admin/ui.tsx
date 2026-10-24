"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ActionResult, EditInfo } from "@/lib/admin-types";

/*
  Az admin felület közös építőkockái: kártya, mező, gombok, mentés-sáv,
  szöveglista-szerkesztő.
*/

export const inputCls =
  "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-[15px] font-medium text-ink placeholder:text-slate-300 focus:border-md-cyan focus:outline-none transition-colors";
export const textareaCls = inputCls + " leading-relaxed resize-y";

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-black text-ink md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[1.75rem] bg-white p-5 shadow-[0_10px_30px_-18px_rgba(20,19,22,0.35)] md:p-7 ${className}`}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-extrabold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-ink text-white hover:bg-md-teal",
  secondary: "bg-md-pale text-md-teal hover:bg-md-cyan hover:text-white",
  danger: "bg-red-50 text-red-700 hover:bg-red-600 hover:text-white",
  ghost: "text-slate-500 hover:bg-slate-100 hover:text-ink",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return <button type="button" className={`${btnBase} ${btnVariants[variant]} ${className}`} {...props} />;
}

export function IconButton({ label, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent ${className}`}
      {...props}
    />
  );
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("hu-HU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EditInfoLine({ info }: { info: EditInfo }) {
  if (!info) return null;
  return (
    <p className="text-xs font-medium text-slate-400">
      Utoljára módosította: <span className="font-bold text-slate-500">{info.updatedBy}</span>,{" "}
      {formatDateTime(info.updatedAt)}
    </p>
  );
}

/**
 * Mentés kezelése: pending állapot, siker/hiba üzenet, majd az admin oldal
 * frissítése (router.refresh), hogy az "utoljára módosította" sor is frissüljön.
 */
export function useSaver() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (status?.type !== "ok") return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  function save(fn: () => Promise<ActionResult>, okText = "Mentve — az oldalon is frissült.", onOk?: (r: ActionResult) => void) {
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          setStatus(res.warning ? { type: "warn", text: res.warning } : { type: "ok", text: okText });
          onOk?.(res);
          router.refresh();
        } else {
          setStatus({ type: "error", text: res.error });
        }
      } catch {
        setStatus({ type: "error", text: "Nem sikerült menteni. Ellenőrizd a kapcsolatot, és próbáld újra." });
      }
    });
  }

  return { pending, status, save, setStatus };
}

export type Status = { type: "ok" | "warn" | "error"; text: string } | null;

export function StatusText({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      role="status"
      className={`text-sm font-bold ${status.type === "ok" ? "text-emerald-600" : status.type === "warn" ? "text-amber-700" : "text-red-600"}`}
    >
      {status.type === "ok" ? "✓ " : ""}
      {status.text}
    </p>
  );
}

/** Ragadós mentés-sáv a szerkesztők alján. */
export function SaveBar({
  dirty,
  pending,
  status,
  onSave,
  onReset,
  info,
  label = "Mentés",
}: {
  dirty: boolean;
  pending: boolean;
  status: Status;
  onSave: () => void;
  onReset?: () => void;
  info?: EditInfo;
  label?: string;
}) {
  // figyelmeztetés, ha mentetlen változással hagyná el az oldalt
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-slate-200 bg-mist/95 px-4 py-4 backdrop-blur md:-mx-10 md:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={onSave} disabled={pending || !dirty}>
          {pending ? "Mentés…" : label}
        </Button>
        {onReset && dirty && !pending && (
          <Button variant="ghost" onClick={onReset}>
            Változások elvetése
          </Button>
        )}
        <div className="min-w-0 flex-1">
          {status ? (
            <StatusText status={status} />
          ) : dirty ? (
            <p className="text-sm font-bold text-amber-600">Mentetlen változások</p>
          ) : (
            <EditInfoLine info={info ?? null} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Szövegek listája (hozzáadás, törlés, sorrend). */
export function StringListEditor({
  items,
  onChange,
  placeholder,
  addLabel = "+ Új sor",
  max = 12,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  max?: number;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            className={inputCls}
            value={item}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <IconButton label="Feljebb" onClick={() => move(i, -1)} disabled={i === 0}>
            ↑
          </IconButton>
          <IconButton label="Lejjebb" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
            ↓
          </IconButton>
          <IconButton label="Törlés" onClick={() => onChange(items.filter((_, j) => j !== i))} className="hover:!bg-red-50 hover:!text-red-600">
            ✕
          </IconButton>
        </div>
      ))}
      {items.length < max && (
        <Button variant="ghost" onClick={() => onChange([...items, ""])}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}

/** Mélyen összehasonlít két JSON-szerű értéket (mentetlen változás jelzéshez). */
export function isSame(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
