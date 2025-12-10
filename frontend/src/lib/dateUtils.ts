/**
 * Date formatting utilities for ISO timestamps
 * All API timestamps are in ISO 8601 format
 */

/**
 * Format ISO timestamp to time string (HH:MM)
 * @param isoString - ISO 8601 timestamp
 * @returns Formatted time string in Ukrainian locale
 */
export function formatTimeFromISO(isoString: string | null | undefined): string {
  if (!isoString) return '--:--'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Format ISO timestamp to full Ukrainian datetime (HH:MM DD.MM.YYYY)
 * @param isoString - ISO 8601 timestamp
 * @returns Formatted datetime string in Ukrainian locale
 */
export function formatDateTimeFromISO(isoString: string | null | undefined): string {
  if (!isoString) return '--:-- --.--.----'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '--:-- --.--.----'
  return date.toLocaleString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

/**
 * Format ISO timestamp to date string (DD.MM.YYYY)
 * @param isoString - ISO 8601 timestamp
 * @returns Formatted date string in Ukrainian locale
 */
export function formatDateFromISO(isoString: string | null | undefined): string {
  if (!isoString) return '--.--.----'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '--.--.----'
  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}
