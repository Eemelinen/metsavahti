import { metsakeskusAttribution } from '@/lib/attribution'

/** CC BY 4.0 attribution required by Metsäkeskus. Must stay visible in the UI. */
export function Attribution() {
  return (
    <p className="text-xs text-muted-foreground" data-testid="attribution">
      {metsakeskusAttribution()}{' '}
      <a
        className="underline"
        href="https://www.metsakeskus.fi/fi/avoin-metsa-ja-luontotieto"
        rel="noopener noreferrer"
        target="_blank"
      >
        (CC BY 4.0)
      </a>
    </p>
  )
}
