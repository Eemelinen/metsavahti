import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { colors, radius, shadow } from '@/lib/design-tokens'

const root = path.resolve(__dirname, '../../..')
const globalsCss = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8').toLowerCase()

function flatten(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) flatten(v, out)
  return out
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full)
  }
  return out
}

/** Files that may contain colour literals: the two token sources and generated code. */
const allowedHexFiles = new Set([
  'src/lib/design-tokens.ts',
  'src/app/globals.css',
  'src/payload-types.ts',
])

describe('design tokens', () => {
  it('every colour in design-tokens.ts is a theme value in globals.css', () => {
    for (const hex of flatten(colors)) {
      expect(globalsCss, `${hex} missing from globals.css`).toContain(hex.toLowerCase())
    }
    for (const value of Object.values(radius)) expect(globalsCss).toContain(value)
    for (const value of Object.values(shadow)) {
      expect(globalsCss.replace(/\s+/g, '')).toContain(value.toLowerCase().replace(/\s+/g, ''))
    }
  })

  it('src/ contains no colour literals outside the token sources', () => {
    const offenders: string[] = []
    for (const file of walk(path.join(root, 'src'))) {
      const rel = path.relative(root, file)
      if (allowedHexFiles.has(rel) || rel.startsWith('src/app/(payload)/')) continue
      const source = readFileSync(file, 'utf8')
      const lines = source.split('\n')
      lines.forEach((line, index) => {
        if (/#[0-9a-f]{3,8}\b/i.test(line) && !line.includes('#/'))
          offenders.push(`${rel}:${index + 1}`)
      })
    }
    expect(offenders, 'use src/lib/design-tokens.ts or a theme class instead').toEqual([])
  })
})
