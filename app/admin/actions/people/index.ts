/**
 * People Actions Module
 * 
 * Рефакторинг: 670 строк → 6 модулей
 * - types.ts - Типы и интерфейсы
 * - photo-actions.ts - Действия с фото (verify, unlink)
 * - embedding-consistency.ts - Анализ консистентности
 * - consistency-audit.ts - Аудит всех игроков
 * - duplicate-people.ts - Поиск и объединение дублей
 * 
 * @refactored 2025-12-29
 */

// Types
export type {
  EmbeddingResult,
  ConsistencyData,
  ConsistencyAuditResult,
  ConsistencyAuditData,
  MassAuditPersonResult,
  MassAuditData,
  DuplicateField,
  DuplicateGroup,
  DuplicatePerson,
} from "./types"

export { DUPLICATE_CHECK_FIELDS } from "./types"

// Photo actions
export {
  getPersonPhotosWithDetailsAction,
  verifyPersonOnPhotoAction,
  batchVerifyPersonOnPhotosAction,
  unlinkPersonFromPhotoAction,
} from "./photo-actions"

// Embedding consistency
export {
  getEmbeddingConsistencyAction,
  clearFaceDescriptorAction,
  setFaceExcludedAction,
  clearPersonOutliersAction,
} from "./embedding-consistency"

// Consistency audit
export {
  runConsistencyAuditAction,
  auditAllEmbeddingsAction,
} from "./consistency-audit"

// Duplicate people
export {
  findDuplicatePeopleAction,
  deletePersonWithUnlinkAction,
  mergePeopleAction,
} from "./duplicate-people"
