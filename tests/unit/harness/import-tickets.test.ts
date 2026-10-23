import { describe, expect, it } from 'vitest'

import path from 'node:path'

import {
  TICKETS_DIR,
  deriveVerification,
  featureIdFor,
  headingAnchor,
  mergeFeatures,
  parseDependencies,
  parseTicketFile,
  readTickets,
  ticketToFeature,
} from '../../../scripts/import-tickets'
import {
  validateFeatureList,
  type Feature,
  type FeatureList,
} from '../../../scripts/validate-feature-list'

const sample = `# E03 — Authentication (MV-040…MV-049)

### MV-042 Registration

**Goal:** \`/rekisteroidy\` + Server Action \`register\`; rate limit 5/h/IP. **Tests:** unit schema; integration: user + consent rows; E2E \`@smoke\` register flow. **Depends on:** MV-040, MV-041, MV-035

### MV-049 Auth E2E suite

**Goal:** Consolidated E2E covering all E03 flows. **Depends on:** MV-042…MV-046

# E09 — Marketing Site (MV-100…MV-105)

### MV-101 \`/miten-se-toimii\`

Long-form page with two SVG illustrations. **Depends on:** MV-011
`

describe('import-tickets parser', () => {
  const tickets = parseTicketFile(sample, path.join(TICKETS_DIR, 'E03-auth.md'))

  it('reads headings, goals, tests and dependencies, switching epic at H1', () => {
    expect(tickets.map((t) => t.id)).toEqual(['MV-042', 'MV-049', 'MV-101'])
    const reg = tickets[0]
    expect(reg?.epic).toBe('E03')
    expect(reg?.title).toBe('Registration')
    expect(reg?.goal).toMatch(/^`\/rekisteroidy` \+ Server Action/)
    expect(reg?.tests).toBe(
      'unit schema; integration: user + consent rows; E2E `@smoke` register flow.',
    )
    expect(reg?.dependsOn).toBe('MV-040, MV-041, MV-035')
    expect(reg?.anchor).toBe('mv-042-registration')
    const marketing = tickets[2]
    expect(marketing?.epic).toBe('E09')
    expect(marketing?.title).toBe('/miten-se-toimii')
    expect(marketing?.goal).toBe('Long-form page with two SVG illustrations.')
  })

  it('expands ranges and epics in dependencies and maps ids', () => {
    const self = tickets[1] as (typeof tickets)[number]
    expect(parseDependencies('MV-042…MV-046', tickets, self)).toEqual(['MV-042'])
    expect(parseDependencies('MV-040, E09', tickets, self)).toEqual(['MV-040', 'MV-101'])
    expect(featureIdFor('MV-042')).toBe('F-042')
    expect(featureIdFor('MV-002')).toBe('F-001')
    expect(headingAnchor('MV-067 Watch-area detail `/vahtialueet/[id]`')).toBe(
      'mv-067-watch-area-detail-vahtialueetid',
    )
  })

  it('derives one verification step per named layer, manual when none', () => {
    const reg = tickets[0] as (typeof tickets)[number]
    const steps = deriveVerification(reg)
    expect(steps[0]).toBe('L1: pnpm check')
    expect(
      steps.some((s) => s.startsWith('L1: pnpm test:unit -- tests/unit/auth/registration.test.ts')),
    ).toBe(true)
    expect(
      steps.some((s) =>
        s.startsWith('L2: pnpm test:integration -- tests/integration/registration.int.test.ts'),
      ),
    ).toBe(true)
    expect(
      steps.some((s) => s.startsWith('L3: pnpm test:e2e -- tests/e2e/registration.spec.ts')),
    ).toBe(true)
    const marketing = tickets[2] as (typeof tickets)[number]
    expect(deriveVerification(marketing)).toEqual([
      'L1: pnpm check',
      'manual: Long-form page with two SVG illustrations.',
    ])
  })

  it('produces a valid feature with spec and design links', () => {
    const reg = tickets[0] as (typeof tickets)[number]
    const feature = ticketToFeature(
      reg,
      tickets,
      { 'MV-042': ['docs/design/App.dc.html#route=rekisteroidy'] },
      'n/a',
    )
    expect(feature.id).toBe('F-042')
    expect(feature.depends_on).toEqual(['F-035', 'F-040', 'F-041'])
    expect(feature.spec).toBe('docs/product/tickets/E03-auth.md#mv-042-registration')
    expect(feature.design).toEqual(['docs/design/App.dc.html#route=rekisteroidy'])
    expect(feature.notes).toMatch(/Was F-002/)
  })
})

describe('mergeFeatures', () => {
  const base = (overrides: Partial<Feature> & Pick<Feature, 'id'>): Feature => ({
    priority: Number(overrides.id.slice(2)),
    area: 'x',
    title: overrides.id,
    user_visible_behavior: 'b',
    status: 'not_started',
    depends_on: [],
    verification: ['L1: pnpm check'],
    evidence: [],
    attempts: 0,
    notes: '',
    ...overrides,
  })
  const existing: FeatureList = {
    project: 'p',
    last_updated: '2026-09-06',
    rules: {
      single_active_feature: true,
      passing_requires_evidence: true,
      do_not_skip_verification: true,
    },
    status_legend: { not_started: 'a', in_progress: 'b', blocked: 'c', passing: 'd' },
    features: [
      base({ id: 'F-013', status: 'passing', evidence: ['ok'], title: 'harness' }),
      base({ id: 'F-042', status: 'in_progress', title: 'old title', ticket: 'MV-042' }),
      base({ id: 'F-062', status: 'blocked', notes: 'needs key', ticket: 'MV-062', attempts: 1 }),
      base({ id: 'F-070', status: 'not_started', title: 'stale', ticket: 'MV-070', attempts: 1 }),
    ],
  }

  it('keeps active/verified features, preserves blocked state and regenerates the rest', () => {
    const merged = mergeFeatures(existing, [
      base({ id: 'F-042', title: 'new title', ticket: 'MV-042', spec: 's' }),
      base({ id: 'F-062', title: 'geocoding', ticket: 'MV-062', notes: 'generated' }),
      base({ id: 'F-070', title: 'fresh', ticket: 'MV-070' }),
    ])
    const byId = (id: string) => merged.features.find((f) => f.id === id) as Feature
    expect(byId('F-013').status).toBe('passing')
    expect(byId('F-042').title).toBe('old title')
    expect(byId('F-042').spec).toBe('s')
    expect(byId('F-062').status).toBe('blocked')
    expect(byId('F-062').notes).toBe('needs key')
    expect(byId('F-062').attempts).toBe(1)
    expect(byId('F-070').title).toBe('fresh')
    expect(byId('F-070').attempts).toBe(1)
    expect(() => validateFeatureList(merged)).not.toThrow()
  })
})

describe('committed tickets', () => {
  it('parse into unique ids with resolvable dependencies', () => {
    const tickets = readTickets()
    const ids = new Set(tickets.map((t) => t.id))
    expect(ids.size).toBe(tickets.length)
    // 111 tickets at import (2026-09-06); 90 after the 2026-09-20 merge (00-deviations P11).
    expect(tickets.length).toBeGreaterThan(80)
    for (const t of tickets) {
      for (const dep of parseDependencies(t.dependsOn, tickets, t)) {
        expect(ids.has(dep), `${t.id} depends on unknown ${dep}`).toBe(true)
      }
    }
  })
})
