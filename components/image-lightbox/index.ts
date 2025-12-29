/**
 * Image Lightbox Module
 * 
 * Рефакторинг: 600 строк → 8 модулей
 * - types.ts - Типы
 * - hooks/ - Хуки (state, swipe navigation)
 * - utils/ - Форматирование
 * - components/ - UI компоненты
 * - ImageLightbox.tsx - Контейнер
 * 
 * @refactored 2025-12-29
 */

export { ImageLightbox } from "./ImageLightbox"
export type { ImageLightboxProps, LightboxImage, VerifiedPerson } from "./types"
