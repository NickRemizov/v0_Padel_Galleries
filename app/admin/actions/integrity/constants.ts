/**
 * Integrity Module Constants
 * Константы для проверки целостности
 */

/**
 * Поля для проверки дубликатов игроков
 */
export const DUPLICATE_CHECK_FIELDS = [
  "gmail",
  "telegram_username",
  "telegram_profile_url",
  "facebook_profile_url",
  "instagram_profile_url",
] as const

/**
 * Threshold for float comparison (0.99 ≈ 100%)
 * v2.1: Changed from 0.9999 to 0.99 to catch all near-100% values
 */
export const CONFIDENCE_100_THRESHOLD = 0.99
