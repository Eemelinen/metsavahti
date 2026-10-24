'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { Tooltip } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { fi } from '@/i18n/fi'

const copy = fi.watchAreas.dashboard

/**
 * "+ Uusi vahtialue" of `/vahtialueet`. At the plan limit it stays visible but disabled, and
 * its tooltip says why (App artboard `limitTooltip`). The button is `aria-disabled` rather than
 * `disabled` so it can still take focus and hover and show the tooltip; a click or tap opens it
 * too, since touch screens have no hover. Screen readers get the reason as its description.
 */
export function NewWatchAreaButton({
  limitReached,
  limitText,
}: {
  limitReached: boolean
  limitText: string
}) {
  const [open, setOpen] = useState(false)
  const noteId = useId()
  const label = (
    <>
      <span aria-hidden="true">+</span>
      {copy.newArea}
    </>
  )

  if (!limitReached) {
    return (
      <Button asChild size="xl">
        <Link href="/vahtialueet/uusi">{label}</Link>
      </Button>
    )
  }

  return (
    <Tooltip.Provider delayDuration={0}>
      <span className="sr-only" id={noteId}>
        {limitText}
      </span>
      <Tooltip.Root onOpenChange={setOpen} open={open}>
        <Tooltip.Trigger asChild>
          <Button
            aria-describedby={noteId}
            aria-disabled="true"
            className="cursor-not-allowed opacity-55 hover:bg-primary"
            onClick={() => setOpen(true)}
            size="xl"
            type="button"
          >
            {label}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-30 max-w-70 rounded-lg bg-ink px-3 py-2 text-sm text-paper-raised shadow-pop"
            data-testid="watch-area-limit"
            side="bottom"
            sideOffset={6}
          >
            {limitText}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
