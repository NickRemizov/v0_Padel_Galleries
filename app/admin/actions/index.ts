console.log("[v0] actions/index.ts loaded v1.1.4 - simple re-exports")

// Galleries module
export * from "./galleries"

// People module
export * from "./people"

// Entities module (photographers, locations, organizers, persons)
export * from "./entities"

// Cleanup module
export * from "./cleanup"

// Debug module
export * from "./debug"

// Recognition module
export * from "./recognition"

// Auth module
export * from "./auth"

// Images module
export * from "./images"

// Faces module
export * from "./faces"

// Main actions.tsx exported last to avoid conflicts
export * from "../actions"
