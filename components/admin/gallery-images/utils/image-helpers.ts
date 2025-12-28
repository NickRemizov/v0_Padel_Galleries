/**
 * Format file size in KB
 */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "N/A"
  const kb = bytes / 1024
  return `${kb.toFixed(1)} KB`
}

/**
 * Format date as DD.MM
 */
export function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}`
}

/**
 * Calculate object-position for image preview based on face bounding boxes.
 * Centers the crop on the area containing all detected faces.
 */
export function calculateFacePosition(
  imageWidth: number | null,
  imageHeight: number | null,
  bboxes: number[][] | null
): string {
  if (!imageWidth || !imageHeight || !bboxes || bboxes.length === 0) return "center"

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const bbox of bboxes) {
    if (bbox.length >= 4) {
      minX = Math.min(minX, bbox[0])
      minY = Math.min(minY, bbox[1])
      maxX = Math.max(maxX, bbox[2])
      maxY = Math.max(maxY, bbox[3])
    }
  }

  if (minX === Infinity) return "center"

  const faceCenterX = (minX + maxX) / 2
  const faceCenterY = (minY + maxY) / 2
  const isHorizontal = imageWidth > imageHeight
  const shortSide = Math.min(imageWidth, imageHeight)

  if (isHorizontal) {
    const maxOffset = imageWidth - shortSide
    if (maxOffset <= 0) return "center"
    const offset = Math.max(0, Math.min(faceCenterX - shortSide / 2, maxOffset))
    return `${(offset / maxOffset * 100).toFixed(1)}% 50%`
  } else {
    const maxOffset = imageHeight - shortSide
    if (maxOffset <= 0) return "center"
    const offset = Math.max(0, Math.min(faceCenterY - shortSide / 2, maxOffset))
    return `50% ${(offset / maxOffset * 100).toFixed(1)}%`
  }
}

/**
 * Get image dimensions from a File object
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
