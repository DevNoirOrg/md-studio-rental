'use client'
import type React from 'react'
import { PRIVACY_URL } from '@/lib/privacy'

/*
  A két kötelező adatkezelési jelölőnégyzet — minden űrlapon ugyanaz
  (órajelentkezés, stúdióbérlés, „Írj nekünk”; a tánctábor saját, azonos szövegű változatot használ).

  props:
   - values: { tajekoztato: boolean, adatkezeles: boolean }
   - onChange(key, checked)
   - showErrors: a hibák megjelenítése (pl. az első beküldési kísérlet után)
   - idPrefix: egyedi azonosító-előtag, ha egy oldalon több űrlap is van
   - dark: sötét háttérhez
*/
export type ConsentKey = 'tajekoztato' | 'adatkezeles'
export type Consents = Record<ConsentKey, boolean>

export const emptyConsents: Consents = { tajekoztato: false, adatkezeles: false }

export const CONSENT_ERRORS: Record<ConsentKey, string> = {
  tajekoztato: 'Az elküldéshez el kell fogadnod az Adatkezelési tájékoztatót.',
  adatkezeles: 'Az elküldéshez hozzá kell járulnod az adataid kezeléséhez.',
}

export function consentErrors(values: Partial<Consents>) {
  const e: Partial<Record<ConsentKey, string>> = {}
  for (const k of Object.keys(CONSENT_ERRORS) as ConsentKey[]) if (!values[k]) e[k] = CONSENT_ERRORS[k]
  return e
}

interface ConsentChecksProps {
  values: Partial<Consents>
  onChange: (key: ConsentKey, checked: boolean) => void
  showErrors?: boolean
  idPrefix?: string
  className?: string
}

export default function ConsentChecks({ values, onChange, showErrors = false, idPrefix = 'consent', className = '' }: ConsentChecksProps) {
  const items: Array<{ key: ConsentKey; label: React.ReactNode }> = [
    {
      key: 'tajekoztato',
      label: (
        <>
          Elolvastam és elfogadom az{' '}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[#179da3]"
            onClick={(e) => e.stopPropagation()}
          >
            Adatkezelési tájékoztatóban
          </a>{' '}
          foglaltakat.
        </>
      ),
    },
    { key: 'adatkezeles', label: 'Hozzájárulok a fenti adataim Adatkezelő által történő kezeléséhez.' },
  ]

  return (
    <div className={`space-y-4 rounded-3xl bg-gray-50 p-5 sm:p-6 ${className}`}>
      {items.map(({ key, label }) => {
        const id = `${idPrefix}-${key}`
        const checked = !!values[key]
        const error = showErrors && !checked
        return (
          <div key={key} id={`${idPrefix}-${key}-row`}>
            <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
              <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(key, e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-[#40CFD5]/40 ${
                  checked ? 'border-[#40CFD5] bg-[#40CFD5]' : error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                }`}
              >
                {checked && (
                  <svg viewBox="0 0 12 10" className="h-2.5 w-3">
                    <path d="M1 5l3 3 7-7" stroke="#000" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-[15px] font-semibold leading-snug text-black">
                {label} <span className="text-[#1a9ea3]">*</span>
              </span>
            </label>
            {error && <p className="ml-9 mt-1.5 text-[13px] font-semibold text-red-600">{CONSENT_ERRORS[key]}</p>}
          </div>
        )
      })}
    </div>
  )
}
