import { render } from '@react-email/render'
import type { ReactElement } from 'react'

export type RenderedEmail = { html: string; text: string }

/**
 * Render a React Email element to the `html` + `text` pair `payload.sendEmail` expects.
 * Every template goes through here so both parts always come from the same tree.
 */
export async function renderEmail(element: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { html, text }
}
