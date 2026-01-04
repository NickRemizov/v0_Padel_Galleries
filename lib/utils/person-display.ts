import type { Person } from "@/lib/types"

/**
 * Get secondary identifier for a person to display in parentheses.
 * Priority: telegram_full_name → @telegram_username → gmail
 */
export function getPersonSecondaryInfo(person: Person): string {
  if (person.telegram_full_name) {
    return person.telegram_full_name
  }
  if (person.telegram_username) {
    return person.telegram_username
  }
  if (person.gmail) {
    return person.gmail
  }
  return ""
}

/**
 * Format person display name for dropdown lists.
 * Returns: "Real Name (secondary)" or just "Real Name" if no secondary info
 */
export function formatPersonDisplayName(person: Person): string {
  const secondary = getPersonSecondaryInfo(person)
  if (secondary) {
    return `${person.real_name} (${secondary})`
  }
  return person.real_name
}

/**
 * Get searchable string for person (for Command/Combobox filtering).
 * Includes all possible identifiers for better search.
 */
export function getPersonSearchString(person: Person): string {
  const parts = [person.real_name]
  if (person.telegram_full_name) parts.push(person.telegram_full_name)
  if (person.telegram_username) parts.push(person.telegram_username)
  if (person.gmail) parts.push(person.gmail)
  return parts.join(" ")
}
