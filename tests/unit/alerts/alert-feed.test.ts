// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { AlertItem, alertMapHref } from '@/components/alerts/alert-item'
import { fi } from '@/i18n/fi'
import { visibleChangeTypes } from '@/lib/alerts/change-types'
import type { AlertFeedItem } from '@/lib/alerts/feed'
import {
  alertFeedQuery,
  decodeAlertFeedCursor,
  encodeAlertFeedCursor,
  parseAlertFeedQuery,
} from '@/lib/alerts/feed-query'
import { ALERT_CHANGE_TYPES } from '@/payload/collections/Alerts'

const ITEM: AlertFeedItem = {
  id: 12,
  changeType: 'new',
  unread: true,
  watchArea: { id: 3, name: 'Mökki' },
  declarationId: 77,
  cuttingTypeLabel: 'Avohakkuu',
  colourToken: 'uudistus',
  areaHa: 2.4,
  distanceM: 350,
  time: '06.12',
}

afterEach(cleanup)

/**
 * MV-080: the change-type labels and explanations of the feed, which change types it shows,
 * its URL (`?alue=`, `?ennen=` cursor) and the `AlertItem` row.
 */
describe('alert change types (MV-080)', () => {
  it('labels and explains every change type in Finnish', () => {
    expect(Object.keys(fi.alerts.changeType).sort()).toEqual([...ALERT_CHANGE_TYPES].sort())
    expect(fi.alerts.changeType.new.label).toBe('Uusi ilmoitus')
    expect(fi.alerts.changeType.geometry_changed.label).toBe('Rajaus muuttunut')
    expect(fi.alerts.changeType.attributes_changed.label).toBe('Tiedot muuttuneet')
    expect(fi.alerts.changeType.removed.label).toBe('Poistunut aineistosta')
    const copies = Object.values(fi.alerts.changeType)
    expect(new Set(copies.map((c) => c.label)).size).toBe(ALERT_CHANGE_TYPES.length)
    for (const { explanation } of copies) expect(explanation).toMatch(/^[A-ZÄÖ].{20,}\.$/)
  })

  it('agrees with the alert email on the labels', () => {
    for (const type of ALERT_CHANGE_TYPES) {
      expect(fi.alerts.changeType[type].label).toBe(fi.emails.alert.changeLabel[type])
    }
  })

  it('hides removed alerts unless the flag is on', () => {
    expect(visibleChangeTypes(false)).toEqual(['new', 'geometry_changed', 'attributes_changed'])
    expect(visibleChangeTypes(true)).toEqual([...ALERT_CHANGE_TYPES])
  })
})

describe('alert feed URL (MV-080)', () => {
  it('round-trips the cursor with millisecond precision', () => {
    const cursor = { createdAt: '2026-10-24T06:12:34.567Z', id: 42 }
    const encoded = encodeAlertFeedCursor(cursor)
    expect(encoded).toBe(`${Date.parse(cursor.createdAt)}-42`)
    expect(decodeAlertFeedCursor(encoded)).toEqual(cursor)
  })

  it('ignores a malformed cursor or area', () => {
    for (const bad of [
      '',
      'abc',
      '123',
      '123-0',
      '-1-2',
      '123-01',
      '1e3-4',
      `${'9'.repeat(16)}-1`,
    ]) {
      expect(decodeAlertFeedCursor(bad)).toBeNull()
    }
    expect(parseAlertFeedQuery({ alue: 'x', ennen: 'nope' })).toEqual({
      watchAreaId: null,
      cursor: null,
    })
    expect(parseAlertFeedQuery({ alue: '0' }).watchAreaId).toBeNull()
    expect(parseAlertFeedQuery({})).toEqual({ watchAreaId: null, cursor: null })
  })

  it('parses what it builds', () => {
    const cursor = encodeAlertFeedCursor({ createdAt: '2026-10-24T06:12:00.000Z', id: 9 })
    const search = alertFeedQuery({ watchAreaId: 5, cursor })
    expect(search).toBe(`?alue=5&ennen=${cursor}`)
    expect(parseAlertFeedQuery(Object.fromEntries(new URLSearchParams(search)))).toEqual({
      watchAreaId: 5,
      cursor: { createdAt: '2026-10-24T06:12:00.000Z', id: 9 },
    })
    expect(alertFeedQuery({ watchAreaId: null })).toBe('')
    // The first entry of a repeated parameter wins.
    expect(parseAlertFeedQuery({ alue: ['7', '8'] }).watchAreaId).toBe(7)
  })
})

describe('AlertItem (MV-080)', () => {
  it('shows an unread new alert with its facts and the map link', () => {
    render(createElement('ul', null, createElement(AlertItem, { item: ITEM })))
    const row = screen.getByTestId('alert-item')
    expect(row).toHaveAttribute('data-unread')
    expect(row).toHaveTextContent('Avohakkuu')
    expect(row).toHaveTextContent('Uusi ilmoitus')
    expect(row).toHaveTextContent('Lukematon')
    expect(row).toHaveTextContent('Mökki · 2,4 ha · 350 m · klo 06.12')
    expect(row).not.toHaveTextContent(fi.alerts.changeType.new.explanation)
    const link = screen.getByRole('link', { name: 'Näytä kartalla: Avohakkuu, Mökki' })
    expect(link).toHaveAttribute('href', `/ilmoitukset/${ITEM.id}`)
    expect(alertMapHref(ITEM)).toBe(`/ilmoitukset/${ITEM.id}`)
  })

  it.each(['geometry_changed', 'attributes_changed', 'removed'] as const)(
    'explains a %s alert and drops the unread dot once read',
    (changeType) => {
      render(
        createElement(
          'ul',
          null,
          createElement(AlertItem, {
            item: { ...ITEM, changeType, unread: false, distanceM: 1250 },
          }),
        ),
      )
      const row = screen.getByTestId('alert-item')
      expect(row).not.toHaveAttribute('data-unread')
      expect(screen.queryByTestId('unread-dot')).toBeNull()
      expect(row).toHaveTextContent(fi.alerts.changeType[changeType].label)
      expect(row).toHaveTextContent(fi.alerts.changeType[changeType].explanation)
      expect(row).toHaveTextContent('Mökki · 2,4 ha · 1,3 km · klo 06.12')
      expect(row.querySelector(`[data-change-type="${changeType}"] svg`)).not.toBeNull()
    },
  )
})
