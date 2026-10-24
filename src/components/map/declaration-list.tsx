import { cn } from 'cn'

import {
  CuttingTypeChip,
  DeclarationDetailLink,
  DeclarationFacts,
  type MapDeclaration,
} from '@/components/map/declaration-popover'

const SHOW_BUTTON =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm font-semibold text-forest-700 outline-none hover:border-line-strong focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-forest-700'

/**
 * The keyboard and screen-reader alternative to clicking polygons (MV-061): one row per
 * declaration on the map, in the map's order, with the popover's facts, "Näytä tiedot" and
 * "Näytä kartalla", which selects the polygon and moves the map to it.
 */
export function DeclarationList({
  declarations,
  selectedId,
  onShow,
  className,
}: {
  declarations: readonly MapDeclaration[]
  selectedId: MapDeclaration['id'] | null
  onShow: (declaration: MapDeclaration) => void
  className?: string
}) {
  if (declarations.length === 0) return null
  return (
    <ul
      aria-label="Kartan metsänkäyttöilmoitukset"
      className={cn('flex flex-col gap-2', className)}
      data-testid="declaration-list"
    >
      {declarations.map((declaration) => {
        const selected = declaration.id === selectedId
        return (
          <li
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-paper-raised px-4 py-3 text-sm',
              selected ? 'border-forest-700' : 'border-line',
            )}
            key={declaration.id}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <CuttingTypeChip code={declaration.properties.cuttingTypeCode} />
              <DeclarationFacts properties={declaration.properties} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                aria-pressed={selected}
                className={SHOW_BUTTON}
                onClick={() => onShow(declaration)}
                type="button"
              >
                Näytä kartalla
              </button>
              <DeclarationDetailLink properties={declaration.properties} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
