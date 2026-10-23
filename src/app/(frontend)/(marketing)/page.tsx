import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Tiedä, mitä metsässäsi lähellä tapahtuu.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Metsävahti seuraa Suomen metsäkeskuksen metsänkäyttöilmoituksia valitsemasi alueen
          ympärillä ja lähettää sähköpostin, kun uusi tai muuttunut hakkuuilmoitus osuu alueellesi.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/kirjaudu">Kirjaudu sisään</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/create-first-user">Luo tili</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>1. Valitse alue</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Klikkaa kartalta metsäpalstasi tai mökkisi ja anna säde (100 m – 20 km).
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Me tarkistamme</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Metsäkeskuksen avoin data päivittyy kahdesti päivässä. Metsävahti hakee ilmoitukset
            alueeltasi jokaisen päivityksen jälkeen.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>3. Saat ilmoituksen</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Uudesta tai muuttuneesta ilmoituksesta lähtee sähköposti, jossa näet hakkuutavan,
            pinta-alan ja etäisyyden alueeseesi.
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
