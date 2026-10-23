import { Figtree } from 'next/font/google'

/**
 * Design typeface (docs/design/README.md), exposed as `--font-figtree` for the Tailwind
 * theme. Shared by the frontend root layout and `global-error.tsx`, which must render its
 * own `<html>` and therefore load the font itself.
 */
export const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' })
