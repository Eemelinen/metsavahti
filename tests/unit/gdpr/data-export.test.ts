import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  EXPORT_READY_SUBJECT,
  exportDownloadUrl,
  formatArchiveSize,
  renderExportReady,
} from '@/emails/ExportReady'
import { effectiveExportStatus } from '@/lib/account/data-export'
import { accountJson, watchAreasGeoJson, zipDataExport } from '@/lib/jobs/export'
import { checkToken, signToken, verifyToken } from '@/lib/tokens'
import type { User, WatchArea } from '@/payload-types'

const ATTRIBUTION = 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 10/2026'

/** MV-093: the pure parts of the account export (token check, archive, email). */
describe('account data export (MV-093)', () => {
  describe('checkToken', () => {
    const claims = { sub: '7', jti: '3' }

    it('tells a genuine expired link apart from a forged or foreign one', async () => {
      const issued = new Date('2026-10-01T12:00:00Z')
      const token = await signToken('data-export', claims, 3600, issued)
      const before = new Date('2026-10-01T12:30:00Z')
      const after = new Date('2026-10-01T14:00:00Z')

      await expect(checkToken('data-export', token, before)).resolves.toMatchObject({
        status: 'valid',
        claims,
      })
      await expect(checkToken('data-export', token, after)).resolves.toMatchObject({
        status: 'expired',
        claims,
      })
      await expect(verifyToken('data-export', token, after)).resolves.toBeNull()
      // Another purpose, expired or not, is invalid; so is a broken signature.
      await expect(checkToken('map-image', token, before)).resolves.toEqual({ status: 'invalid' })
      await expect(checkToken('map-image', token, after)).resolves.toEqual({ status: 'invalid' })
      await expect(checkToken('data-export', `${token}x`, after)).resolves.toEqual({
        status: 'invalid',
      })
    })
  })

  it('counts a pending or ready request past its expiry as expired', () => {
    const now = new Date('2026-10-02T00:00:00Z')
    const past = '2026-10-01T23:59:59Z'
    const future = '2026-10-02T00:00:01Z'
    expect(effectiveExportStatus({ status: 'ready', expiresAt: future }, now)).toBe('ready')
    expect(effectiveExportStatus({ status: 'ready', expiresAt: past }, now)).toBe('expired')
    expect(effectiveExportStatus({ status: 'pending', expiresAt: past }, now)).toBe('expired')
    expect(effectiveExportStatus({ status: 'failed', expiresAt: past }, now)).toBe('failed')
  })

  describe('archive', () => {
    it('keeps credentials and tokens out of account.json', () => {
      const user = {
        id: 5,
        email: 'anna@example.fi',
        role: 'user',
        hash: 'h',
        salt: 's',
        resetPasswordToken: 't',
        pendingEmailTokenId: 'j',
        sessions: [{ id: 'x' }],
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-02T00:00:00Z',
      } as unknown as User
      const json = accountJson(user)
      expect(json).toMatchObject({ id: 5, email: 'anna@example.fi' })
      expect(JSON.stringify(json)).not.toMatch(/"(hash|salt|resetPasswordToken|sessions)"/)
      expect(json).not.toHaveProperty('pendingEmailTokenId')
    })

    it('writes the watch areas as a WGS 84 FeatureCollection of points', () => {
      const area = {
        id: 9,
        name: 'Mökki',
        center: [27.68, 62.89],
        radiusM: 800,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      } as unknown as WatchArea
      expect(watchAreasGeoJson([area])).toEqual({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 9,
            geometry: { type: 'Point', coordinates: [27.68, 62.89] },
            properties: expect.objectContaining({ name: 'Mökki', radiusM: 800 }),
          },
        ],
      })
    })

    it('zips the files so they unzip to the same text', () => {
      const files = { 'account.json': '{"a":1}\n', 'alerts.json': '[]\n' }
      const zip = zipDataExport(files)
      expect(Array.from(zip.subarray(0, 2))).toEqual([0x50, 0x4b])
      const back = unzipSync(zip)
      expect(Object.fromEntries(Object.entries(back).map(([n, d]) => [n, strFromU8(d)]))).toEqual(
        files,
      )
    })
  })

  describe('ExportReady email', () => {
    it('renders the signed link, the contents, the size, the expiry and the attribution', async () => {
      expect(EXPORT_READY_SUBJECT).toBe('Tietojen vienti on valmis')
      const { html, text } = await renderExportReady({
        requestId: 12,
        token: 'abc.def',
        files: ['account.json', 'watch-areas.geojson'],
        sizeBytes: 48 * 1024,
        expiresAt: '25.10.2026 klo 14.32',
        baseUrl: 'https://metsavahti.test',
        attribution: ATTRIBUTION,
      })
      const url = exportDownloadUrl('https://metsavahti.test', 12, 'abc.def')
      expect(url).toBe('https://metsavahti.test/api/account/export/12?token=abc.def')
      expect(html).toContain(url)
      expect(html).toContain('Lataa tiedot (zip, 48 kt)')
      expect(html).toContain('account.json, watch-areas.geojson')
      expect(html).toContain('25.10.2026 klo 14.32 (24 h)')
      expect(html).toContain(ATTRIBUTION)
      expect(text).toContain(url)
      expect(text).toContain(ATTRIBUTION)
    })

    it('formats the archive size in kilo- and megabytes', () => {
      expect(formatArchiveSize(200)).toBe('1 kt')
      expect(formatArchiveSize(48 * 1024)).toBe('48 kt')
      expect(formatArchiveSize(1.25 * 1024 * 1024)).toBe('1,3 Mt')
    })
  })
})
