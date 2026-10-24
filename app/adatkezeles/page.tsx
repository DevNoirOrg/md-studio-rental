import { Fragment } from 'react'
import type { Metadata } from 'next'
import { canonicalUrl } from '@/lib/base-path'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { parsePrivacyText, privacyText, type PrivacyBlock } from '@/lib/privacy'

export const metadata: Metadata = {
  title: 'Adatkezelési tájékoztató – MD Dance School',
  description: 'Az MD Dance School (Master Dance Tánciskola) adatkezelési tájékoztatója.',
  alternates: { canonical: canonicalUrl('/adatkezeles') },
}

function Blocks({ blocks }: { blocks: PrivacyBlock[] }) {
  return blocks.map((b, i) =>
    b.type === 'ul' ? (
      <ul key={i} className="my-4 list-disc space-y-1.5 pl-6 marker:text-[#179da3]">
        {b.items.map((item, j) => (
          <li key={j}>{item}</li>
        ))}
      </ul>
    ) : (
      <p key={i} className="my-4">
        {b.lines.map((line, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </p>
    ),
  )
}

export default function AdatkezelesPage() {
  const { intro, sections } = parsePrivacyText(privacyText)

  return (
    <main className="bg-white">
      <SiteHeader />
      <section className="px-5 pb-24 pt-36 sm:pt-40">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#179da3]">MD Dance School</p>
          <h1 className="section-title mt-3 text-5xl text-black sm:text-6xl">Adatkezelési tájékoztató</h1>

          {intro.length > 0 && (
            <div className="mt-8 space-y-2 rounded-[1.75rem] border-2 border-yellow-200 bg-yellow-50 px-6 py-5 text-sm font-semibold text-yellow-900">
              {intro.map((b, i) =>
                b.type === 'ul' ? (
                  <ul key={i} className="list-disc pl-5">
                    {b.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{b.lines.join(' ')}</p>
                ),
              )}
            </div>
          )}

          {/* Tartalomjegyzék */}
          <nav className="mt-10 rounded-[2rem] bg-gray-50 p-6 ring-1 ring-black/5 md:p-8">
            <p className="mb-4 text-[11px] font-extrabold uppercase tracking-widest text-gray-400">Tartalom</p>
            <ol className="grid list-decimal gap-x-8 gap-y-2 pl-5 text-sm font-semibold text-gray-600 marker:text-[#179da3] sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a className="hover:text-[#179da3]" href={`#${s.id}`}>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="mt-12 text-[15px] leading-relaxed text-gray-700">
            {sections.map((s, i) => (
              <section key={s.id} className="mt-10 first:mt-0">
                <h2 id={s.id} className="scroll-mt-32 text-2xl font-extrabold text-black">
                  {i + 1}. {s.title}
                </h2>
                <Blocks blocks={s.blocks} />
              </section>
            ))}
          </article>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}
