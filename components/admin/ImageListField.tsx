"use client";

/* eslint-disable @next/next/no-img-element -- admin előnézet */
import { useRef, useState } from "react";
import { createUploadTarget } from "@/app/admin/panel-actions";
import { MEDIA_BUCKET, mediaUrl } from "@/lib/room-config";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, IconButton } from "./ui";

/*
  Több kép feltöltése egy teremhez (közvetlenül a Supabase Storage „rental” bucketjébe).
  A böngésző feltöltés előtt WebP-re alakítja és max. 1600 px-re kicsinyíti a képet.
  Az első kép a kártya képe, a többi a terem galériájában jelenik meg.
*/

const MAX_IMAGE_SIDE = 1600;
const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024;

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth || 1200, height: img.naturalHeight || 800, done: () => URL.revokeObjectURL(url) };
  }
}

async function toWebp(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("A böngésző nem tudja feldolgozni a képet.");
  ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
  img.done();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
  if (!blob) throw new Error("Nem sikerült a képet átalakítani.");
  return blob;
}

/** Egy kép feltöltése; visszaadja a Storage-útvonalát (pl. "images/2026/….webp"). */
async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name}: ez nem képfájl.`);
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error(`${file.name}: a kép túl nagy (max. 25 MB).`);
  const blob = await toWebp(file);
  const target = await createUploadTarget("image/webp");
  if (!target.ok) throw new Error(target.error);
  const { error } = await supabaseBrowser()
    .storage.from(MEDIA_BUCKET)
    .uploadToSignedUrl(target.path, target.token, blob, { contentType: "image/webp" });
  if (error) throw new Error("A feltöltés nem sikerült: " + error.message);
  return target.path;
}

export default function ImageListField({
  value,
  onChange,
  max = 20,
}: {
  value: string[];
  /** Frissítő függvényt kap, hogy a párhuzamos feltöltések ne írják felül egymást. */
  onChange: (update: (images: string[]) => string[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  async function handleFiles(files: File[]) {
    setError(null);
    const room = Math.max(0, max - value.length);
    if (files.length > room) setError(`Legfeljebb ${max} kép lehet; csak az első ${room} kerül feltöltésre.`);
    for (const file of files.slice(0, room)) {
      setBusy((n) => n + 1);
      try {
        const path = await uploadImage(file);
        onChange((current) => [...current, path].slice(0, max));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Hiba a feltöltés közben.");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const move = (i: number, d: -1 | 1) =>
    onChange((current) => {
      const next = [...current];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="grid aspect-[4/3] w-full max-w-xs place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-widest text-slate-300">
          Nincs kép
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {value.map((path, i) => (
            <li key={`${path}-${i}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="relative aspect-[4/3] bg-slate-100">
                <img src={mediaUrl(path)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${
                  i === 0 ? "bg-md-cyan text-ink" : "bg-black/60 text-white"
                }`}>
                  {i === 0 ? "Kártyakép" : `${i + 1}.`}
                </span>
              </div>
              <div className="flex items-center justify-end gap-0.5 px-1.5 py-1">
                <IconButton label="Előrébb" onClick={() => move(i, -1)} disabled={i === 0}>←</IconButton>
                <IconButton label="Hátrébb" onClick={() => move(i, 1)} disabled={i === value.length - 1}>→</IconButton>
                <IconButton
                  label="Kép eltávolítása"
                  onClick={() => onChange((current) => current.filter((_, j) => j !== i))}
                  className="hover:!bg-red-50 hover:!text-red-600"
                >
                  ✕
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => inputRef.current?.click()} disabled={busy > 0 || value.length >= max}>
          {busy > 0 ? `Feltöltés… (${busy})` : "+ Képek feltöltése"}
        </Button>
        <p className="text-xs text-slate-400">
          Több képet is kijelölhetsz. Feltöltéskor automatikusan WebP-re alakul és max. 1600 px-re kicsinyül.
          Az első a kártya képe, a többi a galériában látszik.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept="image/*"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void handleFiles(files);
        }}
      />
      {error && <p className="text-sm font-bold text-red-600">{error}</p>}
    </div>
  );
}
