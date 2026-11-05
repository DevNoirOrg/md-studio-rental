import type { Metadata } from 'next'
import PrivacyPage from '@/components/PrivacyPage'
import { canonicalUrl } from '@/lib/base-path'
import { t } from '@/lib/i18n'

export const metadata: Metadata = {
  title: t('en').meta.privacyTitle,
  description: t('en').meta.privacyDescription,
  alternates: {
    canonical: canonicalUrl('/en/privacy'),
    languages: { hu: canonicalUrl('/adatkezeles'), en: canonicalUrl('/en/privacy'), 'x-default': canonicalUrl('/adatkezeles') },
  },
}

export default function EnglishPrivacyPage() {
  return <PrivacyPage locale="en" />
}
