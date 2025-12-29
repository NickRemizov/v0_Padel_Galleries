/**
 * Database Integrity Module
 * 
 * Рефакторинг: 785 строк → 10 модулей
 * - DatabaseIntegrityChecker.tsx - Контейнер-оркестратор
 * - types.ts - Типы
 * - hooks/useIntegrityChecker.ts - Состояние и обработчики
 * - utils/helpers.ts - Вспомогательные функции
 * - components/ - UI компоненты
 */

export { DatabaseIntegrityChecker } from "./DatabaseIntegrityChecker"
export type { IntegrityReport } from "./types"
