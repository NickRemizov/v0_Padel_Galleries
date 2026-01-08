/**
 * Calculate object-position for image preview based on face bounding boxes.
 * Centers the crop on the area containing all detected faces.
 */
export function calculateFacePosition(
  imageWidth: number | null | undefined,
  imageHeight: number | null | undefined,
  bboxes: number[][] | null | undefined
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
