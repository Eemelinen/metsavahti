import { randomInt } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { type APIRequestContext, type Page, request as playwrightRequest } from '@playwright/test'

import { AUTH_STATE } from '../../playwright.config'
import { createMailpitClient } from '../helpers/mailpit'
import { expect } from './fixtures'

/** Password of every account the auth specs register (passes the zxcvbn ≥ 3 requirement). */
export const ACCOUNT_PASSWORD = 'kuusi-metsa-jarvi-2026'

export const mailpit = createMailpitClient(process.env.MAILPIT_API_URL ?? 'http://localhost:8025')

/**
 * Give this test its own client address (`2001:db8::/32`, the IPv6 documentation prefix): the
 * auth actions key their 5/h limit by `clientIp()`, which reads `x-forwarded-for` first, so
 * the three browser projects and reruns against a reused dev server never share a bucket.
 */
export async function useOwnAddress(page: Page): Promise<void> {
  const ip = `2001:db8:${randomInt(0x10000).toString(16)}:${randomInt(0x10000).toString(16)}::1`
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip })
}

/**
 * Wait until the page's form has hydrated (`data-hydrated`, `useHydrated()`): react-hook-form
 * resets its inputs to their defaults on mount, so a value filled before that is lost (seen
 * on webkit under load).
 */
export async function waitForForm(page: Page): Promise<void> {
  await expect(page.locator('form[data-hydrated]')).toBeAttached()
}

/** `/rekisteroidy` → `/vahvista-sahkoposti?email=`; returns the (unverified) address. */
export async function registerAccount(
  page: Page,
  browserName: string,
  tag: string,
): Promise<string> {
  const email = `${tag}-${browserName}-${Date.now()}@metsavahti.test`
  await page.goto('/rekisteroidy')
  await waitForForm(page)
  await page.getByLabel('Sähköposti').fill(email)
  await page.getByLabel('Salasana', { exact: true }).fill(ACCOUNT_PASSWORD)
  await page.getByLabel('Salasana uudelleen').fill(ACCOUNT_PASSWORD)
  await page.getByLabel(/Olen lukenut/).check()
  await page.getByRole('button', { name: 'Luo tili' }).click()
  await expect(page).toHaveURL(/\/vahvista-sahkoposti\?email=/)
  return email
}

/** The `/vahvista?token=` links sent to `email`, newest first, once `count` have arrived. */
export async function verificationLinks(email: string, count: number): Promise<string[]> {
  const messagesFor = async () =>
    (await mailpit.listMessages()).filter((m) => m.To[0]?.Address === email)
  await expect.poll(async () => (await messagesFor()).length, { timeout: 15_000 }).toBe(count)
  const messages = (await messagesFor()).sort((a, b) => b.Created.localeCompare(a.Created))
  const links: string[] = []
  for (const message of messages) {
    const full = await mailpit.getMessage(message.ID)
    links.push(mailpit.extractFirstLink(full.HTML, '/vahvista?token=')!)
  }
  return links
}

/** The `/uusi-salasana?token=` links sent to `email`, newest first, once `count` have arrived. */
export async function resetLinks(email: string, count: number): Promise<string[]> {
  const messagesFor = async () =>
    (await mailpit.listMessages()).filter(
      (m) => m.To[0]?.Address === email && m.Subject === 'Salasanan palautus',
    )
  await expect.poll(async () => (await messagesFor()).length, { timeout: 15_000 }).toBe(count)
  const messages = (await messagesFor()).sort((a, b) => b.Created.localeCompare(a.Created))
  const links: string[] = []
  for (const message of messages) {
    const full = await mailpit.getMessage(message.ID)
    links.push(mailpit.extractFirstLink(full.HTML, '/uusi-salasana?token=')!)
  }
  return links
}

export type PatchUser = (email: string, data: Record<string, unknown>) => Promise<void>

/**
 * An API context with the seeded admin's session from `auth.setup.ts` (its cookie stays out
 * of the browser). It does not log in again: concurrent logins of one account from the three
 * browser projects can lose a session in Payload's `sessions` array.
 */
export async function adminApi(): Promise<{ api: APIRequestContext; patchUser: PatchUser }> {
  // The cookie is sent as a JWT header: Payload only honours cookies from browser navigations.
  const { cookies } = JSON.parse(await readFile(AUTH_STATE, 'utf8')) as {
    cookies: Array<{ name: string; value: string }>
  }
  const token = cookies.find((c) => c.name === 'payload-token')?.value
  expect(token, 'auth.setup.ts must have stored the admin session').toBeTruthy()
  const api = await playwrightRequest.newContext({
    extraHTTPHeaders: { authorization: `JWT ${token}` },
  })
  const patchUser: PatchUser = async (email, data) => {
    const found = await api.get(`/api/users?where[email][equals]=${encodeURIComponent(email)}`)
    expect(found.ok(), await found.text()).toBeTruthy()
    const { docs } = (await found.json()) as { docs: Array<{ id: number }> }
    expect(docs).toHaveLength(1)
    const res = await api.patch(`/api/users/${docs[0]!.id}`, { data })
    expect(res.ok(), await res.text()).toBeTruthy()
  }
  return { api, patchUser }
}

/** Mark a registered address verified through the admin API (no email round trip). */
export async function markVerified(email: string): Promise<void> {
  const { api, patchUser } = await adminApi()
  try {
    await patchUser(email, { _verified: true })
  } finally {
    await api.dispose()
  }
}

/**
 * A verified account of this test's own (registered through the UI, verified by the admin
 * API), so the login specs never share an account across the three browser projects.
 */
export async function createVerifiedAccount(
  page: Page,
  browserName: string,
  tag: string,
): Promise<string> {
  const email = await registerAccount(page, browserName, tag)
  await markVerified(email)
  return email
}
