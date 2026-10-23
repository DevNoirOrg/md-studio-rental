"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAdmin } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="w-full rounded-xl bg-[#40CFD5] px-5 py-3.5 font-extrabold text-black transition-colors hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40 disabled:cursor-wait disabled:opacity-60">
      {pending ? "Bejelentkezés…" : "Bejelentkezés"}
    </button>
  );
}

export default function LoginForm() {
  const [state, action] = useActionState(loginAdmin, { error: "" });
  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label htmlFor="admin-username" className="mb-2 block text-sm font-bold">Felhasználónév</label>
        <input id="admin-username" name="username" autoComplete="username" required maxLength={200}
          className="md-input" placeholder="Felhasználónév" />
      </div>
      <div>
        <label htmlFor="admin-password" className="mb-2 block text-sm font-bold">Jelszó</label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password"
          required maxLength={200} className="md-input" placeholder="Jelszó" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
