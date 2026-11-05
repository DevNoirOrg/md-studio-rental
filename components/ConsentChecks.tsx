'use client'
import type React from 'react'
import { withBase } from '@/lib/base-path'
import { privacyPath } from '@/lib/i18n'
import { useLocale } from './LocaleContext'

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


interface ConsentChecksProps {
  values: Partial<Consents>
  onChange: (key: ConsentKey, checked: boolean) => void
  showErrors?: boolean
  idPrefix?: string
  className?: string
}

export default function ConsentChecks({ values, onChange, showErrors = false, idPrefix = 'consent', className = '' }: ConsentChecksProps) {
  const { locale, d } = useLocale()
  const errors: Record<ConsentKey, string> = { tajekoztato: d.consent.errorPrivacy, adatkezeles: d.consent.errorData }
  const items: Array<{ key: ConsentKey; label: React.ReactNode }> = [
    {
      key: 'tajekoztato',
      label: (
        <>
          {d.consent.privacyRead}{' '}
          <a
            href={withBase(privacyPath(locale))}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[#179da3]"
            onClick={(e) => e.stopPropagation()}
          >
            {d.consent.privacyLink}
          </a>
          {locale === 'en' ? d.consent.privacyEnd : ` ${d.consent.privacyEnd}`}
        </>
      ),
    },
    { key: 'adatkezeles', label: d.consent.data },
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
            {error && <p className="ml-9 mt-1.5 text-[13px] font-semibold text-red-600">{errors[key]}</p>}
          </div>
        )
      })}
    </div>
  )
}
