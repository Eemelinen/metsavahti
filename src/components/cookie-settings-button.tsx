'use client'

/**
 * Fired on `window` when the user asks to open the cookie settings. The consent modal
 * (MV-090) listens for it; until then the button is wired but nothing opens.
 */
export const COOKIE_SETTINGS_EVENT = 'metsavahti:open-cookie-settings'

/** Footer "Evästeasetukset" button (docs/design/Landing.dc.html#header-footer). */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      className={className}
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT))}
    >
      Evästeasetukset
    </button>
  )
}
