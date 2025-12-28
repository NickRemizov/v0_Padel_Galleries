import type { ClusterFace } from "./types"

/**
 * Format date string to DD.MM format
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  try {
    const date = new Date(dateStr)
    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    return `${day}.${month}`
  } catch {
    return ""
  }
}

/**
 * Build tooltip text for face card
 */
export function buildFaceTooltip(face: ClusterFace): string {
  const lines: string[] = []
  
  if (face.gallery_title) {
    const dateStr = face.shoot_date ? ` ${formatDate(face.shoot_date)}` : ""
    lines.push(`Галерея: ${face.gallery_title}${dateStr}`)
  }
  
  if (face.original_filename) {
    lines.push(`Файл: ${face.original_filename}`)
  }
  
  if (face.distance_to_centroid !== undefined) {
    lines.push(`Расстояние до центроида: ${face.distance_to_centroid.toFixed(2)}`)
  }
  
  return lines.join("\n")
}
