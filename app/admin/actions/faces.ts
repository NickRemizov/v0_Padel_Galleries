/**
 * @deprecated Этот файл сохранён для обратной совместимости.
 * Используйте импорт из "@/app/admin/actions/faces"
 *
 * Рефакторинг: 520 строк → 5 модулей в папке faces/
 */

export {
  // Photo processing
  processPhotoAction,
  markPhotoAsProcessedAction,
  // Face CRUD
  getPhotoFacesAction,
  savePhotoFaceAction,
  updatePhotoFaceAction,
  deletePhotoFaceAction,
  // Face batch operations
  getBatchPhotoFacesAction,
  batchVerifyFacesAction,
  assignFacesToPersonAction,
  // Gallery images
  deleteGalleryImageAction,
  batchDeleteGalleryImagesAction,
  deleteAllGalleryImagesAction,
  addGalleryImagesAction,
  // Recognition
  clusterUnknownFacesAction,
  recognizeUnknownFacesAction,
} from "./faces/index"
