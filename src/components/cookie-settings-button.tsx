'use client'

/**
 * Fired on `window` when the user asks to open the cookie settings; `ConsentManager`
 * (`components/consent/consent-manager.tsx`, mounted by the frontend layout) opens the modal.
 */
export const COOKIE_SETTINGS_EVENT = 'metsavahti:open-cookie-settings'

/**
 * Footer "Evästeasetukset" button (docs/design/Landing.dc.html#header-footer); `/evasteet`
 * renders it as "Avaa evästeasetukset" (docs/design/Legal.dc.html#evasteet).
 */
export function CookieSettingsButton({
  className,
  children = 'Evästeasetukset',
}: {
  className?: string
  children?: string
}) {
  return (
    <button
      className={className}
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT))}
    >
      {children}
    </button>
  )
}
