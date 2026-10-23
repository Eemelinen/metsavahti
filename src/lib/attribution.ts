/**
 * Required by the CC BY 4.0 licence of the Metsäkeskus open data:
 * "Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa MM/YYYY"
 * where MM/YYYY is the month the data was retrieved.
 */
export function metsakeskusAttribution(date: Date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa ${mm}/${date.getFullYear()}`
}
