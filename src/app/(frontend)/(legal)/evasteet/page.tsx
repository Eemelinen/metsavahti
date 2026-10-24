import { CookieSettingsButton } from '@/components/cookie-settings-button'
import { CookieTable } from '@/components/legal/cookie-table'
import { LegalDocument } from '@/components/legal/legal-document'
import { fi } from '@/i18n/fi'

import { legalMetadata, loadLegalDocument } from '../legal-page'

export const metadata = legalMetadata('cookies')

/**
 * `/evasteet` (Legal artboard `#evasteet`, MV-091): the latest published cookie policy, with
 * "Avaa evästeasetukset" (opens the consent modal of MV-090) and, as its first section, the
 * cookie table from `config/cookies.ts`.
 */
export default async function CookiesPage() {
  return (
    <LegalDocument
      actions={
        <CookieSettingsButton className="min-h-11 rounded-lg bg-forest-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-forest-600">
          {fi.legal.openCookieSettings}
        </CookieSettingsButton>
      }
      document={await loadLegalDocument('cookies')}
      extraSections={[
        { id: 'kaytetyt-evasteet', title: fi.legal.cookieTable.title, content: <CookieTable /> },
      ]}
    />
  )
}
