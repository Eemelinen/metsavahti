import zxcvbn from 'zxcvbn'

import { fi } from '@/i18n/fi'

/** zxcvbn score: 0 (guessable) … 4 (very unguessable). */
export type PasswordScore = 0 | 1 | 2 | 3 | 4

/** E03 MV-042: passwords must be at least this long … */
export const MIN_PASSWORD_LENGTH = 10
/** … and score at least this with zxcvbn. */
export const MIN_PASSWORD_SCORE: PasswordScore = 3

export type PasswordStrength = {
  score: PasswordScore
  /** Finnish label for the meter (`Liian lyhyt`, `Heikko`, … `Vahva`). */
  label: string
  /** True when both the length and the score requirement are met. */
  acceptable: boolean
}

/**
 * Scores a password with zxcvbn. `userInputs` (email, name …) are penalised as dictionary
 * words. A password shorter than `MIN_PASSWORD_LENGTH` is reported as score 0 / "Liian
 * lyhyt" without consulting zxcvbn, so the meter and the registration schema agree.
 *
 * zxcvbn is ~400 kB, so UI code loads this module lazily (`PasswordInput`); server-side
 * schemas (MV-042) import it directly.
 */
export function scorePassword(password: string, userInputs: string[] = []): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { score: 0, label: fi.forms.password.strength.tooShort, acceptable: false }
  }
  const score = zxcvbn(password, userInputs).score as PasswordScore
  return {
    score,
    label: fi.forms.password.strength[score],
    acceptable: score >= MIN_PASSWORD_SCORE,
  }
}
