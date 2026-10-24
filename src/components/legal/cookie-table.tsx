import { cookies } from '@/config/cookies'
import { fi } from '@/i18n/fi'

const copy = fi.legal.cookieTable
const cellClass = 'px-3 py-2.5'

/** The `/evasteet` cookie table (Legal artboard `#evasteet`), rendered from `config/cookies.ts`. */
export function CookieTable() {
  return (
    // Scrolls sideways on phones, so it must take keyboard focus (axe scrollable-region-focusable).
    <div
      aria-label={copy.caption}
      className="overflow-x-auto rounded-xl border border-line bg-paper-raised focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      role="region"
      tabIndex={0}
    >
      <table className="w-full min-w-130 border-collapse text-sm">
        <caption className="sr-only">{copy.caption}</caption>
        <thead>
          <tr className="bg-paper-sunken text-left">
            <th className={`${cellClass} font-semibold`} scope="col">
              {copy.name}
            </th>
            <th className={`${cellClass} font-semibold`} scope="col">
              {copy.purpose}
            </th>
            <th className={`${cellClass} font-semibold`} scope="col">
              {copy.category}
            </th>
            <th className={`${cellClass} font-semibold`} scope="col">
              {copy.lifetime}
            </th>
          </tr>
        </thead>
        <tbody>
          {cookies.map((cookie) => (
            <tr className="border-t border-paper-sunken" key={cookie.name}>
              <td className={`${cellClass} font-mono text-xs`}>{cookie.name}</td>
              <td className={cellClass}>{cookie.purpose}</td>
              <td className={cellClass}>{copy.categories[cookie.category]}</td>
              <td className={cellClass}>{cookie.lifetime}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
