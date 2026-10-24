import { plans } from '@/config/plans'
import { MAX_RADIUS_M, MIN_RADIUS_M } from '@/lib/watch-areas/watch-area-schema'

export type FaqEntry = {
  /** Stable anchor id (`/#ukk-<id>`) and test handle. */
  id: string
  question: string
  answer: string
}

const km = (metres: number) => `${String(metres / 1000).replace('.', ',')} km`

/**
 * Landing-page FAQ (MV-100): the eight topics the ticket lists, in its order. The page renders
 * it as an accordion and as the `FAQPage` structured data, so the two cannot drift apart.
 * Numbers come from the config they describe (plan limit, radius bounds).
 */
export const FAQ: readonly FaqEntry[] = [
  {
    id: 'mika-on-metsankayttoilmoitus',
    question: 'Mikä metsänkäyttöilmoitus on?',
    answer:
      'Metsänomistajan Suomen metsäkeskukselle tekemä ilmoitus suunnitellusta hakkuusta tai muusta metsän käytöstä. Se on tehtävä vähintään 10 päivää ennen hakkuun aloittamista ja se on voimassa kolme vuotta. Ilmoitus on aikomus, ei velvoite: osa ilmoitetuista hakkuista jää tekemättä tai toteutuu vain osittain.',
  },
  {
    id: 'poikkeukset',
    question: 'Näkyvätkö kaikki hakkuut palvelussa?',
    answer:
      'Eivät. Kaikista hakkuista ei tarvitse tehdä metsänkäyttöilmoitusta: esimerkiksi pienimuotoinen puunotto kotitarpeisiin ja hakkuut alueilla, joihin metsälakia ei sovelleta, kuten useimmat asemakaava-alueet, jäävät aineiston ulkopuolelle. Metsävahti näyttää vain ne hakkuut, joista on tehty ilmoitus.',
  },
  {
    id: 'viive',
    question: 'Miksi ilmoitus voi tulla myöhässä?',
    answer:
      'Ilmoitus näkyy avoimessa aineistossa vasta, kun Metsäkeskus on kirjannut sen, mikä voi viedä muutaman päivän. Metsävahti tarkistaa aineiston kaksi kertaa päivässä, aamulla ja illalla. Jos olet valinnut päivittäisen tai viikoittaisen koosteen, sähköposti lähtee koosteen aikataulussa.',
  },
  {
    id: 'tietojen-jakaminen',
    question: 'Jaetaanko tietojani kenellekään?',
    answer:
      'Ei. Käytämme sähköpostiosoitettasi ja vahtialueitasi vain ilmoitusten lähettämiseen, emmekä myy tai luovuta niitä eteenpäin. Muut käyttäjät eivät näe vahtialueitasi. Palvelu ei myöskään käsittele eikä näytä maanomistajien henkilötietoja, vain hakkuualueen sijainnin, tyypin ja ajankohdan. Tarkemmin kerromme tietosuojaselosteessa.',
  },
  {
    id: 'hinta',
    question: 'Mitä palvelu maksaa?',
    answer: `Metsävahti on ilmainen. Ilmaisella tasolla voit luoda enintään ${plans.free.maxWatchAreas} vahtialuetta, esimerkiksi kodin ja mökin, ja saat sähköposti-ilmoitukset.`,
  },
  {
    id: 'sateen-tarkkuus',
    question: 'Kuinka tarkasti säde toimii?',
    answer: `Vahtialue on ympyrä, jonka säteen valitset väliltä ${MIN_RADIUS_M} m – ${km(MAX_RADIUS_M)}. Saat ilmoituksen, jos hakkuualueen rajaus osuu ympyrään edes osittain, ja etäisyys lasketaan merkitsemästäsi pisteestä hakkuualueen lähimpään reunaan. Rajaukset ovat metsänomistajan ilmoittamia, joten ne voivat poiketa maastosta muutamia metrejä.`,
  },
  {
    id: 'tilin-poisto',
    question: 'Miten poistan tilini?',
    answer:
      'Kirjaudu sisään ja valitse tilin asetuksista Poista tili. Vahtialueesi, ilmoituksesi ja asetuksesi poistetaan heti; suostumushistoria säilyy anonymisoituna. Saat poistosta vahvistuksen sähköpostiin.',
  },
  {
    id: 'lisenssi',
    question: 'Mistä tiedot tulevat ja millä lisenssillä?',
    answer:
      'Tiedot ovat Suomen metsäkeskuksen avointa Metsänkäyttöilmoitukset-aineistoa, joka on julkaistu Creative Commons Nimeä 4.0 (CC BY 4.0) -lisenssillä. Siksi jokaisella sivulla ja jokaisessa sähköpostissa on maininta aineiston lähteestä ja ajankohdasta.',
  },
]
