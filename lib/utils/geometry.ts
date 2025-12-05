/**
 * Geometry utility functions for bounding box operations
 * v2.5.0 - Centralized geometry calculations
 */

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes
 * IoU measures the overlap between two boxes (0 = no overlap, 1 = perfect match)
 *
 * @param box1 - First bounding box
 * @param box2 - Second bounding box
 * @returns IoU value between 0 and 1
 */
export function calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
  if (!box1 || !box2) return 0

  // Calculate intersection rectangle coordinates
  const x1 = Math.max(box1.x, box2.x)
  const y1 = Math.max(box1.y, box2.y)
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width)
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height)

  // No intersection if boxes don't overlap
  if (x2 < x1 || y2 < y1) return 0

  // Calculate areas
  const intersection = (x2 - x1) * (y2 - y1)
  const area1 = box1.width * box1.height
  const area2 = box2.width * box2.height
  const union = area1 + area2 - intersection

  return union > 0 ? intersection / union : 0
}
