/**
 * Import the product tickets (docs/product/tickets/*.md) into feature_list.json so the loop
 * can work on them (docs/product/README.md, docs/product/00-deviations.md P9/P10).
 *
 *   pnpm harness:import-tickets            print what would change
 *   pnpm harness:import-tickets --write    rewrite feature_list.json
 *
 * Ticket format: `# E03 — …` sets the epic; `### MV-042 Title` starts a ticket; the body holds
 * `**Goal:**`, `**Tests:**`, `**Acceptance:**`, `**Status:**` and `**Depends on:**` markers
 * (E09–E12 use a plain paragraph instead of `**Goal:**`). Ticket MV-NNN becomes feature F-NNN,
 * except the mappings in `ID_MAP`. Existing features that are `in_progress` or `passing` are
 * never touched; `blocked` ones keep their status and notes; everything else is regenerated.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  FEATURE_LIST_PATH,
  readFeatureList,
  today,
  writeFeatureList,
  type Feature,
  type FeatureList,
} from './validate-feature-list'

const ROOT = path.dirname(FEATURE_LIST_PATH)
export const TICKETS_DIR = path.join(ROOT, 'docs/product/tickets')
export const DESIGN_MAP_PATH = path.join(ROOT, 'docs/design/design-map.json')

/** Tickets whose feature id is not F-<number>. */
export const ID_MAP: Record<string, string> = {
  'MV-001': 'F-000', // repository scaffold = harness bootstrap
  'MV-002': 'F-001', // strict TypeScript
  'MV-005': 'F-016', // design tokens = design-system feature
}

/** Notes carried over from the hand-written features that the tickets replace (P9). */
const FOLDED_NOTES: Record<string, string> = {
  'MV-042': 'Was F-002 (sign-up page); route is /rekisteroidy, not /signup (00-deviations R1).',
  'MV-043': 'Was F-003 (verification link activates the account).',
  'MV-064': 'Was F-004 (create a watch area from the dashboard).',
  'MV-066': 'Was F-004/F-006 (dashboard list; alert list moved to /ilmoitukset, 00-deviations R4).',
  'MV-065':
    'Was F-005 (pick the centre by clicking the map; WebKit map interaction is flaky in CI, chromium-only is acceptable).',
  'MV-080': 'Was F-006 (alert list; now its own page).',
  'MV-067':
    'Was F-007 (matched declarations overlay; 3067 → 4326 conversion; spatial SQL only in spatial-queries.ts).',
  'MV-072':
    'Was F-008 (attribute-level change detection; attr_hash next to geom_hash supersedes D-006).',
  'MV-024':
    'Was F-009 (hakkuutapa labels verified against the Metsäkeskus code list; link the code list in the config).',
  'MV-048':
    'Was F-010 (Postgres-based limiter preferred over Upstash to avoid a new external service).',
  'MV-062':
    'Was F-011. Blocked: needs MML_API_KEY (slot exists in .env.example). Implement behind a Geocoder interface so the provider can change.',
}
const FOLDED_BLOCKED = new Set(['MV-062'])

const EPIC_AREA: Record<string, string> = {
  E00: 'infra',
  E01: 'wfs',
  E02: 'data-model',
  E03: 'auth',
  E04: 'account',
  E05: 'watch-areas',
  E06: 'pipeline',
  E07: 'alerts',
  E08: 'gdpr',
  E09: 'marketing',
  E10: 'a11y',
  E11: 'ops',
  E12: 'launch',
}
const HUMAN_ONLY_EPICS = new Set(['E11', 'E12'])

export interface Ticket {
  id: string
  epic: string
  title: string
  goal: string
  tests?: string
  acceptance?: string
  status?: string
  dependsOn: string
  file: string
  anchor: string
}

const markerNames = ['Goal', 'Tests', 'Acceptance', 'Status', 'Depends on'] as const

function extract(body: string, marker: string): string | undefined {
  const re = new RegExp(
    `\\*\\*${marker}:\\*\\*\\s*([\\s\\S]*?)(?=\\s*\\*\\*(?:${markerNames.join('|')}):\\*\\*|$)`,
  )
  const m = re.exec(body)
  return m?.[1]?.trim().replace(/\s+/g, ' ')
}

/** GitHub-style heading anchor for `### MV-042 Registration`. */
export function headingAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function parseTicketFile(content: string, file: string): Ticket[] {
  const tickets: Ticket[] = []
  let epic = /^(E\d{2})/.exec(path.basename(file))?.[1] ?? 'E00'
  let current: { id: string; title: string; heading: string; lines: string[] } | undefined
  const flush = () => {
    if (!current) return
    const body = current.lines.join(' ').trim()
    const goal =
      extract(body, 'Goal') ??
      body.split(/\s\*\*(?:Tests|Acceptance|Status|Depends on):\*\*/)[0]?.trim() ??
      ''
    tickets.push({
      id: current.id,
      epic,
      title: current.title,
      goal,
      tests: extract(body, 'Tests'),
      acceptance: extract(body, 'Acceptance'),
      status: extract(body, 'Status'),
      dependsOn: extract(body, 'Depends on') ?? '',
      file,
      anchor: headingAnchor(current.heading),
    })
    current = undefined
  }
  for (const line of content.split('\n')) {
    const h1 = /^# (E\d{2}) —/.exec(line)
    if (h1?.[1]) {
      flush()
      epic = h1[1]
      continue
    }
    const h3 = /^### (MV-\d{3}) (.+)$/.exec(line)
    if (h3?.[1] && h3[2]) {
      flush()
      current = {
        id: h3[1],
        title: h3[2].replace(/`/g, '').trim(),
        heading: line.slice(4),
        lines: [],
      }
      continue
    }
    if (current && line.trim()) current.lines.push(line.trim())
  }
  flush()
  return tickets
}

export function featureIdFor(ticketId: string): string {
  return ID_MAP[ticketId] ?? `F-${ticketId.slice(3)}`
}

/** Expand `MV-042…MV-046`, `MV-040, MV-041`, `E05, E07`, `all` into ticket ids. */
export function parseDependencies(text: string, all: Ticket[], self: Ticket): string[] {
  const ids = new Set<string>()
  const byEpic = (epic: string) =>
    all.filter((t) => t.epic === epic && t.id !== self.id).map((t) => t.id)
  const number = (id: string) => Number(id.slice(3))
  for (const range of text.matchAll(/(MV-\d{3})\s*(?:…|\.\.\.|–|-)\s*(MV-\d{3})/g)) {
    const [from, to] = [number(range[1] ?? ''), number(range[2] ?? '')]
    for (const t of all) if (number(t.id) >= from && number(t.id) <= to) ids.add(t.id)
  }
  const withoutRanges = text.replace(/(MV-\d{3})\s*(?:…|\.\.\.|–|-)\s*(MV-\d{3})/g, ' ')
  for (const m of withoutRanges.matchAll(/MV-\d{3}/g)) ids.add(m[0])
  for (const m of text.matchAll(/\bE\d{2}\b/g)) for (const id of byEpic(m[0])) ids.add(id)
  if (/\ball UI epics\b/i.test(text))
    for (const e of ['E03', 'E04', 'E05', 'E07', 'E08', 'E09'])
      for (const id of byEpic(e)) ids.add(id)
  else if (/\ball\b/i.test(text))
    for (const t of all) if (number(t.id) < number(self.id) && t.epic !== self.epic) ids.add(t.id)
  ids.delete(self.id)
  return [...ids].sort()
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
}

/** Derive `verification[]` from the ticket's Tests/Acceptance text (reviewed by a human after import). */
export function deriveVerification(ticket: Ticket): string[] {
  const steps = ['L1: pnpm check']
  const tests = ticket.tests ?? ''
  const slug = slugify(ticket.title) || ticket.id.toLowerCase()
  const area = EPIC_AREA[ticket.epic] ?? 'misc'
  if (/\bunit\b/i.test(tests))
    steps.push(`L1: pnpm test:unit -- tests/unit/${area}/${slug}.test.ts (${summarize(tests)})`)
  if (/\bintegration\b/i.test(tests))
    steps.push(
      `L2: pnpm test:integration -- tests/integration/${slug}.int.test.ts (${summarize(tests)})`,
    )
  if (/\be2e\b/i.test(tests))
    steps.push(`L3: pnpm test:e2e -- tests/e2e/${slug}.spec.ts (${summarize(tests)})`)
  if (ticket.id === 'MV-029')
    steps.push('manual: RUN_LIVE=1 pnpm test:live passes against the real Metsäkeskus WFS')
  if (ticket.id === 'MV-021')
    steps.push('manual: recorded fixtures reviewed (network access to the live WFS was needed)')
  if (steps.length === 1 || HUMAN_ONLY_EPICS.has(ticket.epic)) {
    steps.push(`manual: ${summarize(ticket.acceptance ?? ticket.goal, 180)}`)
  }
  return steps
}

function summarize(text: string, max = 140): string {
  const clean = text.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

export function ticketToFeature(
  ticket: Ticket,
  all: Ticket[],
  designMap: Record<string, string[]>,
  scaffoldEvidence: string,
): Feature {
  const id = featureIdFor(ticket.id)
  const done = /^done\b/i.test(ticket.status ?? '')
  const notes = [
    FOLDED_NOTES[ticket.id],
    ticket.tests ? `Tests (ticket): ${ticket.tests}` : undefined,
    ticket.acceptance ? `Acceptance: ${ticket.acceptance}` : undefined,
    ticket.status && !done ? `Status (ticket): ${ticket.status}` : undefined,
  ]
    .filter(Boolean)
    .join(' ')
  const feature: Feature = {
    id,
    priority: Number(ticket.id.slice(3)),
    area: EPIC_AREA[ticket.epic] ?? 'misc',
    title: ticket.title,
    user_visible_behavior: ticket.goal,
    status: done ? 'passing' : FOLDED_BLOCKED.has(ticket.id) ? 'blocked' : 'not_started',
    depends_on: parseDependencies(ticket.dependsOn, all, ticket)
      .map(featureIdFor)
      .filter((d) => d !== id),
    ticket: ticket.id,
    epic: ticket.epic,
    spec: `${path.relative(ROOT, ticket.file)}#${ticket.anchor}`,
    verification: done ? ['L1: pnpm check'] : deriveVerification(ticket),
    evidence: done ? [scaffoldEvidence] : [],
    attempts: 0,
    notes,
  }
  const design = designMap[ticket.id]
  if (design?.length) feature.design = design
  return feature
}

export function readTickets(dir: string = TICKETS_DIR): Ticket[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .flatMap((f) => parseTicketFile(readFileSync(path.join(dir, f), 'utf8'), path.join(dir, f)))
}

/** Merge generated features into the existing list without touching active or verified work. */
export function mergeFeatures(existing: FeatureList, generated: Feature[]): FeatureList {
  const byId = new Map(existing.features.map((f) => [f.id, f]))
  const generatedIds = new Set(generated.map((f) => f.id))
  const merged: Feature[] = []
  for (const feature of generated) {
    const current = byId.get(feature.id)
    // Hand-written features a ticket maps onto (F-000, F-001, F-016) keep their content.
    if (current && current.ticket === undefined && current.status !== 'not_started') {
      merged.push({ ...current, ticket: feature.ticket, epic: feature.epic, spec: feature.spec })
      continue
    }
    if (current && current.ticket === undefined) {
      merged.push({
        ...current,
        ticket: feature.ticket,
        epic: feature.epic,
        spec: feature.spec,
        design: current.design ?? feature.design,
      })
      continue
    }
    if (current?.status === 'in_progress' || current?.status === 'passing') {
      merged.push({
        ...current,
        ticket: current.ticket ?? feature.ticket,
        epic: current.epic ?? feature.epic,
        spec: current.spec ?? feature.spec,
        design: current.design ?? feature.design,
      })
      continue
    }
    if (current?.status === 'blocked') {
      merged.push({
        ...feature,
        status: 'blocked',
        notes: current.notes,
        attempts: current.attempts,
        max_attempts: current.max_attempts,
      })
      continue
    }
    merged.push(
      current
        ? { ...feature, attempts: current.attempts, max_attempts: current.max_attempts }
        : feature,
    )
  }
  // Keep every existing feature that is not a ticket (harness features, F-017 …).
  for (const feature of existing.features) {
    if (
      !generatedIds.has(feature.id) &&
      (feature.ticket === undefined || generatedIds.has(feature.id))
    ) {
      if (!merged.some((m) => m.id === feature.id)) merged.push(feature)
    }
  }
  merged.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  return { ...existing, features: merged }
}

/**
 * One-time fold of the hand-written features F-002…F-012 into their tickets (00-deviations P9):
 * they carry no `ticket` field. F-012 (MML background map) has no ticket and becomes F-017.
 */
export function retireLegacy(list: FeatureList): FeatureList {
  const legacy = (f: Feature) => f.ticket === undefined && /^F-0(0[2-9]|1[0-2])$/.test(f.id)
  const features = list.features.flatMap((f) => {
    if (!legacy(f)) return [f]
    if (f.id === 'F-012') {
      return [
        {
          ...f,
          id: 'F-017',
          priority: 17,
          depends_on: ['F-060'],
          notes: `${f.notes} (was F-012; depends on the MapView ticket MV-060).`,
        },
      ]
    }
    return []
  })
  return { ...list, features }
}

function main(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: { write: { type: 'boolean', default: false } },
  })
  const existing = retireLegacy(readFeatureList())
  const tickets = readTickets()
  const designMap = JSON.parse(readFileSync(DESIGN_MAP_PATH, 'utf8')) as Record<string, string[]>
  const scaffoldEvidence =
    '2026-09-06 covered by the scaffold: pnpm check + ci.yml (lint, typecheck, unit, integration, build, e2e) green → pass (commit 9bd9f80)'
  const generated = tickets.map((t) => ticketToFeature(t, tickets, designMap, scaffoldEvidence))
  const merged = mergeFeatures(existing, generated)
  merged.last_updated = today()

  const before = new Map(existing.features.map((f) => [f.id, f]))
  const added = merged.features.filter((f) => !before.has(f.id)).map((f) => f.id)
  const removed = existing.features
    .filter((f) => !merged.features.some((m) => m.id === f.id))
    .map((f) => f.id)
  const unknownDeps = merged.features.flatMap((f) =>
    f.depends_on
      .filter((d) => !merged.features.some((m) => m.id === d))
      .map((d) => `${f.id} → ${d}`),
  )
  console.log(`tickets: ${tickets.length} · features after merge: ${merged.features.length}`)
  console.log(`added: ${added.length ? added.join(', ') : 'none'}`)
  console.log(`removed: ${removed.length ? removed.join(', ') : 'none'}`)
  if (unknownDeps.length) console.log(`unresolved dependencies: ${unknownDeps.join(', ')}`)
  const withoutDesign = tickets
    .filter((t) => !designMap[t.id] && /page|route|\/[a-z]/.test(t.title))
    .map((t) => t.id)
  if (withoutDesign.length)
    console.log(`page-like tickets without a design link: ${withoutDesign.join(', ')}`)
  if (!values.write) {
    console.log('dry run; pass --write to update feature_list.json')
    return
  }
  writeFeatureList(merged)
  console.log('feature_list.json written')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
