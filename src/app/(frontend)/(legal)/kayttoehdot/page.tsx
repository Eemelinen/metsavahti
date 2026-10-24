import { LegalDocument } from '@/components/legal/legal-document'

import { legalMetadata, loadLegalDocument } from '../legal-page'

export const metadata = legalMetadata('terms')

/** `/kayttoehdot` (Legal artboard `#kayttoehdot`, MV-091): the latest published Käyttöehdot. */
export default async function TermsPage() {
  return <LegalDocument document={await loadLegalDocument('terms')} />
}
