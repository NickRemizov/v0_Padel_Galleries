/**
 * Face Training Module
 * 
 * Рефакторинг: 750 строк → 9 модулей
 * - FaceTrainingManager.tsx - Контейнер-оркестратор
 * - types.ts - Типы
 * - constants.ts - Константы
 * - hooks/useFaceTraining.ts - Состояние и логика
 * - components/ - UI компоненты
 */

export { FaceTrainingManager } from "./FaceTrainingManager"
export type { TrainingSession, Config, DatasetStats } from "./types"
export { DEFAULT_CONFIG, FASTAPI_URL } from "./constants"
