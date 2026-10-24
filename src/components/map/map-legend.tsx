import { cn } from 'cn'

import type { CuttingColourToken } from '@/config/cutting-types'

/** Legend rows in the artboard's order (`App.dc.html#route=alue`); colours are the `cut` tokens. */
export const MAP_LEGEND: ReadonlyArray<{ token: CuttingColourToken; label: string }> = [
  { token: 'uudistus', label: 'Uudistushakkuu' },
  { token: 'harvennus', label: 'Harvennus' },
  { token: 'muu', label: 'Muu' },
]

const SWATCH: Record<CuttingColourToken, string> = {
  uudistus: 'bg-cut-uudistus',
  harvennus: 'bg-cut-harvennus',
  muu: 'bg-cut-muu',
}

/** Harvest-type key of the declarations layer; every colour is paired with its label. */
export function MapLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label="Karttaselite"
      className={cn(
        'flex max-w-max flex-wrap gap-x-3 gap-y-2 rounded-lg bg-paper-raised/95 px-3 py-2 text-xs text-ink shadow-card',
        className,
      )}
      data-testid="map-legend"
    >
      {MAP_LEGEND.map(({ token, label }) => (
        <li className="inline-flex items-center gap-1.5" key={token}>
          <span aria-hidden="true" className={cn('size-2.5 rounded-xs', SWATCH[token])} />
          {label}
        </li>
      ))}
    </ul>
  )
}
