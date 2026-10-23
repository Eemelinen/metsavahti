import { Button } from '@/components/ui/button'
import { fi } from '@/i18n/fi'

/**
 * "Kirjaudu ulos" (E03 MV-044): a plain form that POSTs to `/kirjaudu-ulos`, so it needs no
 * client JavaScript and no Server Action id. Lives in the dashboard header until the app
 * shell's account menu (MV-050) takes it over.
 */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action="/kirjaudu-ulos" className={className} method="post">
      <Button size="sm" type="submit" variant="outline">
        {fi.auth.logout.button}
      </Button>
    </form>
  )
}
