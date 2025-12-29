/**
 * Integrity Module
 * Проверка и исправление целостности базы данных
 *
 * Рефакторинг: 926 строк → 7 файлов
 * - types.ts: Типы IntegrityReport, IntegrityActionResult
 * - constants.ts: CONFIDENCE_100_THRESHOLD, DUPLICATE_CHECK_FIELDS
 * - utils.ts: getConfidenceThreshold, loadAllPhotoFaces
 * - check-integrity.ts: Главная функция проверки
 * - fix-integrity.ts: Исправление проблем
 * - face-actions.ts: Действия с лицами
 */

// Types
export type { IntegrityReport, IntegrityActionResult, FixResult } from "./types"

// Constants
export { CONFIDENCE_100_THRESHOLD, DUPLICATE_CHECK_FIELDS } from "./constants"

// Check functions
export {
  checkDatabaseIntegrityFullAction,
  checkDatabaseIntegrityAction,
} from "./check-integrity"

// Fix functions
export {
  fixIntegrityIssuesAction,
  fixIntegrityIssueAction,
} from "./fix-integrity"

// Face actions
export {
  getIssueDetailsAction,
  confirmFaceAction,
  rejectFaceAction,
} from "./face-actions"
