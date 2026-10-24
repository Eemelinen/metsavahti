import { LegalDocument } from '@/components/legal/legal-document'

import { legalMetadata, loadLegalDocument } from '../legal-page'

export const metadata = legalMetadata('privacy')

/** `/tietosuoja` (Legal artboard `#tietosuoja`, MV-091): the latest published Tietosuojaseloste. */
export default async function PrivacyPage() {
  return <LegalDocument document={await loadLegalDocument('privacy')} />
}
