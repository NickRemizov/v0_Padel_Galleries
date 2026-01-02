/**
 * Faces Actions Module
 * 
 * Рефакторинг: 520 строк → 5 модулей
 * - photo-processing.ts - Обработка фото
 * - face-crud.ts - CRUD операции с лицами
 * - face-batch.ts - Пакетные операции
 * - gallery-images.ts - Управление изображениями галереи
 * - recognition.ts - Распознавание лиц
 * 
 * @refactored 2025-12-29
 */

// Photo processing
export {
  processPhotoAction,
  markPhotoAsProcessedAction,
} from "./photo-processing"

// Face CRUD
export {
  getPhotoFacesAction,
  savePhotoFaceAction,
  updatePhotoFaceAction,
  deletePhotoFaceAction,
} from "./face-crud"

// Face batch operations
export {
  getBatchPhotoFacesAction,
  batchVerifyFacesAction,
  assignFacesToPersonAction,
} from "./face-batch"

// Gallery images
export {
  deleteGalleryImageAction,
  batchDeleteGalleryImagesAction,
  deleteAllGalleryImagesAction,
  addGalleryImagesAction,
  toggleImageFeaturedAction,
} from "./gallery-images"

// Recognition
export {
  clusterUnknownFacesAction,
  recognizeUnknownFacesAction,
} from "./recognition"

// Index operations
export {
  getIndexStatusAction,
  rebuildIndexAction,
  type IndexStatus,
} from "./index-operations"
