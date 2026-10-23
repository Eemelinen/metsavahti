/**
 * A short device label from a `User-Agent` header for the sessions list on
 * `/tili/turvallisuus` (App artboard `turvallisuus`: "Safari, iPhone", "Chrome, Windows").
 * A heuristic, not a parser: it only has to let a person recognise their own devices, so it
 * knows the common browsers and systems and says "Tuntematon selain" / leaves the system out
 * otherwise. Order matters: Edge and Opera also claim Chrome, Chrome also claims Safari.
 */

const BROWSERS: ReadonlyArray<readonly [pattern: RegExp, name: string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\/|\bChromium\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]

const SYSTEMS: ReadonlyArray<readonly [pattern: RegExp, name: string]> = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

export const UNKNOWN_BROWSER = 'Tuntematon selain'

function match(value: string, table: typeof BROWSERS): string | null {
  return table.find(([pattern]) => pattern.test(value))?.[1] ?? null
}

/** "Chrome, Windows", "Safari, iPhone", "Firefox", or "Tuntematon selain". */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return UNKNOWN_BROWSER
  const browser = match(userAgent, BROWSERS)
  const system = match(userAgent, SYSTEMS)
  if (!browser) return system ? `${UNKNOWN_BROWSER}, ${system}` : UNKNOWN_BROWSER
  return system ? `${browser}, ${system}` : browser
}
