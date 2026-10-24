import type { Metadata } from 'next'

import { ContactForm } from '@/components/public-forms/contact-form'
import { PublicFormPage } from '@/components/public-forms/public-form-page'
import { fi } from '@/i18n/fi'

import { submitContact } from './actions'

const copy = fi.publicForms.contact

export const metadata: Metadata = { title: copy.title, alternates: { canonical: '/yhteystiedot' } }

/**
 * `/yhteystiedot` (`03-pages.md` (marketing), Yhteystiedot artboard, MV-095): the contact form
 * next to the service's addresses; a message goes to `CONTACT_EMAIL` as `ContactReceived`.
 */
export default function ContactPage() {
  return (
    <PublicFormPage active="contact" intro={copy.intro} title={copy.title}>
      <ContactForm action={submitContact} />
    </PublicFormPage>
  )
}
