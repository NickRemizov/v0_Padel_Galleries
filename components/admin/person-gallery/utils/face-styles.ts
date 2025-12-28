import type { BoundingBox } from "../types"

/**
 * Calculate background styles for face-centered thumbnails.
 *
 * Algorithm:
 * 1. Scale: face height should be ~25% of container. Max zoom 3.5x, min 1x (never shrink)
 * 2. Horizontal: center face, but don't go beyond image edges
 * 3. Vertical: face center at 1/4 from top, but don't go beyond image edges
 */
export function calculateFaceStyles(
  bbox: BoundingBox | null | undefined,
  imgWidth: number,
  imgHeight: number,
): { backgroundSize: string; backgroundPosition: string } | null {
  // Validate bbox
  if (!bbox || typeof bbox !== "object") return null

  const { x, y, width, height } = bbox

  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number")
    return null

  if (width <= 0 || height <= 0 || imgWidth <= 0 || imgHeight <= 0) return null

  const imageAspect = imgWidth / imgHeight
  const isLandscape = imageAspect >= 1

  // === STEP 1: Calculate scale ===
  // Target: face height = 25% of container height
  const targetFaceHeight = 0.25
  const faceHeightRatio = height / imgHeight

  let scale: number
  if (isLandscape) {
    // Landscape: container height = image height at scale 1
    scale = targetFaceHeight / faceHeightRatio
  } else {
    // Portrait: container height shows more of image height
    scale = (targetFaceHeight * imageAspect) / faceHeightRatio
  }

  // Clamp scale: never shrink (min 1), max zoom 3.5x
  scale = Math.max(1, Math.min(scale, 3.5))

  // === STEP 2: Calculate scaled dimensions relative to container ===
  let scaledWidth: number
  let scaledHeight: number
  let backgroundSize: string

  if (isLandscape) {
    // Landscape: height fits container, width overflows
    scaledHeight = scale
    scaledWidth = scale * imageAspect
    backgroundSize = `auto ${scale * 100}%`
  } else {
    // Portrait: width fits container, height overflows
    scaledWidth = scale
    scaledHeight = scale / imageAspect
    backgroundSize = `${scale * 100}% auto`
  }

  // === STEP 3: Calculate position ===
  // Face center in normalized image coordinates (0-1)
  const faceCenterX = (x + width / 2) / imgWidth
  const faceCenterY = (y + height / 2) / imgHeight

  // Target position in container (0-1)
  const targetX = 0.5 // center horizontally
  const targetY = 0.25 // 1/4 from top

  // Calculate required offset to place face center at target position
  let offsetX = faceCenterX * scaledWidth - targetX
  let offsetY = faceCenterY * scaledHeight - targetY

  // Clamp offsets so we don't show beyond image edges
  const maxOffsetX = Math.max(0, scaledWidth - 1)
  const maxOffsetY = Math.max(0, scaledHeight - 1)

  offsetX = Math.max(0, Math.min(offsetX, maxOffsetX))
  offsetY = Math.max(0, Math.min(offsetY, maxOffsetY))

  // Convert to background-position percentage
  let bgPosX: number
  let bgPosY: number

  if (maxOffsetX > 0) {
    bgPosX = (offsetX / maxOffsetX) * 100
  } else {
    bgPosX = 50 // centered, no overflow
  }

  if (maxOffsetY > 0) {
    bgPosY = (offsetY / maxOffsetY) * 100
  } else {
    bgPosY = 50 // centered, no overflow
  }

  return {
    backgroundSize,
    backgroundPosition: `${bgPosX}% ${bgPosY}%`,
  }
}
