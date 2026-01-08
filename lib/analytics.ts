import posthog from "posthog-js"

/**
 * Analytics helper for tracking events.
 * All events are sent to PostHog if configured.
 */

// User identification
export function identifyUser(userId: string, properties?: Record<string, any>) {
  if (typeof window === "undefined") return
  posthog.identify(userId, properties)
}

export function resetUser() {
  if (typeof window === "undefined") return
  posthog.reset()
}

// Auth events
export function trackLogin(method: "telegram" | "google") {
  posthog.capture("user_logged_in", { method })
}

export function trackLogout() {
  posthog.capture("user_logged_out")
}

// Gallery events
export function trackGalleryView(galleryId: string, galleryTitle: string) {
  posthog.capture("gallery_viewed", {
    gallery_id: galleryId,
    gallery_title: galleryTitle,
  })
}

export function trackPhotoView(photoId: string, galleryId: string) {
  posthog.capture("photo_viewed", {
    photo_id: photoId,
    gallery_id: galleryId,
  })
}

export function trackPhotoDownload(photoId: string, galleryId: string) {
  posthog.capture("photo_downloaded", {
    photo_id: photoId,
    gallery_id: galleryId,
  })
}

// Player events
export function trackPlayerView(playerId: string, playerName: string) {
  posthog.capture("player_viewed", {
    player_id: playerId,
    player_name: playerName,
  })
}

// My photos events
export function trackPhotoVerified(photoFaceId: string) {
  posthog.capture("photo_verified", { photo_face_id: photoFaceId })
}

export function trackPhotoRejected(photoFaceId: string) {
  posthog.capture("photo_rejected", { photo_face_id: photoFaceId })
}

export function trackPhotoHidden(photoFaceId: string) {
  posthog.capture("photo_hidden", { photo_face_id: photoFaceId })
}

// Settings events
export function trackSettingsChanged(setting: string, value: any) {
  posthog.capture("setting_changed", { setting, value })
}

// Welcome events
export function trackWelcomeSeen(version: number) {
  posthog.capture("welcome_seen", { version })
}

// Generic event
export function trackEvent(name: string, properties?: Record<string, any>) {
  posthog.capture(name, properties)
}
