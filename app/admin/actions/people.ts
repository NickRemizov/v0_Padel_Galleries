/**
 * @deprecated Этот файл сохранён для обратной совместимости.
 * Используйте импорт из "@/app/admin/actions/people"
 *
 * Рефакторинг: 670 строк → 6 модулей в папке people/
 */

export {
  // Types
  type EmbeddingResult,
  type ConsistencyData,
  type ConsistencyAuditResult,
  type ConsistencyAuditData,
  type MassAuditPersonResult,
  type MassAuditData,
  type DuplicateField,
  type DuplicateGroup,
  type DuplicatePerson,
  DUPLICATE_CHECK_FIELDS,
  // Photo actions
  getPersonPhotosWithDetailsAction,
  verifyPersonOnPhotoAction,
  batchVerifyPersonOnPhotosAction,
  unlinkPersonFromPhotoAction,
  // Embedding consistency
  getEmbeddingConsistencyAction,
  clearFaceDescriptorAction,
  setFaceExcludedAction,
  clearPersonOutliersAction,
  // Consistency audit
  runConsistencyAuditAction,
  auditAllEmbeddingsAction,
  // Duplicate people
  findDuplicatePeopleAction,
  deletePersonWithUnlinkAction,
  mergePeopleAction,
} from "./people/index"
