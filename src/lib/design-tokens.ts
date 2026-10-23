/**
 * Design tokens for code that cannot use Tailwind classes: MapLibre paint properties and
 * React Email inline styles. The Tailwind theme in `src/app/globals.css` carries the same
 * values as CSS variables; `tests/unit/design/tokens.test.ts` keeps the two in sync.
 * Source of truth: docs/design/tokens.js (Claude Design export), rules: docs/design/README.md.
 */
export const colors = {
  forest: {
    50: '#E9F0EB',
    100: '#D3E1D8',
    200: '#A9C4B3',
    300: '#7EA58F',
    500: '#3B7A5A',
    600: '#2B6247',
    700: '#1E4A37',
    800: '#163828',
    900: '#0F2A1E',
  },
  sage: { 300: '#B7C4BC', 500: '#8A9E93', 700: '#5C6B62' },
  amber: { 100: '#FBEBD0', 300: '#F0B35A', 500: '#D98A1E', 700: '#9C6010' },
  ember: { 100: '#FBDDD2', 500: '#D9572B', 700: '#A33E1A' },
  ink: { DEFAULT: '#1B211D', muted: '#5C6B62', faint: '#8A9E93' },
  paper: { DEFAULT: '#F7F5F0', raised: '#FFFFFF', sunken: '#EFECE5' },
  line: { DEFAULT: '#DDE3DE', strong: '#B7C4BC' },
  /** Harvest-type (hakkuutapa) colours; always paired with a text label in the UI. */
  cut: { harvennus: '#F0B35A', uudistus: '#D9572B', muu: '#9AA39D' },
  success: '#2B6247',
  error: '#B8321C',
  info: '#2F5F8A',
} as const

export const radius = { sm: '6px', md: '8px', lg: '10px', xl: '14px', '2xl': '20px' } as const

export const shadow = {
  card: '0 1px 2px rgba(27,33,29,0.06), 0 4px 16px rgba(27,33,29,0.06)',
  pop: '0 8px 32px rgba(27,33,29,0.16)',
} as const

/** Email-safe stack; the web app loads Figtree through next/font (see the frontend layout). */
export const fontFamily = {
  sans: "Figtree, 'Helvetica Neue', Helvetica, Arial, sans-serif",
} as const

/** Map layer colours (MapLibre paint), derived from the tokens above. */
export const mapColors = {
  watchAreaFill: colors.forest[600],
  watchAreaLine: colors.forest[600],
  marker: colors.forest[700],
  cut: colors.cut,
  cutLine: { harvennus: colors.amber[700], uudistus: colors.ember[700], muu: colors.sage[700] },
} as const
