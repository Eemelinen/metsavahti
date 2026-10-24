import type { colors } from '@/lib/design-tokens'

/**
 * Cutting methods (hakkuutapa) of forest-use declarations: the WFS attribute
 * `CUTTINGREALIZATIONPRACTICE`, Metsäkeskus code list 1014 "Toimenpiteen hakkuutapa".
 *
 * Source: Metsäkeskus, "MKI-koodisto- ja tietokantakuvaus" (sheet "Koodisto", file updated
 * 10.2.2022), linked from the forest-use declaration dataset page; checked on 2026-10-24:
 * https://www.metsakeskus.fi/sites/default/files/document/mki-koodisto-ja-tietokantakuvaus.xlsx
 * The live layer used codes 1, 2, 3, 4, 5, 8, 9, 12, 13, 14 and 20 on that day.
 *
 * `label_fi` is the plain-Finnish name shown to users, `explanation_fi` one line for the UI
 * ("what happens to the forest"), `source_label_fi` the code list's own wording.
 * `colourToken` picks the map / chip colour (`cut` tokens: thinning-type cuttings
 * `harvennus`, regeneration fellings `uudistus`, everything else `muu`); `severity` says
 * how much of the stand is felled: `high` most of it, `medium` part of it, `low` little or
 * an unclear amount. Read entries through `src/lib/wfs/codes.ts`, which also handles
 * unknown codes.
 */

export type CuttingColourToken = keyof typeof colors.cut

export type CuttingSeverity = 'low' | 'medium' | 'high'

export type CuttingTypeDefinition = {
  label_fi: string
  explanation_fi: string
  source_label_fi: string
  colourToken: CuttingColourToken
  severity: CuttingSeverity
}

export const CUTTING_TYPES: Readonly<Record<number, CuttingTypeDefinition>> = {
  1: {
    label_fi: 'Ylispuiden poisto',
    explanation_fi:
      'Taimikon yläpuolelle jätetyt vanhat puut kaadetaan, ja nuori metsä jää kasvamaan.',
    source_label_fi: 'Ylispuiden poisto',
    colourToken: 'harvennus',
    severity: 'medium',
  },
  2: {
    label_fi: 'Ensiharvennus',
    explanation_fi:
      'Nuoresta metsästä poistetaan osa puista, jotta jäljelle jäävät saavat tilaa kasvaa.',
    source_label_fi: 'Ensiharvennus',
    colourToken: 'harvennus',
    severity: 'low',
  },
  3: {
    label_fi: 'Harvennushakkuu',
    explanation_fi: 'Osa puista poistetaan, ja metsä jää kasvamaan harvempana.',
    source_label_fi: 'Harvennushakkuu',
    colourToken: 'harvennus',
    severity: 'medium',
  },
  4: {
    label_fi: 'Kaistalehakkuu',
    explanation_fi:
      'Metsä kaadetaan kapeina kaistoina, jotka uudistuvat viereisen metsän siemenistä.',
    source_label_fi: 'Kaistalehakkuu',
    colourToken: 'uudistus',
    severity: 'high',
  },
  5: {
    label_fi: 'Avohakkuu',
    explanation_fi: 'Lähes kaikki puut kaadetaan, ja alueelle kasvatetaan uusi metsä.',
    source_label_fi: 'Avohakkuu',
    colourToken: 'uudistus',
    severity: 'high',
  },
  6: {
    label_fi: 'Verhopuuhakkuu',
    explanation_fi:
      'Suurin osa puista kaadetaan; harva puusto jää suojaamaan alla kasvavaa taimikkoa.',
    source_label_fi: 'Verhopuuhakkuu',
    colourToken: 'uudistus',
    severity: 'high',
  },
  7: {
    label_fi: 'Suojuspuuhakkuu',
    explanation_fi: 'Suurin osa puista kaadetaan; osa jää suojaamaan ja siementämään uutta metsää.',
    source_label_fi: 'Suojuspuuhakkuu',
    colourToken: 'uudistus',
    severity: 'high',
  },
  8: {
    label_fi: 'Siemenpuuhakkuu',
    explanation_fi: 'Suurin osa puista kaadetaan; muutamia puita jätetään siementämään uusi metsä.',
    source_label_fi: 'Siemenpuuhakkuu',
    colourToken: 'uudistus',
    severity: 'high',
  },
  9: {
    label_fi: 'Hakkuu maankäytön muutokseen',
    explanation_fi:
      'Metsä kaadetaan muuhun käyttöön, esimerkiksi rakentamista, tietä tai peltoa varten.',
    source_label_fi: 'Erityishakkuu, maankäyttömuodon muutokseen johtava.',
    colourToken: 'muu',
    severity: 'high',
  },
  10: {
    label_fi: 'Hakkuu rakentamista varten',
    explanation_fi: 'Metsää kaadetaan asutuksen tieltä (vanhan paperi-ilmoituksen koodi).',
    source_label_fi: 'Asutukseen hakkuu, paperi-ilmoitus, vanha koodi.',
    colourToken: 'muu',
    severity: 'high',
  },
  11: {
    label_fi: 'Erityishakkuu',
    explanation_fi:
      'Metsälain 5 b §:n mukainen hakkuu, jossa metsää käsitellään tavallisesta poikkeavasti.',
    source_label_fi: 'Erityishakkuu, Metsälain 5b §:n mukainen',
    colourToken: 'muu',
    severity: 'medium',
  },
  12: {
    label_fi: 'Poimintahakkuu',
    explanation_fi: 'Metsästä kaadetaan yksittäisiä puita tai puuryhmiä; metsä säilyy peitteisenä.',
    source_label_fi: 'Poimintaluonteinen kasvatushakkuu',
    colourToken: 'harvennus',
    severity: 'medium',
  },
  13: {
    label_fi: 'Kasvatushakkuu',
    explanation_fi: 'Osa puista poistetaan, ja metsä jää kasvamaan (paperi-ilmoitus).',
    source_label_fi: 'Kasvatushakkuu, paperi-ilmoitukset.',
    colourToken: 'harvennus',
    severity: 'medium',
  },
  14: {
    label_fi: 'Muu hakkuu',
    explanation_fi: 'Muu ilmoitettu hakkuu tai metsän käsittely; laajuus ei selviä koodista.',
    source_label_fi: 'Muu hakkuu tai toimenpide',
    colourToken: 'muu',
    severity: 'low',
  },
  15: {
    label_fi: 'Hakkuu ojalinjaksi',
    explanation_fi:
      'Puita kaadetaan kapealta alueelta ojaa varten (vanhan paperi-ilmoituksen koodi).',
    source_label_fi: 'Ojalinjaksi hakkuu, paperi-ilmoitus, vanha koodi.',
    colourToken: 'muu',
    severity: 'low',
  },
  16: {
    label_fi: 'Hakkuu pelloksi',
    explanation_fi: 'Metsä kaadetaan ja alue raivataan pelloksi (vanhan paperi-ilmoituksen koodi).',
    source_label_fi: 'Pelloksi hakkuu, paperi-ilmoitus, vanha koodi.',
    colourToken: 'muu',
    severity: 'high',
  },
  17: {
    label_fi: 'Pienaukkohakkuu',
    explanation_fi:
      'Metsään kaadetaan pieni aukko, joka uudistuu taimikoksi; ympärille jää metsää.',
    source_label_fi: 'Pienaukkohakkuu',
    colourToken: 'uudistus',
    severity: 'medium',
  },
  18: {
    label_fi: 'Hakkuu tielinjaksi',
    explanation_fi:
      'Puita kaadetaan kapealta alueelta tietä varten (vanhan paperi-ilmoituksen koodi).',
    source_label_fi: 'Tielinjaksi hakkuu, paperi-ilmoitus, vanha koodi.',
    colourToken: 'muu',
    severity: 'low',
  },
  19: {
    label_fi: 'Uudistushakkuu',
    explanation_fi: 'Metsä kaadetaan, ja alueelle kasvatetaan uusi metsä (paperi-ilmoitus).',
    source_label_fi: 'Uudistamishakkuu, paperi-ilmoitukset.',
    colourToken: 'uudistus',
    severity: 'high',
  },
  20: {
    label_fi: 'Myrskytuhoalueen harvennus',
    explanation_fi: 'Myrskyn kaatamia ja vaurioittamia puita korjataan; metsä jää kasvamaan.',
    source_label_fi: 'Myrskytuhoalue, kasvatushakkuu',
    colourToken: 'harvennus',
    severity: 'medium',
  },
  21: {
    label_fi: 'Myrskytuhoalueen uudistushakkuu',
    explanation_fi: 'Myrskyn tuhoama metsä kaadetaan, ja alueelle kasvatetaan uusi metsä.',
    source_label_fi: 'Myrskytuhoalue, uudistamishakkuu',
    colourToken: 'uudistus',
    severity: 'high',
  },
  22: {
    label_fi: 'Hyönteistuhoalueen uudistushakkuu',
    explanation_fi:
      'Hyönteisten, kuten kirjanpainajan, tuhoama metsä kaadetaan ja kasvatetaan uudelleen.',
    source_label_fi: 'Hyönteistuhoalue, uudistamishakkuu',
    colourToken: 'uudistus',
    severity: 'high',
  },
  23: {
    label_fi: 'Hyönteistuhoalueen harvennus',
    explanation_fi: 'Hyönteisten vaurioittamia puita poistetaan; metsä jää kasvamaan.',
    source_label_fi: 'Hyönteistuhoalue, kasvatushakkuu',
    colourToken: 'harvennus',
    severity: 'medium',
  },
  24: {
    label_fi: 'Metsätuhoalueen harvennus',
    explanation_fi: 'Metsätuhon vaurioittamia puita poistetaan; metsä jää kasvamaan.',
    source_label_fi: 'Muu metsätuhoalue, kasvatushakkuu',
    colourToken: 'harvennus',
    severity: 'medium',
  },
  25: {
    label_fi: 'Metsätuhoalueen uudistushakkuu',
    explanation_fi: 'Metsätuhon kärsinyt metsä kaadetaan, ja alueelle kasvatetaan uusi metsä.',
    source_label_fi: 'Muu metsätuhoalue, uudistamishakkuu',
    colourToken: 'uudistus',
    severity: 'high',
  },
}

/**
 * What a code outside the list (or a missing one) shows: `muu`, and `medium` because an
 * unknown cutting is not assumed to be a light one.
 */
export const UNKNOWN_CUTTING_TYPE: CuttingTypeDefinition = {
  label_fi: 'Muu hakkuu',
  explanation_fi: 'Hakkuutapaa ei ole ilmoitettu, tai Metsävahti ei vielä tunne sen koodia.',
  source_label_fi: '',
  colourToken: 'muu',
  severity: 'medium',
}
