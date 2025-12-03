"use server"

// Re-export all server actions from modules with explicit named exports
console.log("[v0] actions/index.ts loaded v1.1.4 with ALL explicit exports")

// Galleries module
export {
  getGalleryFaceRecognitionStatsAction,
  addGalleryAction,
  updateGalleryAction,
  deleteGalleryAction,
} from "./galleries"

// People module
export {
  getPersonPhotosAction,
  getPersonPhotosWithDetailsAction,
  updatePersonAvatarAction,
  verifyPersonOnPhotoAction,
  updatePersonVisibilityAction,
  unlinkPersonFromPhotoAction,
} from "./people"

// Entities module (photographers, locations, organizers, persons)
export {
  addPersonAction,
  updatePersonAction,
  deletePersonAction,
  addPhotographerAction,
  updatePhotographerAction,
  deletePhotographerAction,
  addLocationAction,
  updateLocationAction,
  deleteLocationAction,
  addOrganizerAction,
  updateOrganizerAction,
  deleteOrganizerAction,
} from "./entities"

// Cleanup module
export {
  cleanupDuplicateFacesAction,
  cleanupUnusedFacesAction,
  cleanupDuplicateDescriptorsAction,
  cleanupAllAction,
} from "./cleanup"

// Debug module
export {
  debugPersonPhotosAction,
  runIntegrityCheckAction,
  debugFacesAction,
  debugDescriptorsAction,
} from "./debug"

// Recognition module
export {
  generateMissingDescriptorsAction,
  startAutoRecognitionAction,
  stopAutoRecognitionAction,
  getAutoRecognitionStatusAction,
  recognizeAllAction,
} from "./recognition"

// Auth module
export {
  loginAction,
  logoutAction,
} from "./auth"

// Images module
export {
  deleteGalleryImageAction,
  deleteAllGalleryImagesAction,
  addGalleryImagesAction,
  updateGallerySortOrderAction,
} from "./images"

// Faces module
export {
  savePhotoFaceAction,
  saveFaceDescriptorAction,
} from "./faces"

// Main actions.tsx (faces and images operations - keep last to avoid conflicts)
export {
  savePhotoFaceAction as savePhotoFaceActionMain,
  deletePhotoFaceAction,
  updatePhotoFaceAction,
  saveFaceDescriptorAction as saveFaceDescriptorActionMain,
  getBatchPhotoFacesAction,
  getPhotoFacesAction,
  deleteGalleryImageAction as deleteGalleryImageActionMain,
  addGalleryImagesAction as addGalleryImagesActionMain,
  markPhotoAsProcessedAction,
} from "../actions"
