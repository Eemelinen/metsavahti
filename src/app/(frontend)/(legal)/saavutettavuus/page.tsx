import { LegalDocument } from '@/components/legal/legal-document'

import { legalMetadata, loadLegalDocument } from '../legal-page'

export const metadata = legalMetadata('accessibility')

/** `/saavutettavuus` (Legal artboard `#saavutettavuus`, MV-091): the latest published Saavutettavuusseloste. */
export default async function AccessibilityPage() {
  return <LegalDocument document={await loadLegalDocument('accessibility')} />
}
