import type { Metadata } from 'next'

import { DataRequestForm } from '@/components/public-forms/data-request-form'
import { PublicFormPage } from '@/components/public-forms/public-form-page'
import { fi } from '@/i18n/fi'

import { submitDataRequest } from './actions'

const copy = fi.publicForms.dataRequest

export const metadata: Metadata = { title: copy.title }

/**
 * `/tietopyynto` (`03-pages.md` (legal), Yhteystiedot artboard `#tietopyynto`, MV-095): a data
 * subject request without an account; `DataRequestReceived` goes to `DPO_EMAIL` and a receipt
 * to the requester.
 */
export default function DataRequestPage() {
  return (
    <PublicFormPage active="data-request" intro={copy.intro} title={copy.title}>
      <DataRequestForm action={submitDataRequest} />
    </PublicFormPage>
  )
}
