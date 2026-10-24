"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAdmin, type LoginState } from "../actions";
import { withBase } from "@/lib/base-path";

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="w-full rounded-xl bg-[#40CFD5] px-5 py-3.5 font-extrabold text-black transition-colors hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40 disabled:cursor-wait disabled:opacity-60">
      {pending ? busy : idle}
    </button>
  );
}

function ErrorText({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {error}
    </p>
  );
}

const initial: LoginState = { step: "email", email: "" };

/** Belépés e-mailes, egyszer használatos kóddal (jelszó nincs). */
export default function LoginForm({ linkError }: { linkError?: string }) {
  const [state, action] = useActionState(loginAdmin, initial);

  if (state.step === "code") {
    return (
      <form action={action} className="mt-8 space-y-5">
        <p className="rounded-xl bg-[#40CFD5]/15 p-3 text-sm font-semibold text-[#087c81]">{state.message}</p>
        <input type="hidden" name="email" value={state.email} />
        <div>
          <label htmlFor="admin-code" className="mb-2 block text-sm font-bold">Belépési kód</label>
          <input id="admin-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={10}
            className="md-input text-center text-2xl tracking-[0.4em]" placeholder="123456" />
        </div>
        <ErrorText error={state.error} />
        <SubmitButton idle="Belépés" busy="Ellenőrzés…" />
        <p className="text-center text-xs text-gray-500">
          Nem jött meg? Nézd meg a spam mappát, vagy{" "}
          <a href={withBase("/admin/belepes")} className="font-bold text-[#087c81] underline">kérj új kódot</a>.
        </p>
      </form>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label htmlFor="admin-email" className="mb-2 block text-sm font-bold">E-mail cím</label>
        <input id="admin-email" name="email" type="email" autoComplete="email" required maxLength={200}
          defaultValue={state.email} className="md-input" placeholder="te@pelda.hu" />
      </div>
      <ErrorText error={state.error ?? linkError} />
      <SubmitButton idle="Kód küldése" busy="Küldés…" />
    </form>
  );
}
