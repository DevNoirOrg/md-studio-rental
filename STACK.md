# Közös stack (MD Dance School · MD Dance Company · MD Studio Rental · Under Cover)

A négy oldal külön repóban él, de ugyanarra a felépítésre épül — így ami az egyikben
bevált (admin, belépés, feltöltés), az másolással átvihető a többibe.

| Terület | Választás |
| --- | --- |
| Futtatókörnyezet | Node 22 (`.nvmrc`) |
| Keretrendszer | Next.js 16.4 (App Router, Turbopack, `proxy.ts`) |
| UI | React 19.3, TypeScript (strict, `@/*` alias) |
| Stílus | Tailwind 4 a `@tailwindcss/turbopack` loaderrel; a téma a `globals.css` `@theme` blokkjában (nincs `tailwind.config.js` / PostCSS) |
| Animáció | `motion` (`motion/react`) — a `framer-motion` utódja |
| Ikonok | `lucide-react` 1.x; márkaikonok (Instagram, Facebook, YouTube) saját SVG-vel |
| Betűk | `next/font/local`, a woff2 fájlok a repóban (`app/fonts/`) |
| Lint / típus / teszt | ESLint 9 flat config + `eslint-config-next`; `npm run typecheck`; `npm test` (node --test, TypeScript közvetlenül) |
| Adat | Közös Supabase projekt, oldalanként külön séma (`mdschool`, `mdcompany`, `rental`, `undercover`); közvetlen Postgres (`postgres`, transaction pooler), RLS bekapcsolva szabályok nélkül |
| Admin | Supabase Auth e-mailes 6 jegyű kód + séma szintű `admins` tábla; `ADMIN_HOST` aldomain; Server Actionök `zod` validációval; `edit_log`; Cache Components + `updateTag` |
| Fájlok | Supabase Storage, oldalanként saját bucket; feltöltés egyszer használatos aláírt linkkel, képek WebP-re alakítva |
| E-mail | Resend (sima `fetch`) |
| Függőségfrissítés | Dependabot (`.github/dependabot.yml`), heti, csoportosítva |

Verziófrissítésnél mind a négy repóban ugyanarra a minor verzióra lépjünk (Next, React,
eslint-config-next együtt).
