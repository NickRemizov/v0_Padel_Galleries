import { FACE_COLORS } from "../types"
import type { TaggedFace } from "@/lib/types"

/**
 * Get color for face by index
 */
export function getFaceColor(index: number): string {
  return FACE_COLORS[index % FACE_COLORS.length]
}

/**
 * Get confidence display text for face badge
 */
export function getConfidenceDisplay(face: TaggedFace): string {
  if (face.verified) return " \u2713"
  if (face.recognitionConfidence) return ` (${Math.round(face.recognitionConfidence * 100)}%)`
  return ""
}

/**
 * Calculate rendered image dimensions within canvas for hit testing
 */
export function getRenderedImageDimensions(
  canvas: HTMLCanvasElement,
  mode: "contain" | "cover"
): {
  renderedWidth: number
  renderedHeight: number
  offsetX: number
  offsetY: number
} {
  const rect = canvas.getBoundingClientRect()
  const canvasAspect = canvas.width / canvas.height
  const displayAspect = rect.width / rect.height

  let renderedWidth: number
  let renderedHeight: number
  let offsetX: number
  let offsetY: number

  if (mode === "contain") {
    if (canvasAspect > displayAspect) {
      renderedWidth = rect.width
      renderedHeight = rect.width / canvasAspect
      offsetX = 0
      offsetY = (rect.height - renderedHeight) / 2
    } else {
      renderedHeight = rect.height
      renderedWidth = rect.height * canvasAspect
      offsetX = (rect.width - renderedWidth) / 2
      offsetY = 0
    }
  } else {
    // cover mode
    if (canvasAspect > displayAspect) {
      renderedHeight = rect.height
      renderedWidth = rect.height * canvasAspect
      offsetX = (rect.width - renderedWidth) / 2
      offsetY = 0
    } else {
      renderedWidth = rect.width
      renderedHeight = rect.width / canvasAspect
      offsetX = 0
      offsetY = (rect.height - renderedHeight) / 2
    }
  }

  return { renderedWidth, renderedHeight, offsetX, offsetY }
}
