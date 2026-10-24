/**
 * CUTTINGREALIZATIONPRACTICE → human label (Finnish).
 *
 * TODO(verify): confirm codes against the Metsäkeskus koodisto
 * (Metsätietostandardi, CuttingRealizationPracticeType) before showing to users.
 */
export const HAKKUUTAPA_LABELS: Readonly<Record<number, string>> = {
  1: 'Ensiharvennus',
  2: 'Harvennus',
  3: 'Ylispuiden poisto',
  4: 'Avohakkuu',
  5: 'Siemenpuuhakkuu',
  6: 'Suojuspuuhakkuu',
  7: 'Kaistalehakkuu',
  8: 'Erikoishakkuu',
  9: 'Poimintahakkuu',
  10: 'Pienaukkohakkuu',
}

export function hakkuutapaLabel(code: number | null | undefined): string {
  if (code == null) return 'Tuntematon hakkuutapa'
  return HAKKUUTAPA_LABELS[code] ?? `Hakkuutapa ${code}`
}

/** The map's three harvest-type colours (`03b` map component, `cut` tokens in docs/design). */
export type CutCategory = 'harvennus' | 'uudistus' | 'muu'

/**
 * Thinnings → `harvennus`, regeneration fellings (avo-, siemenpuu-, suojuspuuhakkuu) →
 * `uudistus`, everything else and unknown codes → `muu`. Same TODO(verify) as the labels.
 */
export function hakkuutapaCategory(code: number | null | undefined): CutCategory {
  if (code === 1 || code === 2) return 'harvennus'
  if (code === 4 || code === 5 || code === 6) return 'uudistus'
  return 'muu'
}
