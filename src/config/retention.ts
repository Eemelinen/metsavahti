/**
 * Retention rules (`01 §4.4`, `01 §8`, ledger R12). The weekly `cleanup` task
 * (`lib/jobs/cleanup.ts`) has one handler per key, and the privacy page (MV-092) builds its
 * retention table from the same entries, so the policy and the code cannot drift. `days` is
 * counted from the moment `start` names; `description` is the privacy-page sentence.
 */
export type RetentionRule = {
  /** What the rule covers (Finnish, privacy-page table). */
  data: string
  /** Days kept after `start`. */
  days: number
  /** The moment the period starts. */
  start: string
  /** The rule as one Finnish sentence. */
  description: string
}

/** An expired declaration stays while it has an alert younger than this (`01 §4.4`). */
export const DECLARATION_ALERT_GRACE_DAYS = 90

export const retention = {
  declarations: {
    data: 'Metsänkäyttöilmoitukset (välimuisti)',
    days: 30,
    start: 'ilmoituksen voimassaolon päättyminen',
    description: `Metsänkäyttöilmoitus poistetaan 30 päivää voimassaolonsa päättymisen jälkeen, ellei siitä ole tehty hälytystä viimeisten ${DECLARATION_ALERT_GRACE_DAYS} päivän aikana. Ilmoituksen mukana poistuvat sen hälytykset ja aiemmat versiot.`,
  },
  declarationRevisions: {
    data: 'Metsänkäyttöilmoitusten aiemmat versiot',
    days: 365,
    start: 'muutos',
    description: 'Ilmoituksen aiempi versio poistetaan vuoden kuluttua muutoksesta.',
  },
  dataExports: {
    data: 'Tietojen vientitiedostot',
    days: 0,
    start: 'latauslinkin vanheneminen',
    description:
      'Vientitiedosto poistetaan ja pyyntö merkitään vanhentuneeksi, kun latauslinkki vanhenee.',
  },
  jobRuns: {
    data: 'Taustatehtävien ajolokit',
    days: 90,
    start: 'ajon alku',
    description: 'Taustatehtävien ajotiedot poistetaan 90 päivän kuluttua.',
  },
  rateLimitBuckets: {
    data: 'Pyyntörajoitusten laskurit',
    days: 0,
    start: 'laskentaikkunan päättyminen',
    description: 'Pyyntörajoituksen laskuri poistetaan, kun sen laskentaikkuna on päättynyt.',
  },
} as const satisfies Record<string, RetentionRule>

export type RetentionRuleId = keyof typeof retention
