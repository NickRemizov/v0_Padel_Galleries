/**
 * Database Integrity Checker Utils
 */

/**
 * Форматирует дату в короткий формат DD.MM
 */
export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ""
    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    return `${day}.${month}`
  } catch {
    return ""
  }
}

/**
 * Маппинг severity на variant для Badge
 */
export const severityVariant = {
  critical: "destructive" as const,
  high: "destructive" as const,
  medium: "default" as const,
  low: "secondary" as const,
}
