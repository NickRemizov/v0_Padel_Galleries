"use server"

// Re-export all server actions from modules
console.log("[v0] actions/index.ts loaded v1.1.3 with explicit exports")

// Galleries
export {
  getGalleryFaceRecognitionStatsAction,
  addGalleryAction,
  updateGalleryAction,
  deleteGalleryAction,
} from "./galleries"

// People
export * from "./people"

// Entities (photographers, locations, organizers)
export * from "./entities"

// Cleanup
export * from "./cleanup"

// Debug
export * from "./debug"

// Recognition
export * from "./recognition"

// Auth
export * from "./auth"

// Images (additional functions like updateGallerySortOrderAction)
export * from "./images"

// Faces and images from main actions.tsx (last to avoid overriding module exports)
export * from "../actions"
