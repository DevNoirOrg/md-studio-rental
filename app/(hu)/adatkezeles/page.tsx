import type { Metadata } from 'next'
import PrivacyPage from '@/components/PrivacyPage'
import { canonicalUrl } from '@/lib/base-path'
import { t } from '@/lib/i18n'

export const metadata: Metadata = {
  title: t('hu').meta.privacyTitle,
  description: t('hu').meta.privacyDescription,
  alternates: {
    canonical: canonicalUrl('/adatkezeles'),
    languages: { hu: canonicalUrl('/adatkezeles'), en: canonicalUrl('/en/privacy'), 'x-default': canonicalUrl('/adatkezeles') },
  },
}

export default function AdatkezelesPage() {
  return <PrivacyPage locale="hu" />
}
